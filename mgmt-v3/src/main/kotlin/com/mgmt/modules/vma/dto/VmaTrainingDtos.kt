package com.mgmt.modules.vma.dto

import java.time.Instant

// ─── Training SOP DTOs ──────────────────────────────────

data class CreateTrainingSopRequest(
    val seqNo: Int,
    val sopNo: String,
    val name: String,
    val description: String? = null,
    val structureClassification: String,
    val documentType: String,
    // Initial version
    val version: String,
    val daNo: String,
    val effectiveDate: String,
    val trainingRequired: Boolean? = true,
)

data class UpdateTrainingSopRequest(
    val name: String? = null,
    val description: String? = null,
    val structureClassification: String? = null,
    val documentType: String? = null,
    // Version-level fields (updates latest version)
    val version: String? = null,
    val daNo: String? = null,
    val effectiveDate: String? = null,
    val trainingRequired: Boolean? = null,
)

data class AddSopVersionRequest(
    val version: String,
    val daNo: String,
    val effectiveDate: String,
    val trainingRequired: Boolean? = true,
)

data class TrainingSopResponse(
    val id: String,
    val seqNo: Int,
    val sopNo: String,
    val name: String,
    val description: String?,
    val structureClassification: String,
    val documentType: String,
    val status: String,
    // Latest version shortcut (backward compat)
    val version: String,
    val daNo: String,
    val effectiveDate: Instant,
    val trainingRequired: Boolean,
    // Full version list
    val versions: List<SopVersionResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class SopVersionResponse(
    val id: String,
    val version: String,
    val daNo: String,
    val effectiveDate: Instant,
    val trainingRequired: Boolean,
)

// ─── Training Record DTOs ───────────────────────────────

data class CreateTrainingRecordRequest(
    val employeeNo: String,
    val sopNo: String,
    val sopVersion: String,
    val completedAt: String? = null,
    val trainerId: String? = null,
    val trainingDate: String,
    val trainingNo: String? = null,
    val trainingLocation: String? = null,
    val trainingDuration: Int? = null,
)

data class UpdateTrainingRecordRequest(
    val completedAt: String? = null,
    val trainerId: String? = null,
    val trainingDate: String? = null,
    val trainingNo: String? = null,
    val trainingLocation: String? = null,
    val trainingDuration: Int? = null,
)

// ─── Training Session DTOs ──────────────────────────────

data class TrainingSessionResponse(
    val id: String,
    val trainingNo: String,
    val trainingDate: Instant,
    val trainingSubject: String,
    val trainingObjective: String,
    val evaluationMethod: String,
    val lecturerNo: String,
    val lecturerName: String,
    val trainingTimeStart: String?,
    val trainingTimeEnd: String?,
    val trainingPlace: String,
    val attendCount: Int,
    val passCount: Int,
    val recordedDate: Instant?,
    val pdfUrl: String?,
    val records: List<TrainingRecordBrief>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class TrainingRecordBrief(
    val id: String,
    val employeeNo: String,
    val sopNo: String,
    val sopVersion: String,
    val completedAt: Instant?,
    val trainingDate: Instant,
)

// ─── Training Status / Matrix / Roadmap DTOs ────────────

data class EmployeeTrainingStatusResponse(
    val employeeNo: String,
    val lastName: String,
    val firstName: String,
    val hireDate: Instant,
    val totalRequired: Int,
    val completedCount: Int,
    val missingCount: Int,
    val missingSops: List<MissingSopItem>,
    val status: String,  // COMPLETE | MISSING
)

data class MissingSopItem(
    val sopNo: String,
    val name: String,
    val version: String,
    val daNo: String,
    val effectiveDate: Instant,
)

data class TrainingMatrixResponse(
    val generatedAt: String,
    val sopColumns: List<SopColumnDef>,
    val rows: List<MatrixRow>,
    val summary: MatrixSummary,
)

data class SopColumnDef(
    val sopNo: String,
    val name: String,
    val seqNo: Int,
    val latestVersion: String,
)

data class MatrixRow(
    val employeeNo: String,
    val lastName: String,
    val firstName: String,
    val hireDate: Instant,
    val departments: List<String>,
    val cells: Map<String, String>,  // sopNo → "completed" | "missing" | "na"
    val totalRequired: Int,
    val completedCount: Int,
    val missingCount: Int,
    val completionRate: Int,
)

data class MatrixSummary(
    val totalEmployees: Int,
    val totalSops: Int,
    val fullyCompliant: Int,
    val overallCompletionRate: Int,
)

// ─── SmartFill DTOs ─────────────────────────────────────

data class SmartFillRequest(
    val cutoffDate: String,
    val lecturerNo: String,
)

data class SmartFillResponse(
    val message: String,
    val sessions: List<SmartFillSessionSummary>,
)

data class SmartFillSessionSummary(
    val trainingNo: String,
    val date: Instant,
    val subject: String,
    val employees: Int,
    val sops: Int,
    val time: String,
)
