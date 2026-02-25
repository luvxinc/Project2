package com.mgmt.modules.backup.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.backup.application.*
import com.mgmt.modules.backup.domain.BackupInfo
import com.mgmt.modules.backup.domain.BackupService
import jakarta.validation.Valid
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException

/**
 * BackupController — REST API for database backup management.
 *
 * V3 evolution: RESTful JSON API, DDD layering, declarative security.
 *
 * Security:
 *   - All endpoints require 'module.db_admin' permission
 *   - create_backup: L3 (db level security code)
 *   - restore_backup: L4 (system level — nuclear)
 *   - delete_backup: L3 (db level security code)
 *
 * API routes:
 *   GET    /backups          — List all backups
 *   GET    /backups/{id}     — Get backup detail
 *   POST   /backups          — Create new backup
 *   POST   /backups/{id}/restore — Restore from backup
 *   DELETE /backups/{id}     — Delete a backup
 */
@RestController
@RequestMapping("/backups")
class BackupController(
    private val backupService: BackupService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * List all backups (desensitized display).
     *
     * V3: Returns structured JSON with displayDate + tag, not raw filenames.
     */
    @GetMapping
    @RequirePermission("module.db_admin")
    fun listBackups(): ApiResponse<List<BackupListItem>> {
        val backups = backupService.listBackups()
        val items = backups.map { it.toListItem() }
        return ApiResponse.ok(items)
    }

    /**
     * Get backup detail by ID (filename).
     */
    @GetMapping("/{id}")
    @RequirePermission("module.db_admin")
    fun getBackup(@PathVariable id: String): ApiResponse<BackupDetailResponse> {
        val backup = backupService.getBackup(id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Backup not found")
        val databases = backupService.loadDatabaseNames()
        return ApiResponse.ok(backup.toDetailResponse(databases))
    }

    /**
     * Create a new backup.
     *
     * V3: @SecurityLevel(L3) + @AuditLog + @RequirePermission
     */
    @PostMapping
    @SecurityLevel(level = "L3", actionKey = "btn_create_backup")
    @AuditLog(module = "DB_ADMIN", action = "CREATE_BACKUP", riskLevel = "HIGH")
    @RequirePermission("module.db_admin.backup.create")
    fun createBackup(
        @Valid @RequestBody request: CreateBackupRequest,
    ): ApiResponse<BackupCreateResponse> {
        val tag = request.tag?.trim() ?: ""
        val (success, result) = backupService.createBackup(tag)

        if (!success) {
            throw ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                result as? String ?: "Backup failed"
            )
        }

        val info = result as BackupInfo
        return ApiResponse.ok(BackupCreateResponse(
            id = info.filename,
            displayDate = info.displayDate,
            tag = info.tag,
            size = info.displaySize,
            message = "Backup created successfully",
        ))
    }

    /**
     * Restore a backup.
     *
     * V3: @SecurityLevel(L4) — system-level nuclear operation.
     */
    @PostMapping("/{id}/restore")
    @SecurityLevel(level = "L4", actionKey = "btn_restore_db")
    @AuditLog(module = "DB_ADMIN", action = "RESTORE_DATABASE", riskLevel = "CRITICAL")
    @RequirePermission("module.db_admin.backup.restore")
    fun restoreBackup(
        @PathVariable id: String,
        @RequestBody request: RestoreBackupRequest,
    ): ApiResponse<BackupOperationResult> {
        // Verify backup exists
        backupService.getBackup(id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Backup not found")

        log.warn("Database restore initiated for backup: {}", id)
        val (success, message) = backupService.restoreBackup(id)

        if (!success) {
            throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, message)
        }

        return ApiResponse.ok(BackupOperationResult(
            message = message,
            backupId = id,
        ))
    }

    /**
     * Delete a backup.
     *
     */
    @DeleteMapping("/{id}")
    @SecurityLevel(level = "L3", actionKey = "btn_delete_backup")
    @AuditLog(module = "DB_ADMIN", action = "DELETE_BACKUP", riskLevel = "HIGH")
    @RequirePermission("module.db_admin.backup.manage")
    fun deleteBackup(
        @PathVariable id: String,
        @RequestBody(required = false) request: DeleteBackupRequest?,
    ): ApiResponse<BackupOperationResult> {
        // Verify backup exists
        backupService.getBackup(id)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Backup not found")

        val (success, message) = backupService.deleteBackup(id)

        if (!success) {
            throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, message)
        }

        return ApiResponse.ok(BackupOperationResult(message = message))
    }

    // ── Mappers ──────────────────────────────────────────

    private fun BackupInfo.toListItem() = BackupListItem(
        id = filename,
        displayDate = displayDate,
        tag = tag,
        size = displaySize,
    )

    private fun BackupInfo.toDetailResponse(databases: List<String>) = BackupDetailResponse(
        id = filename,
        displayDate = displayDate,
        detailDate = detailDate,
        tag = tag,
        size = displaySize,
        sizeBytes = sizeBytes,
        databases = databases,
    )
}
