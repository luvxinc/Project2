package com.mgmt.modules.backup.infrastructure

import com.mgmt.modules.backup.domain.BackupService
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

/**
 * BackupScheduler — Automated monthly backup + FIFO cleanup.
 *
 * User requirement: 每月最后一天 23:59:59 自动备份
 *
 * Implementation: Spring @Scheduled cron runs daily at 23:59:59 Pacific Time.
 * On the last day of each month, it triggers a "Monthly Auto" backup.
 * FIFO cleanup (max 10) is enforced after each backup.
 *
 * Iron Law R1: All times in America/Los_Angeles (Pacific).
 */
@Component
class BackupScheduler(
    private val backupService: BackupService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Runs at 23:59:59 on the last day of every month (Pacific Time).
     *
     * Spring cron: second minute hour dayOfMonth month dayOfWeek
     * "L" in dayOfMonth = last day of month.
     */
    @Scheduled(cron = "59 59 23 L * ?", zone = "America/Los_Angeles")
    fun monthlyAutoBackup() {
        log.info("Starting scheduled monthly auto-backup...")

        try {
            val (success, result) = backupService.createBackup("Monthly_Auto")
            if (success) {
                log.info("Monthly auto-backup completed successfully: {}", result)
            } else {
                log.error("Monthly auto-backup FAILED: {}", result)
            }
        } catch (e: Exception) {
            log.error("Monthly auto-backup exception: {}", e.message, e)
        }
    }
}
