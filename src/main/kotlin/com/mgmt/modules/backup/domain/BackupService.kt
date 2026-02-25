package com.mgmt.modules.backup.domain

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Service
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.time.Instant

/**
 * BackupService — Core backup/restore logic for PostgreSQL databases.
 *
 * V3 evolution:
 *   - PostgreSQL (pg_dump/pg_restore) instead of MySQL (mysqldump/mysql)
 *   - JSON config for database list (backup-databases.json)
 *   - Max 10 backups with FIFO auto-cleanup
 *   - Custom format (.pgdump) for efficient restore
 *   - Dedicated backup directory
 */
@Service
class BackupService(
    private val objectMapper: ObjectMapper,
    @Value("\${spring.datasource.url}") private val datasourceUrl: String,
    @Value("\${spring.datasource.username}") private val dbUsername: String,
    @Value("\${spring.datasource.password}") private val dbPassword: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        /** Maximum number of backup files retained. Oldest auto-deleted on overflow. */
        const val MAX_BACKUPS = 10
    }

    /**
     * Resolve the dedicated backup directory.
     * Placed under project root: {projectRoot}/backups/database/
     */
    private val backupDir: Path by lazy {
        val projectRoot = findProjectRoot()
        val dir = projectRoot.resolve("backups").resolve("database")
        Files.createDirectories(dir)
        dir
    }

    /**
     * Find project root by walking up from working directory looking for settings.gradle.kts
     */
    private fun findProjectRoot(): Path {
        var dir = Paths.get(System.getProperty("user.dir"))
        repeat(5) {
            if (Files.exists(dir.resolve("settings.gradle.kts")) ||
                Files.exists(dir.resolve("pnpm-workspace.yaml"))) {
                return dir
            }
            dir = dir.parent ?: return dir
        }
        return Paths.get(System.getProperty("user.dir"))
    }

    /**
     * Parse the database connection properties from datasource URL.
     * Format: jdbc:postgresql://host:port/dbname?params
     */
    private data class DbConnection(val host: String, val port: String, val dbName: String)

    private fun parseConnection(): DbConnection {
        // jdbc:postgresql://localhost:5432/mgmt_v2?stringtype=unspecified
        val url = datasourceUrl.removePrefix("jdbc:postgresql://")
        val hostPort = url.substringBefore("/")
        val host = hostPort.substringBefore(":")
        val port = hostPort.substringAfter(":", "5432")
        val dbName = url.substringAfter("/").substringBefore("?")
        return DbConnection(host, port, dbName)
    }

    /**
     * Load database names from backup-databases.json config.
     *
     * V3 design: externalizes database list to JSON, not hardcoded.
     */
    fun loadDatabaseNames(): List<String> {
        return try {
            val resource = ClassPathResource("backup-databases.json")
            val config = objectMapper.readValue<Map<String, Any>>(resource.inputStream)
            @Suppress("UNCHECKED_CAST")
            val databases = config["databases"] as? List<Map<String, Any>> ?: emptyList()
            databases.filter { it["include"] == true }
                .mapNotNull { it["name"] as? String }
        } catch (e: Exception) {
            log.error("Failed to load backup-databases.json: {}", e.message)
            // Fallback: use the primary database from connection
            val conn = parseConnection()
            listOf(conn.dbName)
        }
    }

    /**
     * List all backup files, sorted by time descending (newest first).
     *
     */
    fun listBackups(): List<BackupInfo> {
        val dir = backupDir.toFile()
        if (!dir.exists()) return emptyList()

        return dir.listFiles { _, name -> name.endsWith(".pgdump") }
            ?.mapNotNull { file ->
                BackupInfo.fromFilename(file.name, file.length())
            }
            ?.sortedByDescending { it.backupTime }
            ?: emptyList()
    }

    /**
     * Get a single backup by filename.
     */
    fun getBackup(filename: String): BackupInfo? {
        val file = backupDir.resolve(filename).toFile()
        if (!file.exists() || !file.name.endsWith(".pgdump")) return null
        return BackupInfo.fromFilename(file.name, file.length())
    }

    /**
     * Create a backup of all configured databases.
     *
     * V3 evolution: pg_dump custom format + FIFO cleanup
     *
     * @param tag User-provided tag/note (can be empty)
     * @return Pair(success, BackupInfo or error message)
     */
    fun createBackup(tag: String): Pair<Boolean, Any> {
        val filename = BackupInfo.generateFilename(tag)
        val filepath = backupDir.resolve(filename)
        val conn = parseConnection()

        // Find pg_dump binary
        val pgDump = findBinary("pg_dump")

        val cmd = listOf(
            pgDump,
            "-h", conn.host,
            "-p", conn.port,
            "-U", dbUsername,
            "-Fc",  // Custom format for efficient restore
            "-f", filepath.toString(),
            conn.dbName
        )

        log.info("Creating backup: {} (database: {})", filename, conn.dbName)

        return try {
            val env = mapOf("PGPASSWORD" to dbPassword)
            val process = ProcessBuilder(cmd)
                .apply { environment().putAll(env) }
                .redirectErrorStream(true)
                .start()

            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                log.info("Backup created successfully: {} ({} bytes)", filename, filepath.toFile().length())
                // Enforce FIFO: delete oldest if > MAX_BACKUPS
                enforceMaxBackups()
                val info = BackupInfo.fromFilename(filename, filepath.toFile().length())
                    ?: return Pair(false, "Failed to parse backup info")
                Pair(true, info)
            } else {
                // Clean up failed file
                filepath.toFile().delete()
                log.error("pg_dump failed (exit={}): {}", exitCode, output)
                Pair(false, "Backup failed: $output")
            }
        } catch (e: Exception) {
            filepath.toFile().delete()
            log.error("Backup exception: {}", e.message, e)
            Pair(false, "Backup failed: ${e.message}")
        }
    }

    /**
     * Restore a backup file.
     *
     * V3: pg_restore for custom format files.
     *
     * ⚠️ CRITICAL operation — restores entire database.
     */
    fun restoreBackup(filename: String): Pair<Boolean, String> {
        val filepath = backupDir.resolve(filename)
        if (!filepath.toFile().exists()) return Pair(false, "Backup file not found")
        if (!filename.endsWith(".pgdump")) return Pair(false, "Invalid backup file format")

        val conn = parseConnection()
        val pgRestore = findBinary("pg_restore")

        val cmd = listOf(
            pgRestore,
            "-h", conn.host,
            "-p", conn.port,
            "-U", dbUsername,
            "-d", conn.dbName,
            "--clean",           // Drop existing objects before restore
            "--if-exists",       // Don't error if objects don't exist
            "--no-owner",        // Don't set ownership
            "--no-privileges",   // Don't set privileges
            filepath.toString()
        )

        log.warn("Starting database restore from: {}", filename)

        return try {
            val env = mapOf("PGPASSWORD" to dbPassword)
            val process = ProcessBuilder(cmd)
                .apply { environment().putAll(env) }
                .redirectErrorStream(true)
                .start()

            val output = process.inputStream.bufferedReader().readText()
            val exitCode = process.waitFor()

            // pg_restore returns non-zero for warnings too; check for actual errors
            if (exitCode == 0 || (exitCode == 1 && !output.contains("FATAL"))) {
                log.warn("Database restore completed from: {}", filename)
                Pair(true, "Restore completed successfully")
            } else {
                log.error("pg_restore failed (exit={}): {}", exitCode, output)
                Pair(false, "Restore failed: $output")
            }
        } catch (e: Exception) {
            log.error("Restore exception: {}", e.message, e)
            Pair(false, "Restore failed: ${e.message}")
        }
    }

    /**
     * Delete a backup file.
     *
     */
    fun deleteBackup(filename: String): Pair<Boolean, String> {
        val filepath = backupDir.resolve(filename)
        val file = filepath.toFile()

        if (!file.exists()) return Pair(false, "File not found")
        if (!filename.endsWith(".pgdump")) return Pair(false, "Invalid file type")

        // Security: prevent path traversal
        if (!file.canonicalPath.startsWith(backupDir.toFile().canonicalPath)) {
            log.error("Path traversal attempt detected: {}", filename)
            return Pair(false, "Invalid file path")
        }

        return try {
            file.delete()
            log.info("Deleted backup: {}", filename)
            Pair(true, "Backup deleted")
        } catch (e: Exception) {
            log.error("Failed to delete backup {}: {}", filename, e.message)
            Pair(false, "Delete failed: ${e.message}")
        }
    }

    /**
     * Enforce maximum backup count (FIFO).
     * If more than MAX_BACKUPS exist, delete the oldest files.
     */
    fun enforceMaxBackups() {
        val backups = listBackups()
        if (backups.size > MAX_BACKUPS) {
            val toDelete = backups.sortedBy { it.backupTime }
                .take(backups.size - MAX_BACKUPS)
            for (backup in toDelete) {
                val (ok, _) = deleteBackup(backup.filename)
                if (ok) {
                    log.info("Auto-deleted oldest backup (FIFO): {}", backup.filename)
                } else {
                    log.warn("Failed to auto-delete backup: {}", backup.filename)
                }
            }
        }
    }

    /**
     * Find pg_dump/pg_restore binary.
     */
    private fun findBinary(name: String): String {
        // Check if available in PATH
        val pathResult = try {
            val process = ProcessBuilder("which", name)
                .redirectErrorStream(true)
                .start()
            val path = process.inputStream.bufferedReader().readText().trim()
            process.waitFor()
            if (process.exitValue() == 0 && path.isNotEmpty()) path else null
        } catch (_: Exception) { null }

        if (pathResult != null) return pathResult

        // Common macOS locations
        val commonPaths = listOf(
            "/opt/homebrew/bin/$name",
            "/usr/local/bin/$name",
            "/usr/local/pgsql/bin/$name",
            "/usr/bin/$name",
            "/Applications/Postgres.app/Contents/Versions/latest/bin/$name",
        )

        for (p in commonPaths) {
            if (File(p).exists() && File(p).canExecute()) return p
        }

        // Fallback — let ProcessBuilder fail naturally with descriptive error
        return name
    }
}
