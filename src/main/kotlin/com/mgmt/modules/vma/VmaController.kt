package com.mgmt.modules.vma

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.vma.dto.*
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * VmaController — REST API for Employees, Departments, SOP Requirements/History
 *
 * Endpoints (19 total):
 *
 *   Employees:
 *     GET    /vma/employees                          - 员工列表 (分页+搜索)
 *     GET    /vma/employees/{id}                     - 单个员工 (含职业生涯)
 *     POST   /vma/employees                          - 创建员工
 *     PATCH  /vma/employees/{id}                     - 更新员工
 *     PATCH  /vma/employees/{id}/toggle              - 切换状态
 *     DELETE /vma/employees/{id}                     - 软删除员工
 *
 *   Employee-Department Assignments:
 *     POST   /vma/employees/{id}/departments         - 添加部门分配
 *     PATCH  /vma/employee-departments/{id}          - 编辑分配 (栈式)
 *     PATCH  /vma/employee-departments/{id}/remove   - 移除分配 (设 removedAt)
 *     DELETE /vma/employee-departments/{id}          - 删除分配 (栈式)
 *
 *   Departments:
 *     GET    /vma/departments                        - 部门列表
 *     POST   /vma/departments                        - 创建部门
 *     PATCH  /vma/departments/{id}                   - 更新部门
 *     DELETE /vma/departments/{id}                   - 软删除部门
 *
 *   Duty SOP:
 *     GET    /vma/departments/{id}/sop-requirements  - 获取 SOP 需求
 *     PUT    /vma/departments/{id}/sop-requirements  - 更新 SOP 需求 (含变更日期)
 *     GET    /vma/departments/{id}/sop-history       - SOP 变更历史
 *     PATCH  /vma/duty-sop-history/{id}              - 编辑历史 (栈式)
 *     DELETE /vma/duty-sop-history/{id}              - 删除历史 (栈式)
 */
@RestController
@RequestMapping("/vma")
class VmaController(
    private val service: VmaEmployeeService,
) {

    // ═══════════ Employee Endpoints ═══════════

    @GetMapping("/employees")
    @RequirePermission("vma.employees.manage")
    fun findAllEmployees(query: EmployeeQueryParams): ResponseEntity<Any> =
        ResponseEntity.ok(service.findAllEmployees(query))

    @GetMapping("/employees/{id}")
    @RequirePermission("vma.employees.manage")
    fun findOneEmployee(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(service.findOneEmployee(id))

    @PostMapping("/employees")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "CREATE_EMPLOYEE")
    fun createEmployee(@RequestBody dto: CreateEmployeeRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(service.createEmployee(dto))

    @PatchMapping("/employees/{id}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "UPDATE_EMPLOYEE")
    fun updateEmployee(@PathVariable id: String, @RequestBody dto: UpdateEmployeeRequest): ResponseEntity<Any> =
        ResponseEntity.ok(service.updateEmployee(id, dto))

    @PatchMapping("/employees/{id}/toggle")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "TOGGLE_EMPLOYEE_STATUS")
    fun toggleEmployeeStatus(@PathVariable id: String, @RequestBody(required = false) dto: ToggleEmployeeStatusRequest?): ResponseEntity<Any> =
        ResponseEntity.ok(service.toggleEmployeeStatus(id, dto))

    @DeleteMapping("/employees/{id}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "DELETE_EMPLOYEE", riskLevel = "HIGH")
    fun deleteEmployee(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(service.deleteEmployee(id))

    // ═══════════ Employee-Department Assignment Endpoints ═══════════

    @PostMapping("/employees/{id}/departments")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "ADD_DEPARTMENT_ASSIGNMENT")
    fun addDepartmentAssignment(@PathVariable id: String, @RequestBody dto: AddDepartmentAssignmentRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(service.addDepartmentAssignment(id, dto))

    @PatchMapping("/employee-departments/{id}")
    @RequirePermission("vma.employees.manage")
    fun updateDepartmentAssignment(@PathVariable id: String, @RequestBody dto: UpdateDepartmentAssignmentRequest): ResponseEntity<Any> =
        ResponseEntity.ok(service.updateDepartmentAssignment(id, dto))

    @PatchMapping("/employee-departments/{id}/remove")
    @RequirePermission("vma.employees.manage")
    fun removeDepartmentAssignment(@PathVariable id: String, @RequestBody dto: RemoveDepartmentAssignmentRequest): ResponseEntity<Any> =
        ResponseEntity.ok(service.removeDepartmentAssignment(id, dto))

    @DeleteMapping("/employee-departments/{id}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "DELETE_DEPARTMENT_ASSIGNMENT", riskLevel = "HIGH")
    fun deleteDepartmentAssignment(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(service.deleteDepartmentAssignment(id))

    // ═══════════ Department Endpoints ═══════════

    @GetMapping("/departments")
    @RequirePermission("vma.employees.manage")
    fun findAllDepartments(): ResponseEntity<Any> =
        ResponseEntity.ok(service.findAllDepartments())

    @PostMapping("/departments")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "CREATE_DEPARTMENT")
    fun createDepartment(@RequestBody dto: CreateDepartmentRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(service.createDepartment(dto))

    @PatchMapping("/departments/{id}")
    @RequirePermission("vma.employees.manage")
    fun updateDepartment(@PathVariable id: String, @RequestBody dto: UpdateDepartmentRequest): ResponseEntity<Any> =
        ResponseEntity.ok(service.updateDepartment(id, dto))

    @DeleteMapping("/departments/{id}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "DELETE_DEPARTMENT", riskLevel = "HIGH")
    fun deleteDepartment(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(service.deleteDepartment(id))

    // ═══════════ Duty SOP Requirements + History ═══════════

    @GetMapping("/departments/{id}/sop-requirements")
    @RequirePermission("vma.employees.manage")
    fun getDutySopRequirements(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(service.getDutySopRequirements(id))

    @PutMapping("/departments/{id}/sop-requirements")
    @RequirePermission("vma.employees.manage")
    fun updateDutySopRequirements(@PathVariable id: String, @RequestBody dto: UpdateSopRequirementsRequest): ResponseEntity<Any> =
        ResponseEntity.ok(service.updateDutySopRequirements(id, dto))

    @GetMapping("/departments/{id}/sop-history")
    @RequirePermission("vma.employees.manage")
    fun getDutySopHistory(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(service.getDutySopHistory(id))

    @PatchMapping("/duty-sop-history/{id}")
    @RequirePermission("vma.employees.manage")
    fun updateSopHistory(@PathVariable id: String, @RequestBody dto: UpdateSopHistoryRequest): ResponseEntity<Any> =
        ResponseEntity.ok(service.updateSopHistory(id, dto))

    @DeleteMapping("/duty-sop-history/{id}")
    @RequirePermission("vma.employees.manage")
    fun deleteSopHistory(@PathVariable id: String): ResponseEntity<Any> =
        ResponseEntity.ok(service.deleteSopHistory(id))
}
