package com.mgmt.modules.vma.dto

import java.time.Instant

// ─── Employee DTOs ──────────────────────────────────────

data class CreateEmployeeRequest(
    val employeeNo: String,
    val lastName: String,
    val firstName: String,
    val departmentIds: List<String>,
    val hireDate: String,  // YYYY-MM-DD → parsed to Pacific noon
)

data class UpdateEmployeeRequest(
    val employeeNo: String? = null,
    val lastName: String? = null,
    val firstName: String? = null,
    val hireDate: String? = null,
    val status: String? = null,
    val terminationDate: String? = null,
)

data class ToggleEmployeeStatusRequest(
    val terminationDate: String? = null,
)

data class EmployeeQueryParams(
    val search: String? = null,
    val departmentId: String? = null,
    val status: String? = null,
    val page: Int = 1,
    val limit: Int = 50,
)

data class EmployeeResponse(
    val id: String,
    val employeeNo: String,
    val lastName: String,
    val firstName: String,
    val hireDate: Instant,
    val terminationDate: Instant?,
    val status: String,
    val departments: List<DepartmentBrief>,
    val departmentAssignments: List<DepartmentAssignmentResponse>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class DepartmentBrief(
    val id: String,
    val code: String,
    val name: String,
    val duties: String,
)

// ─── Department Assignment DTOs ─────────────────────────

data class AddDepartmentAssignmentRequest(
    val departmentId: String,
    val assignedAt: String,  // YYYY-MM-DD
)

data class UpdateDepartmentAssignmentRequest(
    val assignedAt: String? = null,
    val removedAt: String? = null,
)

data class RemoveDepartmentAssignmentRequest(
    val removedAt: String,  // YYYY-MM-DD
)

data class DepartmentAssignmentResponse(
    val id: String,
    val employeeId: String,
    val departmentId: String,
    val assignedAt: Instant,
    val removedAt: Instant?,
    val department: DepartmentBrief?,
    val createdAt: Instant,
)

// ─── Department DTOs ────────────────────────────────────

data class CreateDepartmentRequest(
    val code: String,
    val name: String,
    val duties: String,
    val sopTrainingReq: String? = null,
)

data class UpdateDepartmentRequest(
    val code: String? = null,
    val name: String? = null,
    val duties: String? = null,
    val sopTrainingReq: String? = null,
    val isActive: Boolean? = null,
)

data class DepartmentResponse(
    val id: String,
    val code: String,
    val name: String,
    val duties: String,
    val sopTrainingReq: String?,
    val isActive: Boolean,
    val employeeCount: Long,
    val createdAt: Instant,
    val updatedAt: Instant,
)

// ─── Duty SOP DTOs ──────────────────────────────────────

data class UpdateSopRequirementsRequest(
    val sopNos: List<String>,
    val changeDate: String,  // YYYY-MM-DD
)

data class UpdateSopHistoryRequest(
    val changeDate: String? = null,
    val changeType: String? = null,
    val sopNo: String? = null,
)

data class SopHistoryGroupResponse(
    val changeDate: String,
    val changeType: String,
    val changes: List<SopHistoryItemResponse>,
)

data class SopHistoryItemResponse(
    val id: String,
    val changeType: String,
    val sopNo: String,
    val sopName: String,
)
