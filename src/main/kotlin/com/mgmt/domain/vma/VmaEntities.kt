package com.mgmt.domain.vma

import jakarta.persistence.*
import java.time.Instant
import java.time.LocalDate

// ============================================================
// VMA Employee & Department Entities
// ============================================================

/**
 * VmaDepartment — maps to 'vma_departments' table.
 * Composite uniqueness: (code, duties)
 */
@Entity
@Table(
    name = "vma_departments",
    uniqueConstraints = [UniqueConstraint(columnNames = ["code", "duties"])],
    indexes = [Index(columnList = "code")]
)
class VmaDepartment(
    @Id @Column(length = 36) var id: String = "",
    @Column(nullable = false) var code: String = "",
    @Column(nullable = false) var name: String = "",
    @Column(nullable = false) var duties: String = "",
    @Column(name = "sop_training_req") var sopTrainingReq: String? = null,
    @Column(name = "is_active", nullable = false) var isActive: Boolean = true,
    @Column(name = "deleted_at") var deletedAt: Instant? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

/**
 * VmaEmployee — maps to 'vma_employees' table.
 */
@Entity
@Table(name = "vma_employees", indexes = [
    Index(columnList = "status"), Index(columnList = "employee_no")
])
class VmaEmployee(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "employee_no", unique = true, nullable = false) var employeeNo: String = "",
    @Column(name = "last_name", nullable = false) var lastName: String = "",
    @Column(name = "first_name", nullable = false) var firstName: String = "",
    @Column(name = "hire_date", nullable = false) var hireDate: Instant = Instant.now(),
    @Column(name = "termination_date") var terminationDate: Instant? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var status: VmaEmployeeStatus = VmaEmployeeStatus.ACTIVE,
    @Column(name = "deleted_at") var deletedAt: Instant? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

enum class VmaEmployeeStatus { ACTIVE, INACTIVE }

/**
 * VmaEmployeeDepartment — maps to 'vma_employee_departments' junction table.
 */
@Entity
@Table(name = "vma_employee_departments", indexes = [
    Index(columnList = "employee_id"), Index(columnList = "department_id")
])
class VmaEmployeeDepartment(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "employee_id", nullable = false) var employeeId: String = "",
    @Column(name = "department_id", nullable = false) var departmentId: String = "",
    @Column(name = "assigned_at", nullable = false) var assignedAt: Instant = Instant.now(),
    @Column(name = "removed_at") var removedAt: Instant? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

/**
 * VmaDutySopHistory — maps to 'vma_duty_sop_history' table.
 */
@Entity
@Table(name = "vma_duty_sop_history", indexes = [
    Index(columnList = "department_id"), Index(columnList = "change_date")
])
class VmaDutySopHistory(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "department_id", nullable = false) var departmentId: String = "",
    @Column(name = "change_date", nullable = false) var changeDate: Instant = Instant.now(),
    @Column(name = "change_type", nullable = false) var changeType: String = "",  // INITIAL, ADD, REMOVE
    @Column(name = "sop_no", nullable = false) var sopNo: String = "",
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

// ============================================================
// VMA Training SOP Entities
// ============================================================

/**
 * VmaTrainingSop — maps to 'vma_training_sops' table.
 */
@Entity
@Table(name = "vma_training_sops", indexes = [
    Index(columnList = "status"), Index(columnList = "document_type"),
    Index(columnList = "structure_classification")
])
class VmaTrainingSop(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "seq_no", unique = true, nullable = false) var seqNo: Int = 0,
    @Column(name = "sop_no", unique = true, nullable = false) var sopNo: String = "",
    @Column(nullable = false) var name: String = "",
    var description: String? = null,
    @Column(name = "structure_classification", nullable = false) var structureClassification: String = "",
    @Column(name = "document_type", nullable = false) var documentType: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false) var status: VmaSopStatus = VmaSopStatus.ACTIVE,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

enum class VmaSopStatus { ACTIVE, DEPRECATED }

/**
 * VmaTrainingSopVersion — maps to 'vma_training_sop_versions' table.
 */
@Entity
@Table(
    name = "vma_training_sop_versions",
    uniqueConstraints = [UniqueConstraint(columnNames = ["sop_id", "version"])],
    indexes = [Index(columnList = "sop_id"), Index(columnList = "effective_date")]
)
class VmaTrainingSopVersion(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "sop_id", nullable = false) var sopId: String = "",
    @Column(nullable = false) var version: String = "",
    @Column(name = "da_no", nullable = false) var daNo: String = "",
    @Column(name = "effective_date", nullable = false) var effectiveDate: Instant = Instant.now(),
    @Column(name = "training_required", nullable = false) var trainingRequired: Boolean = true,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

/**
 * VmaDutySopRequirement — maps to 'vma_duty_sop_requirements' junction table.
 */
@Entity
@Table(
    name = "vma_duty_sop_requirements",
    uniqueConstraints = [UniqueConstraint(columnNames = ["duty_id", "sop_no"])],
    indexes = [Index(columnList = "duty_id"), Index(columnList = "sop_no")]
)
class VmaDutySopRequirement(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "duty_id", nullable = false) var dutyId: String = "",
    @Column(name = "sop_no", nullable = false) var sopNo: String = "",
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

// ============================================================
// VMA Training Records Entities
// ============================================================

/**
 * VmaTrainingSession — maps to 'vma_training_sessions' table.
 */
@Entity
@Table(name = "vma_training_sessions", indexes = [
    Index(columnList = "training_date"), Index(columnList = "lecturer_no")
])
class VmaTrainingSession(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "training_no", unique = true, nullable = false) var trainingNo: String = "",
    @Column(name = "training_date", nullable = false) var trainingDate: Instant = Instant.now(),
    @Column(name = "training_subject", nullable = false) var trainingSubject: String = "",
    @Column(name = "training_objective", nullable = false) var trainingObjective: String = "Ensure understanding of updated working procedures and responsibilities",
    @Column(name = "evaluation_method", nullable = false) var evaluationMethod: String = "",
    @Column(name = "lecturer_no", nullable = false) var lecturerNo: String = "",
    @Column(name = "lecturer_name", nullable = false) var lecturerName: String = "",
    @Column(name = "training_time_start") var trainingTimeStart: String? = null,
    @Column(name = "training_time_end") var trainingTimeEnd: String? = null,
    @Column(name = "training_place", nullable = false) var trainingPlace: String = "On-Site",
    @Column(name = "attend_count", nullable = false) var attendCount: Int = 0,
    @Column(name = "pass_count", nullable = false) var passCount: Int = 0,
    @Column(name = "recorded_date") var recordedDate: Instant? = null,
    @Column(name = "pdf_url") var pdfUrl: String? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

/**
 * VmaTrainingRecord — maps to 'vma_training_records' table.
 */
@Entity
@Table(
    name = "vma_training_records",
    uniqueConstraints = [UniqueConstraint(columnNames = ["employee_no", "sop_no", "sop_version"])],
    indexes = [
        Index(columnList = "employee_no"), Index(columnList = "sop_no"),
        Index(columnList = "session_id")
    ]
)
class VmaTrainingRecord(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "session_id") var sessionId: String? = null,
    @Column(name = "employee_no", nullable = false) var employeeNo: String = "",
    @Column(name = "sop_no", nullable = false) var sopNo: String = "",
    @Column(name = "sop_version", nullable = false) var sopVersion: String = "",
    @Column(name = "completed_at") var completedAt: Instant? = null,
    @Column(name = "trainer_id") var trainerId: String? = null,
    @Column(name = "training_date", nullable = false) var trainingDate: Instant = Instant.now(),
    @Column(name = "training_no") var trainingNo: String? = null,
    @Column(name = "training_location") var trainingLocation: String? = null,
    @Column(name = "training_duration") var trainingDuration: Int? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

// ============================================================
// VMA P-Valve Product Entities
// ============================================================

/**
 * VmaPValveProduct — maps to 'vma_pvalve_products' table.
 */
@Entity
@Table(name = "vma_pvalve_products", indexes = [Index(columnList = "model")])
class VmaPValveProduct(
    @Id @Column(length = 36) var id: String = "",
    @Column(nullable = false) var model: String = "",
    @Column(unique = true, nullable = false) var specification: String = "",
    @Column(name = "diameter_a") var diameterA: Double? = null,
    @Column(name = "diameter_b") var diameterB: Double? = null,
    @Column(name = "diameter_c") var diameterC: Double? = null,
    @Column(name = "expanded_length_d") var expandedLengthD: Double? = null,
    @Column(name = "expanded_length_e") var expandedLengthE: Double? = null,
    @Column(name = "crimped_total_length") var crimpedTotalLength: Double? = null,
    @Column(name = "is_active", nullable = false) var isActive: Boolean = true,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

/**
 * VmaDeliverySystemProduct — maps to 'vma_delivery_system_products' table.
 */
@Entity
@Table(name = "vma_delivery_system_products", indexes = [Index(columnList = "model")])
class VmaDeliverySystemProduct(
    @Id @Column(length = 36) var id: String = "",
    @Column(nullable = false) var model: String = "",
    @Column(unique = true, nullable = false) var specification: String = "",
    @Column(name = "is_active", nullable = false) var isActive: Boolean = true,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

/**
 * VmaDeliverySystemFit — maps to 'vma_delivery_system_fits' junction table.
 */
@Entity
@Table(
    name = "vma_delivery_system_fits",
    uniqueConstraints = [UniqueConstraint(columnNames = ["delivery_system_id", "pvalve_id"])],
    indexes = [Index(columnList = "delivery_system_id"), Index(columnList = "pvalve_id")]
)
class VmaDeliverySystemFit(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "delivery_system_id", nullable = false) var deliverySystemId: String = "",
    @Column(name = "pvalve_id", nullable = false) var pvalveId: String = "",
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)

// ============================================================
// VMA Inventory & Clinical Entities
// ============================================================

/**
 * VmaReceivingBatch — maps to 'vma_receiving_batches' table.
 */
@Entity
@Table(name = "vma_receiving_batches", indexes = [Index(columnList = "date_received")])
class VmaReceivingBatch(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "batch_no", unique = true, nullable = false) var batchNo: String = "",
    @Column(name = "po_no") var poNo: String? = null,
    @Column(name = "date_shipped") var dateShipped: LocalDate? = null,
    @Column(name = "date_received", nullable = false) var dateReceived: LocalDate = LocalDate.now(),
    @Column(name = "time_received") var timeReceived: String? = null,
    var operator: String? = null,
    @Column(columnDefinition = "text") var comments: String? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

/**
 * VmaClinicalTrip — maps to 'vma_clinical_trips' table.
 * A Trip is a shared "packing list" — products are checked out together
 * for multiple Cases, then distributed to individual Cases upon return.
 */
@Entity
@Table(name = "vma_clinical_trips", indexes = [
    Index(columnList = "trip_date"), Index(columnList = "status"),
    Index(columnList = "site_id")
])
class VmaClinicalTrip(
    @Id @Column(name = "trip_id") var tripId: String = "",
    @Column(name = "trip_date", nullable = false) var tripDate: LocalDate = LocalDate.now(),
    @Column(name = "site_id", nullable = false) var siteId: String = "",
    @Enumerated(EnumType.STRING) @Column(nullable = false) var status: VmaClinicalTripStatus = VmaClinicalTripStatus.OUT,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

enum class VmaClinicalTripStatus { OUT, COMPLETED }

/**
 * VmaClinicalCase — maps to 'vma_clinical_cases' table.
 * PK is caseId (not UUID), e.g. "UVP-001-003"
 */
@Entity
@Table(name = "vma_clinical_cases", indexes = [
    Index(columnList = "status"), Index(columnList = "case_date"),
    Index(columnList = "site_id"), Index(columnList = "trip_id")
])
class VmaClinicalCase(
    @Id @Column(name = "case_id") var caseId: String = "",
    @Column(name = "case_no", unique = true) var caseNo: String? = null,
    @Column(name = "site_id", nullable = false) var siteId: String = "",
    @Column(name = "patient_id", nullable = false) var patientId: String = "",
    @Column(name = "case_date", nullable = false) var caseDate: LocalDate = LocalDate.now(),
    @Column(nullable = false) var operator: String = "",
    @Column(name = "trip_id") var tripId: String? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var status: VmaClinicalCaseStatus = VmaClinicalCaseStatus.IN_PROGRESS,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

enum class VmaClinicalCaseStatus { IN_PROGRESS, COMPLETED }

/**
 * VmaInventoryTransaction — maps to 'vma_inventory_transactions' table.
 * Append-only ledger pattern.
 */
@Entity
@Table(name = "vma_inventory_transactions", indexes = [
    Index(columnList = "date"), Index(columnList = "action"),
    Index(columnList = "product_type"), Index(columnList = "spec_no"),
    Index(columnList = "serial_no"), Index(columnList = "case_id"),
    Index(columnList = "batch_no")
])
class VmaInventoryTransaction(
    @Id @Column(length = 36) var id: String = "",
    @Column(nullable = false) var date: LocalDate = LocalDate.now(),
    @Enumerated(EnumType.STRING) @Column(nullable = false) var action: VmaInventoryAction = VmaInventoryAction.REC_CN,
    @Enumerated(EnumType.STRING) @Column(name = "product_type", nullable = false) var productType: VmaProductType = VmaProductType.PVALVE,
    @Column(name = "spec_no", nullable = false) var specNo: String = "",
    @Column(name = "serial_no") var serialNo: String? = null,
    @Column(nullable = false) var qty: Int = 1,
    @Column(name = "exp_date") var expDate: LocalDate? = null,
    var operator: String? = null,
    var location: String? = null,
    @Column(columnDefinition = "text") var notes: String? = null,
    @Enumerated(EnumType.STRING) var inspection: VmaInspectionResult? = null,
    @Column(columnDefinition = "integer[]") var condition: Array<Int> = arrayOf(),
    @Column(name = "batch_no") var batchNo: String? = null,
    @Column(name = "case_id") var caseId: String? = null,
    @Column(name = "trip_id") var tripId: String? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
    @Column(name = "deleted_at") var deletedAt: Instant? = null,
)

enum class VmaInventoryAction { REC_CN, REC_CASE, OUT_CASE, OUT_CN, USED_CASE, MOVE_DEMO, RETURN_DEMO }
enum class VmaProductType { PVALVE, DELIVERY_SYSTEM }
enum class VmaInspectionResult { ACCEPT, REJECT }

// ============================================================
// VMA Site Entity
// ============================================================

/**
 * VmaSite — maps to 'vma_sites' table.
 * PK is siteId (not UUID), e.g. "001"
 */
@Entity
@Table(name = "vma_sites")
class VmaSite(
    @Id @Column(name = "site_id") var siteId: String = "",
    @Column(name = "site_name", nullable = false) var siteName: String = "",
    @Column(nullable = false) var address: String = "",
    @Column(name = "address_2") var address2: String? = null,
    @Column(nullable = false) var city: String = "",
    @Column(nullable = false) var state: String = "",
    @Column(name = "zip_code", nullable = false) var zipCode: String = "",
    @Column(nullable = false) var country: String = "",
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false) var updatedAt: Instant = Instant.now(),
)

// ============================================================
// VMA Fridge Shelf Entity
// ============================================================

/**
 * VmaFridgeSlot — maps to 'vma_fridge_slots' table.
 * Tracks product placement in fridge shelves.
 * Shelves 1-10: odd=left door, even=right door, 5 shelves per side.
 * Each shelf: 3 rows × 4 cols = 12 positions.
 */
@Entity
@Table(
    name = "vma_fridge_slots",
    uniqueConstraints = [UniqueConstraint(columnNames = ["shelf_no", "row_no", "col_no"])],
    indexes = [
        Index(columnList = "shelf_no"),
        Index(columnList = "serial_no"),
    ]
)
class VmaFridgeSlot(
    @Id @Column(length = 36) var id: String = "",
    @Column(name = "shelf_no", nullable = false) var shelfNo: Int = 1,
    @Column(name = "row_no", nullable = false) var rowNo: Int = 1,
    @Column(name = "col_no", nullable = false) var colNo: Int = 1,
    @Enumerated(EnumType.STRING) @Column(name = "product_type", nullable = false) var productType: VmaProductType = VmaProductType.PVALVE,
    @Column(name = "spec_no", nullable = false) var specNo: String = "",
    @Column(name = "serial_no") var serialNo: String? = null,
    @Column(name = "placed_at", nullable = false) var placedAt: Instant = Instant.now(),
    @Column(name = "placed_by") var placedBy: String? = null,
    @Column(name = "created_at", nullable = false, updatable = false) var createdAt: Instant = Instant.now(),
)
