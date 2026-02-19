package com.mgmt.modules.vma

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.util.*

/**
 * VmaClinicalTripService — handles Trip lifecycle:
 *   create (OUT_CASE + tripId) → assign to cases → return unused → complete
 */
@Service
@Transactional
class VmaClinicalTripService(
    private val tripRepo: VmaClinicalTripRepository,
    private val caseRepo: VmaClinicalCaseRepository,
    private val txnRepo: VmaInventoryTransactionRepository,
    private val siteRepo: VmaSiteRepository,
    private val invService: VmaInventoryTransactionService,
) {

    // ═══════════ List / Detail ═══════════

    fun findAll(): List<Map<String, Any?>> {
        val trips = tripRepo.findAllByOrderByTripDateDesc()
        if (trips.isEmpty()) return emptyList()

        val siteMap = siteRepo.findAll().associateBy { it.siteId }

        // Batch-load all transactions and cases to avoid N+1 queries
        val tripIds = trips.map { it.tripId }
        val allTxns = txnRepo.findAllByTripIdInAndDeletedAtIsNull(tripIds)
        val allCases = caseRepo.findAllByTripIdIn(tripIds)
        val txnsByTrip = allTxns.groupBy { it.tripId }
        val casesByTrip = allCases.groupBy { it.tripId }

        return trips.map { t ->
            val txns = txnsByTrip[t.tripId] ?: emptyList()
            val cases = casesByTrip[t.tripId] ?: emptyList()
            mapOf(
                "tripId" to t.tripId,
                "tripDate" to t.tripDate.toString(),
                "siteId" to t.siteId,
                "siteName" to siteMap[t.siteId]?.siteName,
                "status" to t.status.name,
                "itemCount" to txns.size,
                "caseCount" to cases.size,
                "assignedCount" to txns.count { it.caseId != null },
                "createdAt" to t.createdAt,
                "updatedAt" to t.updatedAt,
            )
        }
    }

    fun findOne(tripId: String): Map<String, Any?> {
        val t = tripRepo.findByTripId(tripId)
            ?: throw NotFoundException("Trip \"$tripId\" not found")
        val txns = txnRepo.findAllByTripIdAndDeletedAtIsNull(tripId)
            .sortedWith(compareBy({ it.productType }, { it.specNo }, { it.serialNo }))
        val cases = caseRepo.findAllByTripId(tripId)
        val siteMap = siteRepo.findAll().associateBy { it.siteId }

        return mapOf(
            "tripId" to t.tripId,
            "tripDate" to t.tripDate.toString(),
            "siteId" to t.siteId,
            "siteName" to siteMap[t.siteId]?.siteName,
            "status" to t.status.name,
            "transactions" to txns,
            "cases" to cases.map { c ->
                mapOf(
                    "caseId" to c.caseId,
                    "caseNo" to c.caseNo,
                    "patientId" to c.patientId,
                    "siteId" to c.siteId,
                    "siteName" to siteMap[c.siteId]?.siteName,
                    "status" to c.status.name,
                )
            },
            "createdAt" to t.createdAt,
            "updatedAt" to t.updatedAt,
        )
    }

    // ═══════════ Create Trip (OUT_CASE + tripId) ═══════════

    fun createTrip(dto: CreateTripRequest): Map<String, Any?> {
        val tripDate = LocalDate.parse(dto.tripDate)
        val tripId = "TRIP-${dto.siteId}-${tripDate.toString().replace("-", "")}-${System.currentTimeMillis() % 10000}"

        val site = siteRepo.findBySiteId(dto.siteId)
            ?: throw NotFoundException("Site \"${dto.siteId}\" not found")

        require(dto.items.isNotEmpty()) { "At least one product item is required" }

        val trip = tripRepo.save(VmaClinicalTrip(
            tripId = tripId,
            tripDate = tripDate,
            siteId = dto.siteId,
            status = VmaClinicalTripStatus.OUT,
        ))

        // Link selected cases to this trip
        for (caseId in dto.caseIds) {
            val c = caseRepo.findByCaseId(caseId)
                ?: throw NotFoundException("Case \"$caseId\" not found")
            c.tripId = tripId
            c.updatedAt = Instant.now()
            caseRepo.save(c)
        }

        // Create OUT_CASE transactions for each item (tripId marks them as trip)
        for (item in dto.items) {
            txnRepo.save(VmaInventoryTransaction(
                id = UUID.randomUUID().toString(),
                date = tripDate,
                action = VmaInventoryAction.OUT_CASE,
                productType = VmaProductType.valueOf(item.productType),
                specNo = item.specNo,
                serialNo = item.serialNo,
                qty = item.qty,
                expDate = item.expDate?.let { LocalDate.parse(it) },
                batchNo = item.batchNo,
                tripId = tripId,
            ))
            // Auto-remove from fridge
            invService.clearFridgeSlotBySerial(item.specNo, item.serialNo)
        }

        return mapOf(
            "tripId" to trip.tripId,
            "tripDate" to trip.tripDate.toString(),
            "siteId" to trip.siteId,
            "siteName" to site.siteName,
            "status" to trip.status.name,
        )
    }

    // ═══════════ Assign Items to Case ═══════════

    /**
     * Assign trip products to an existing case.
     * The transactions get their caseId set + action changed to OUT_CASE.
     */
    fun assignItemsToCase(tripId: String, dto: AssignTripItemsRequest): Map<String, Any> {
        val trip = tripRepo.findByTripId(tripId)
            ?: throw NotFoundException("Trip \"$tripId\" not found")
        if (trip.status == VmaClinicalTripStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed trip")

        val case = caseRepo.findByCaseId(dto.caseId)
            ?: throw NotFoundException("Case \"${dto.caseId}\" not found")

        val txns = txnRepo.findAllByTripIdAndDeletedAtIsNull(tripId)
        val toAssign = txns.filter { it.id in dto.transactionIds }

        require(toAssign.isNotEmpty()) { "No valid transactions to assign" }

        for (txn in toAssign) {
            if (txn.caseId != null) {
                throw ConflictException("Transaction ${txn.id} already assigned to case ${txn.caseId}")
            }
            txn.caseId = case.caseId
            txn.action = VmaInventoryAction.OUT_CASE
            txn.updatedAt = Instant.now()
            txnRepo.save(txn)
        }

        return mapOf(
            "assigned" to toAssign.size,
            "caseId" to case.caseId,
        )
    }

    // ═══════════ Return Unassigned Items ═══════════

    /**
     * Return unassigned trip items back to inventory (soft-delete the OUT_CASE txn,
     * create a REC_CASE txn to bring them back).
     */
    fun returnItems(tripId: String, dto: ReturnTripItemsRequest): Map<String, Any> {
        val trip = tripRepo.findByTripId(tripId)
            ?: throw NotFoundException("Trip \"$tripId\" not found")
        if (trip.status == VmaClinicalTripStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed trip")

        val txns = txnRepo.findAllByTripIdAndDeletedAtIsNull(tripId)
        val toReturn = txns.filter { it.id in dto.transactionIds && it.caseId == null }

        require(toReturn.isNotEmpty()) { "No valid unassigned transactions to return" }

        for (txn in toReturn) {
            // Soft-delete the OUT_CASE transaction
            txn.deletedAt = Instant.now()
            txn.updatedAt = Instant.now()
            txnRepo.save(txn)

            // Create a REC_CASE (return) transaction
            txnRepo.save(VmaInventoryTransaction(
                id = UUID.randomUUID().toString(),
                date = LocalDate.now(),
                action = VmaInventoryAction.REC_CASE,
                productType = txn.productType,
                specNo = txn.specNo,
                serialNo = txn.serialNo,
                qty = txn.qty,
                expDate = txn.expDate,
                batchNo = txn.batchNo,
                tripId = tripId,
                notes = "Returned from trip $tripId",
            ))
        }

        return mapOf("returned" to toReturn.size)
    }

    // ═══════════ Complete Trip ═══════════

    fun completeTrip(tripId: String): Map<String, Any> {
        val trip = tripRepo.findByTripId(tripId)
            ?: throw NotFoundException("Trip \"$tripId\" not found")
        if (trip.status == VmaClinicalTripStatus.COMPLETED)
            throw IllegalStateException("Trip already completed")

        // Check all items are either assigned or returned
        val txns = txnRepo.findAllByTripIdAndDeletedAtIsNull(tripId)
        val unassigned = txns.filter { it.caseId == null && it.action == VmaInventoryAction.OUT_CASE }
        if (unassigned.isNotEmpty()) {
            throw IllegalStateException("${unassigned.size} item(s) still unassigned. Assign to a case or return them first.")
        }

        trip.status = VmaClinicalTripStatus.COMPLETED
        trip.updatedAt = Instant.now()
        tripRepo.save(trip)

        return mapOf("tripId" to tripId, "status" to "COMPLETED")
    }

    // ═══════════ Add / Remove Case ═══════════

    fun addCaseToTrip(tripId: String, dto: AddCaseToTripRequest): Map<String, Any> {
        val trip = tripRepo.findByTripId(tripId)
            ?: throw NotFoundException("Trip \"$tripId\" not found")
        if (trip.status == VmaClinicalTripStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed trip")

        val case = caseRepo.findByCaseId(dto.caseId)
            ?: throw NotFoundException("Case \"${dto.caseId}\" not found")
        if (case.tripId != null)
            throw ConflictException("Case \"${dto.caseId}\" already belongs to trip ${case.tripId}")

        case.tripId = tripId
        case.updatedAt = Instant.now()
        caseRepo.save(case)

        return mapOf("added" to dto.caseId, "tripId" to tripId)
    }

    fun removeCaseFromTrip(tripId: String, dto: RemoveCaseFromTripRequest): Map<String, Any> {
        val trip = tripRepo.findByTripId(tripId)
            ?: throw NotFoundException("Trip \"$tripId\" not found")
        if (trip.status == VmaClinicalTripStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed trip")

        val case = caseRepo.findByCaseId(dto.caseId)
            ?: throw NotFoundException("Case \"${dto.caseId}\" not found")
        if (case.tripId != tripId)
            throw ConflictException("Case \"${dto.caseId}\" does not belong to trip $tripId")

        // Un-assign any trip transactions that were assigned to this case
        val txns = txnRepo.findAllByTripIdAndDeletedAtIsNull(tripId)
        for (txn in txns.filter { it.caseId == dto.caseId }) {
            txn.caseId = null
            txn.action = VmaInventoryAction.OUT_CASE
            txn.updatedAt = Instant.now()
            txnRepo.save(txn)
        }

        case.tripId = null
        case.updatedAt = Instant.now()
        caseRepo.save(case)

        return mapOf("removed" to dto.caseId, "tripId" to tripId)
    }

    // ═══════════ Delete Trip ═══════════

    fun deleteTrip(tripId: String): Map<String, Any> {
        val trip = tripRepo.findByTripId(tripId)
            ?: throw NotFoundException("Trip \"$tripId\" not found")
        if (trip.status == VmaClinicalTripStatus.COMPLETED)
            throw IllegalStateException("Cannot delete a completed trip")

        // Un-link all cases from this trip
        val cases = caseRepo.findAllByTripId(tripId)
        for (c in cases) {
            c.tripId = null
            c.updatedAt = Instant.now()
            caseRepo.save(c)
        }

        // Soft-delete all trip transactions (returns products to inventory)
        val txns = txnRepo.findAllByTripIdAndDeletedAtIsNull(tripId)
        for (txn in txns) {
            txn.deletedAt = Instant.now()
            txnRepo.save(txn)
        }

        // Hard-delete the trip
        tripRepo.delete(trip)

        return mapOf("deleted" to true, "restoredItems" to txns.size)
    }
}
