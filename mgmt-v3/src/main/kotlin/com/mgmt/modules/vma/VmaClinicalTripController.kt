package com.mgmt.modules.vma

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.vma.dto.*
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*

/**
 * VmaClinicalTripController — REST endpoints for Trip (出库单) lifecycle.
 */
@RestController
@RequestMapping("/api/v1/vma")
class VmaClinicalTripController(
    private val tripService: VmaClinicalTripService,
) {

    @GetMapping("/clinical-trips")
    @RequirePermission("vma.employees.manage")
    fun listTrips() = tripService.findAll()

    @GetMapping("/clinical-trips/{tripId}")
    @RequirePermission("vma.employees.manage")
    fun getTrip(@PathVariable tripId: String) = tripService.findOne(tripId)

    @PostMapping("/clinical-trips")
    @ResponseStatus(HttpStatus.CREATED)
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "CREATE_TRIP", riskLevel = "HIGH")
    fun createTrip(@RequestBody dto: CreateTripRequest) = tripService.createTrip(dto)

    @PostMapping("/clinical-trips/{tripId}/assign")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "ASSIGN_TRIP_ITEMS", riskLevel = "MEDIUM")
    fun assignItems(
        @PathVariable tripId: String,
        @RequestBody dto: AssignTripItemsRequest,
    ) = tripService.assignItemsToCase(tripId, dto)

    @PostMapping("/clinical-trips/{tripId}/return")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "RETURN_TRIP_ITEMS", riskLevel = "MEDIUM")
    fun returnItems(
        @PathVariable tripId: String,
        @RequestBody dto: ReturnTripItemsRequest,
    ) = tripService.returnItems(tripId, dto)

    @PostMapping("/clinical-trips/{tripId}/complete")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "COMPLETE_TRIP", riskLevel = "HIGH")
    fun completeTrip(@PathVariable tripId: String) = tripService.completeTrip(tripId)

    @PostMapping("/clinical-trips/{tripId}/add-case")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "ADD_CASE_TO_TRIP", riskLevel = "MEDIUM")
    fun addCase(
        @PathVariable tripId: String,
        @RequestBody dto: AddCaseToTripRequest,
    ) = tripService.addCaseToTrip(tripId, dto)

    @PostMapping("/clinical-trips/{tripId}/remove-case")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "REMOVE_CASE_FROM_TRIP", riskLevel = "MEDIUM")
    fun removeCase(
        @PathVariable tripId: String,
        @RequestBody dto: RemoveCaseFromTripRequest,
    ) = tripService.removeCaseFromTrip(tripId, dto)

    @DeleteMapping("/clinical-trips/{tripId}")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "DELETE_TRIP", riskLevel = "HIGH")
    fun deleteTrip(@PathVariable tripId: String) = tripService.deleteTrip(tripId)
}
