package com.mgmt.modules.backup.application

import com.fasterxml.jackson.annotation.JsonInclude
import jakarta.validation.constraints.Size

/**
 * Backup Module DTOs — Request/Response data transfer objects.
 *
 * V3 architecture: clean separation between API and domain layers.
 */

// ── Response DTOs ──────────────────────────────────────────

/** Backup list item (desensitized: shows date + tag, NOT raw filename) */
data class BackupListItem(
    val id: String,            // filename (used as ID for API operations)
    val displayDate: String,   // "2026 02 24"
    val tag: String,           // User-provided note (can be empty)
    val size: String,          // "1.2 MB"
)

/** Backup detail response */
data class BackupDetailResponse(
    val id: String,
    val displayDate: String,
    val detailDate: String,    // "2026-02-24 20:15:00"
    val tag: String,
    val size: String,
    val sizeBytes: Long,
    val databases: List<String>,  // Which databases are included
)

/** Backup creation response */
data class BackupCreateResponse(
    val id: String,
    val displayDate: String,
    val tag: String,
    val size: String,
    val message: String,
)

/** Generic operation result */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class BackupOperationResult(
    val message: String,
    val backupId: String? = null,
)

// ── Request DTOs ──────────────────────────────────────────

/** Create backup request */
data class CreateBackupRequest(
    @field:Size(max = 100, message = "Tag must be 100 characters or less")
    val tag: String? = null,

    // Security codes (handled by @SecurityLevel AOP, included for body parsing)
    val sec_code_l0: String? = null,
    val sec_code_l1: String? = null,
    val sec_code_l2: String? = null,
    val sec_code_l3: String? = null,
    val sec_code_l4: String? = null,
)

/** Restore backup request */
data class RestoreBackupRequest(
    // Security codes (L4 — system level)
    val sec_code_l0: String? = null,
    val sec_code_l1: String? = null,
    val sec_code_l2: String? = null,
    val sec_code_l3: String? = null,
    val sec_code_l4: String? = null,
)

/** Delete backup request */
data class DeleteBackupRequest(
    // Security codes (L3 — db level)
    val sec_code_l0: String? = null,
    val sec_code_l1: String? = null,
    val sec_code_l2: String? = null,
    val sec_code_l3: String? = null,
    val sec_code_l4: String? = null,
)
