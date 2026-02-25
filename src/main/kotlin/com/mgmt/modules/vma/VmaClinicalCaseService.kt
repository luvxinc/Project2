package com.mgmt.modules.vma

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.file.Paths
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * VmaClinicalCaseService — 临床案例管理
 *
 *
 * Case lifecycle: IN_PROGRESS → COMPLETED (reversible)
 * Product flow: OUT_CASE → {USED_CASE | REC_CASE + optional MOVE_DEMO}
 */
@Service
@Transactional
class VmaClinicalCaseService(
    private val caseRepo: VmaClinicalCaseRepository,
    private val txnRepo: VmaInventoryTransactionRepository,
    private val siteRepo: VmaSiteRepository,
    private val pvRepo: VmaPValveProductRepository,
    private val fitRepo: VmaDeliverySystemFitRepository,
    private val dsRepo: VmaDeliverySystemProductRepository,
    private val packingListPdfService: VmaPackingListPdfService,
    private val invService: VmaInventoryTransactionService,
    private val tripRepo: VmaClinicalTripRepository,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    // Result type for case creation with optional PDF
    data class CaseCreateResult(
        val caseData: Map<String, Any?>,
        val pdfBytes: ByteArray?,
        val filename: String,
    )

    // Result type for PDF generation
    data class PdfResult(
        val pdfBytes: ByteArray,
        val filename: String,
    )

    // ═══════════ Query Operations ═══════════

    fun findAll(): List<Map<String, Any?>> {
        val cases = caseRepo.findAllByOrderByCaseDateDesc()
        val siteMap = siteRepo.findAll().associateBy { it.siteId }
        return cases.map { c ->
            mapOf(
                "caseId" to c.caseId, "caseNo" to c.caseNo,
                "siteId" to c.siteId, "siteName" to (siteMap[c.siteId]?.siteName),
                "patientId" to c.patientId, "caseDate" to c.caseDate.toString(),
                "operator" to c.operator, "tripId" to c.tripId,
                "status" to c.status.name, "createdAt" to c.createdAt, "updatedAt" to c.updatedAt,
            )
        }
    }

    fun findOne(caseId: String): Map<String, Any?> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        val site = siteRepo.findBySiteId(c.siteId)

        val result = mutableMapOf<String, Any?>(
            "caseId" to c.caseId, "caseNo" to c.caseNo,
            "siteId" to c.siteId, "site" to site,
            "patientId" to c.patientId, "caseDate" to c.caseDate.toString(),
            "operator" to c.operator,
            "status" to c.status.name,
            "tripId" to c.tripId,
            "createdAt" to c.createdAt, "updatedAt" to c.updatedAt,
        )

        if (c.tripId != null) {
            // Trip-linked case — show shared product pool (OUT_CASE with tripId)
            val tripTxns = txnRepo.findAllByTripIdAndDeletedAtIsNull(c.tripId!!)
            result["transactions"] = tripTxns
                .filter { it.action == VmaInventoryAction.OUT_CASE }
                .sortedWith(compareBy({ it.productType }, { it.specNo }, { it.serialNo }))
            // Separately include USED items so frontend can filter completion modal
            result["usedItems"] = tripTxns
                .filter { it.action == VmaInventoryAction.USED_CASE }
                .map { mapOf("specNo" to it.specNo, "serialNo" to it.serialNo, "caseId" to it.caseId) }

            // Sibling cases
            val siblings = caseRepo.findAllByTripId(c.tripId!!)
            val siteMap = siteRepo.findAll().associateBy { it.siteId }
            result["relatedCases"] = siblings.map { s ->
                mapOf(
                    "caseId" to s.caseId, "caseNo" to s.caseNo,
                    "siteId" to s.siteId, "siteName" to siteMap[s.siteId]?.siteName,
                    "patientId" to s.patientId, "caseDate" to s.caseDate.toString(),
                    "status" to s.status.name,
                )
            }
        } else {
            // Standalone case
            val allTxns = txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
            val outCaseTxns = allTxns
                .filter { it.action == VmaInventoryAction.OUT_CASE }
                .sortedWith(compareBy({ it.productType }, { it.specNo }, { it.serialNo }))
            result["transactions"] = outCaseTxns
        }

        // For completed cases, include the completion summary
        val completionTxns = if (c.tripId != null) {
            txnRepo.findAllByTripIdAndDeletedAtIsNull(c.tripId!!)
                .filter { it.notes?.startsWith("COMPLETION_AUTO") == true }
        } else {
            txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
                .filter { it.notes?.startsWith("COMPLETION_AUTO") == true }
        }
        if (c.status == VmaClinicalCaseStatus.COMPLETED) {

            fun toSummaryItem(txn: VmaInventoryTransaction) = mapOf(
                "productType" to txn.productType.name,
                "specNo" to txn.specNo,
                "serialNo" to txn.serialNo,
                "qty" to txn.qty,
                "expDate" to txn.expDate?.toString(),
                "batchNo" to txn.batchNo,
                "caseId" to txn.caseId,
            )

            result["completionSummary"] = mapOf(
                "used" to completionTxns
                    .filter { it.action == VmaInventoryAction.USED_CASE }
                    .map { toSummaryItem(it) },
                "returnedOk" to completionTxns
                    .filter { it.action == VmaInventoryAction.REC_CASE && it.inspection == VmaInspectionResult.ACCEPT }
                    .map { toSummaryItem(it) },
                "returnedDamaged" to completionTxns
                    .filter { it.action == VmaInventoryAction.REC_CASE && it.inspection == VmaInspectionResult.REJECT }
                    .map { toSummaryItem(it) },
            )
        }

        return result
    }

    // ═══════════ Case Info Update ═══════════

    fun updateCaseInfo(caseId: String, dto: UpdateClinicalCaseInfoRequest): Map<String, Any?> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed case")

        if (dto.caseNo != null && dto.caseNo != c.caseNo) {
            // Check uniqueness via indexed query instead of loading all cases
            caseRepo.findByCaseNo(dto.caseNo)?.let { existing ->
                if (existing.caseId != caseId) {
                    throw ConflictException("Case # \"${dto.caseNo}\" already exists")
                }
            }
        }

        dto.caseNo?.let { c.caseNo = it.ifEmpty { null } }
        dto.siteId?.let { c.siteId = it }
        dto.patientId?.let { c.patientId = it }
        dto.caseDate?.let { c.caseDate = LocalDate.parse(it) }
        dto.operator?.let { c.operator = it }
        c.updatedAt = Instant.now()
        caseRepo.save(c)

        val site = siteRepo.findBySiteId(c.siteId)
        return mapOf(
            "caseId" to c.caseId, "caseNo" to c.caseNo,
            "siteId" to c.siteId, "siteName" to site?.siteName,
            "patientId" to c.patientId, "caseDate" to c.caseDate.toString(),
            "operator" to c.operator,
            "status" to c.status.name,
        )
    }

    // ═══════════ Product Picking ═══════════

    /**
     * Compute on-shelf candidates for a spec, sorted by expDate ASC
     */
    private fun getCandidates(specNo: String, caseDate: String, productType: String): List<CandidateRow> {
        val caseDateObj = LocalDate.parse(caseDate)
        val pt = VmaProductType.valueOf(productType)
        val txns = txnRepo.findAllBySpecNoAndProductTypeAndDeletedAtIsNull(specNo, pt)
            .filter { it.action != VmaInventoryAction.MOVE_DEMO }

        val availMult = mapOf(
            VmaInventoryAction.REC_CN to 1, VmaInventoryAction.REC_CASE to 1,
            VmaInventoryAction.OUT_CASE to -1, VmaInventoryAction.OUT_CN to -1,
            VmaInventoryAction.USED_CASE to 0,
        )

        data class SerialEntry(var onShelf: Int = 0, var expDate: LocalDate? = null, var batchNo: String = "")
        val serialMap = mutableMapOf<String, SerialEntry>()

        for (txn in txns) {
            val sn = txn.serialNo ?: "__no_serial__"
            val entry = serialMap.getOrPut(sn) { SerialEntry() }
            entry.onShelf += txn.qty * (availMult[txn.action] ?: 0)
            if (txn.action == VmaInventoryAction.REC_CN) {
                if (entry.expDate == null || (txn.expDate != null && txn.expDate!! < entry.expDate!!)) {
                    entry.expDate = txn.expDate
                }
                entry.batchNo = txn.batchNo ?: ""
            }
        }

        return serialMap.entries
            .filter { it.key != "__no_serial__" && it.value.onShelf > 0 }
            .filter { it.value.expDate == null || it.value.expDate!! >= caseDateObj }
            .map { (sn, data) ->
                CandidateRow(sn, data.expDate ?: LocalDate.of(2099, 12, 31), data.batchNo, data.onShelf)
            }
            .sortedBy { it.expDate }
    }

    private data class CandidateRow(val serialNo: String, val expDate: LocalDate, val batchNo: String, val onShelf: Int)

    fun pickProducts(dto: PickProductsRequest): List<PickedProduct> {
        val candidates = getCandidates(dto.specNo, dto.caseDate, dto.productType)
        val picked = mutableListOf<PickedProduct>()
        var remaining = dto.qty

        for (cand in candidates) {
            if (remaining <= 0) break
            val take = minOf(remaining, cand.onShelf)
            repeat(take) {
                picked.add(PickedProduct(
                    serialNo = cand.serialNo, specNo = dto.specNo,
                    expDate = cand.expDate.toString(), batchNo = cand.batchNo, qty = 1,
                ))
            }
            remaining -= take
        }
        return picked
    }

    fun getAvailableProducts(dto: AvailableProductsRequest): List<PickedProduct> {
        val candidates = getCandidates(dto.specNo, dto.caseDate, dto.productType)
        return candidates.flatMap { cand ->
            (1..cand.onShelf).map {
                PickedProduct(
                    serialNo = cand.serialNo, specNo = dto.specNo,
                    expDate = cand.expDate.toString(), batchNo = cand.batchNo, qty = 1,
                )
            }
        }
    }

    fun getCompatibleDS(pvalveSpecs: List<String>): List<Map<String, String>> {
        val pvalves = pvRepo.findAllBySpecificationIn(pvalveSpecs)
        if (pvalves.isEmpty()) return emptyList()

        val fits = fitRepo.findAllByPvalveIdIn(pvalves.map { it.id })
        val dsIds = fits.map { it.deliverySystemId }.distinct()
        val dsList = dsRepo.findAllById(dsIds)

        return dsList
            .map { mapOf("specification" to it.specification, "model" to it.model) }
            .distinctBy { it["specification"] }
            .sortedBy { it["specification"] }
    }

    // ═══════════ Case Creation ═══════════

    fun createCase(dto: CreateClinicalCaseRequest): Map<String, Any?> {
        val caseId = "UVP-${dto.siteId}-${dto.patientId}"

        caseRepo.findByCaseId(caseId)?.let {
            throw ConflictException("Case \"$caseId\" already exists")
        }
        if (!dto.caseNo.isNullOrBlank()) {
            caseRepo.findByCaseNo(dto.caseNo)?.let {
                throw ConflictException("Case # \"${dto.caseNo}\" already exists")
            }
        }

        val site = siteRepo.findBySiteId(dto.siteId)
            ?: throw NotFoundException("Site \"${dto.siteId}\" not found")

        require(dto.items.isNotEmpty()) { "At least one product item is required" }

        val caseDate = LocalDate.parse(dto.caseDate)
        val isMultiCase = dto.additionalCases.isNotEmpty()

        // If multi-case, create a Trip to group them
        var tripId: String? = null
        if (isMultiCase) {
            tripId = "TRIP-${dto.siteId}-${caseDate.toString().replace("-", "")}-${System.currentTimeMillis() % 10000}"
            tripRepo.save(VmaClinicalTrip(
                tripId = tripId,
                tripDate = caseDate,
                siteId = dto.siteId,
                status = VmaClinicalTripStatus.OUT,
            ))
        }

        // Create primary clinical case
        val clinicalCase = caseRepo.save(VmaClinicalCase(
            caseId = caseId,
            caseNo = dto.caseNo?.ifBlank { null },
            siteId = dto.siteId,
            patientId = dto.patientId,
            caseDate = caseDate,
            operator = dto.operator ?: "",
            tripId = tripId,
            status = VmaClinicalCaseStatus.IN_PROGRESS,
        ))

        // Create additional cases
        val allCaseIds = mutableListOf(caseId)
        for (extra in dto.additionalCases) {
            val extraCaseId = "UVP-${extra.siteId}-${extra.patientId}"
            caseRepo.findByCaseId(extraCaseId)?.let {
                throw ConflictException("Case \"$extraCaseId\" already exists")
            }
            if (!extra.caseNo.isNullOrBlank()) {
                caseRepo.findByCaseNo(extra.caseNo)?.let {
                    throw ConflictException("Case # \"${extra.caseNo}\" already exists")
                }
            }
            // Validate site
            siteRepo.findBySiteId(extra.siteId)
                ?: throw NotFoundException("Site \"${extra.siteId}\" not found")

            caseRepo.save(VmaClinicalCase(
                caseId = extraCaseId,
                caseNo = extra.caseNo?.ifBlank { null },
                siteId = extra.siteId,
                patientId = extra.patientId,
                caseDate = LocalDate.parse(extra.caseDate),
                operator = dto.operator ?: "",
                tripId = tripId,
                status = VmaClinicalCaseStatus.IN_PROGRESS,
            ))
            allCaseIds.add(extraCaseId)
        }

        // Create transactions for each item (always OUT_CASE; tripId distinguishes trip vs standalone)
        for (item in dto.items) {
            txnRepo.save(VmaInventoryTransaction(
                id = UUID.randomUUID().toString(),
                date = caseDate,
                action = VmaInventoryAction.OUT_CASE,
                productType = VmaProductType.valueOf(item.productType),
                specNo = item.specNo,
                serialNo = item.serialNo,
                qty = item.qty,
                expDate = item.expDate?.let { LocalDate.parse(it) },
                batchNo = item.batchNo,
                caseId = if (isMultiCase) null else caseId,
                tripId = tripId,
            ))
            // Auto-remove from fridge when going to WIP
            invService.clearFridgeSlotBySerial(item.specNo, item.serialNo)
        }

        return mapOf(
            "caseId" to clinicalCase.caseId, "caseNo" to clinicalCase.caseNo,
            "siteId" to clinicalCase.siteId, "site" to site,
            "patientId" to clinicalCase.patientId, "caseDate" to clinicalCase.caseDate.toString(),
            "operator" to clinicalCase.operator,
            "status" to clinicalCase.status.name,
            "tripId" to tripId,
            "allCaseIds" to allCaseIds,
        )
    }

    /**
     * Create a case AND generate the Packing List PDF in one call.
     * The frontend expects a PDF blob response from POST /clinical-cases.
     */
    fun createCaseWithPdf(dto: CreateClinicalCaseRequest): CaseCreateResult {
        val caseData = createCase(dto)
        val caseId = caseData["caseId"] as String
        val filename = "PackingList_${caseId}.pdf"

        return try {
            val pdfResult = generatePackingListPdf(caseId)
            CaseCreateResult(caseData, pdfResult.pdfBytes, pdfResult.filename)
        } catch (e: Exception) {
            log.warn("Failed to generate PDF for new case {}: {}", caseId, e.message)
            CaseCreateResult(caseData, null, filename)
        }
    }

    /**
     * Generate a Packing List PDF for an existing clinical case.
     */
    fun generatePackingListPdf(caseId: String): PdfResult {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        val site = siteRepo.findBySiteId(c.siteId)
            ?: throw NotFoundException("Site \"${c.siteId}\" not found")

        // For trip cases: query transactions by tripId, reference = all case IDs
        val isTrip = c.tripId != null
        val txns = if (isTrip) {
            txnRepo.findAllByTripIdAndDeletedAtIsNull(c.tripId!!)
                .filter { it.action == VmaInventoryAction.OUT_CASE }
                .sortedWith(compareBy({ it.productType }, { it.specNo }, { it.serialNo }))
        } else {
            txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
                .filter { it.action == VmaInventoryAction.OUT_CASE }
                .sortedWith(compareBy({ it.productType }, { it.specNo }, { it.serialNo }))
        }

        // Reference: compressed UVP format
        // Same site: UVP-007-001, 002  |  Different site: UVP-007-002, 005-003
        val reference = if (isTrip) {
            val tripCases = caseRepo.findAllByTripId(c.tripId!!)
                .sortedBy { it.caseId }
            val first = tripCases.first()
            val parts = mutableListOf(first.caseId) // Full: UVP-007-001
            for (i in 1 until tripCases.size) {
                val tc = tripCases[i]
                if (tc.siteId == first.siteId) {
                    parts.add(tc.patientId) // Same site → just patientId: 002
                } else {
                    parts.add("${tc.siteId}-${tc.patientId}") // Diff site → siteId-patientId: 005-003
                }
            }
            parts.joinToString(", ")
        } else {
            caseId
        }

        // Build product spec name lookup
        val pvSpecs = txns.filter { it.productType == VmaProductType.PVALVE }
            .map { it.specNo }.distinct()
        val dsSpecs = txns.filter { it.productType == VmaProductType.DELIVERY_SYSTEM }
            .map { it.specNo }.distinct()
        val pvMap = pvRepo.findAllBySpecificationIn(pvSpecs).associateBy { it.specification }
        val dsMap = dsRepo.findAllBySpecificationIn(dsSpecs).associateBy { it.specification }

        val packingItems = txns.mapIndexed { idx, txn ->
            val deviceName = when (txn.productType) {
                VmaProductType.PVALVE -> "Transcatheter\nPulmonary Valve"
                VmaProductType.DELIVERY_SYSTEM -> "Delivery System"
            }
            // For DS specs like "DS26-P29", format as "26Fr/DS26-P29"
            val modelSpec = when (txn.productType) {
                VmaProductType.DELIVERY_SYSTEM -> {
                    val frMatch = Regex("^DS(\\d+)").find(txn.specNo)
                    val frSize = frMatch?.groupValues?.get(1) ?: ""
                    if (frSize.isNotEmpty()) "${frSize}Fr/${txn.specNo}" else txn.specNo
                }
                else -> txn.specNo
            }
            val expFormatted = txn.expDate?.let {
                val months = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
                "${months[it.monthValue - 1]} ${String.format("%02d", it.dayOfMonth)}, ${it.year}"
            } ?: ""

            VmaPackingListPdfService.PackingItem(
                itemNo = idx + 1,
                specNo = modelSpec,
                serialNo = txn.serialNo ?: "-",
                expDate = txn.expDate?.toString() ?: "",
                expDateFormatted = expFormatted,
                deviceName = deviceName,
            )
        }

        val data = VmaPackingListPdfService.PackingListData(
            caseId = reference,
            caseDate = c.caseDate.toString(),
            site = VmaPackingListPdfService.SiteInfo(
                siteName = site.siteName,
                address = site.address,
                address2 = site.address2,
                city = site.city,
                state = site.state,
                zipCode = site.zipCode,
                country = site.country,
            ),
            items = packingItems,
        )

        // Resolve template: relative to working directory
        val templatePath = Paths.get(System.getProperty("user.dir"))
            .resolve("./apps/web/src/app/(dashboard)/vma/data/PackingList_UVP.pdf")
            .normalize()

        val pdfBytes = packingListPdfService.generate(data, templatePath)
        val filename = "PackingList_${caseId}.pdf"
        return PdfResult(pdfBytes, filename)
    }

    // ═══════════ Case Item CRUD ═══════════

    fun updateCaseItem(caseId: String, txnId: String, dto: UpdateCaseItemRequest): VmaInventoryTransaction {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed case")

        val txn = txnRepo.findById(txnId).orElse(null)
            ?.takeIf { it.caseId == caseId }
            ?: throw NotFoundException("Transaction not found in case \"$caseId\"")

        dto.specNo?.let { txn.specNo = it }
        dto.serialNo?.let { txn.serialNo = it }
        dto.qty?.let { txn.qty = it }
        dto.expDate?.let { txn.expDate = LocalDate.parse(it) }
        dto.batchNo?.let { txn.batchNo = it }
        txn.updatedAt = Instant.now()
        return txnRepo.save(txn)
    }

    fun deleteCaseItem(caseId: String, txnId: String): Map<String, Any> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed case")

        val txn = txnRepo.findById(txnId).orElse(null)
            ?.takeIf { it.caseId == caseId }
            ?: throw NotFoundException("Transaction not found in case \"$caseId\"")

        txnRepo.delete(txn)
        return mapOf("success" to true, "deleted" to txnId)
    }

    fun deleteCase(caseId: String): Map<String, Any> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Cannot delete a completed case. Reverse completion first.")

        val now = Instant.now()

        if (c.tripId != null) {
            // Trip-linked case — check if any sibling is completed
            val siblings = caseRepo.findAllByTripId(c.tripId!!).filter { it.caseId != caseId }
            val completedSibling = siblings.any { it.status == VmaClinicalCaseStatus.COMPLETED }
            if (completedSibling)
                throw IllegalStateException("Cannot delete: a related case has been completed. Reverse all completions first.")

            // Un-assign any trip products assigned to this case
            val tripTxns = txnRepo.findAllByTripIdAndDeletedAtIsNull(c.tripId!!)
            for (txn in tripTxns.filter { it.caseId == caseId }) {
                txn.caseId = null
                txn.action = VmaInventoryAction.OUT_CASE
                txn.updatedAt = now
                txnRepo.save(txn)
            }

            if (siblings.size == 1) {
                // Only 1 sibling left → convert to standalone (no trip)
                val remaining = siblings[0]
                remaining.tripId = null
                remaining.updatedAt = now
                caseRepo.save(remaining)
                // Convert trip transactions to OUT_CASE for the remaining case
                for (txn in tripTxns.filter { it.caseId == null }) {
                    txn.caseId = remaining.caseId
                    txn.action = VmaInventoryAction.OUT_CASE
                    txn.tripId = null
                    txn.updatedAt = now
                    txnRepo.save(txn)
                }
                // Also convert already-assigned transactions
                for (txn in tripTxns.filter { it.caseId == remaining.caseId }) {
                    txn.tripId = null
                    txn.updatedAt = now
                    txnRepo.save(txn)
                }
                // Delete the trip
                tripRepo.findByTripId(c.tripId!!)?.let { tripRepo.delete(it) }
            }

            // Hard-delete the case
            caseRepo.delete(c)
            log.info("Deleted trip-linked case {} from trip {}", caseId, c.tripId)
        } else {
            // Standalone case — soft-delete transactions
            val txns = txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
            txns.forEach { it.deletedAt = now }
            txnRepo.saveAll(txns)
            log.info("Soft-deleted {} transactions for case {}", txns.size, caseId)

            caseRepo.delete(c)
            log.info("Deleted clinical case {} (case_no={})", caseId, c.caseNo)
        }

        return mapOf("success" to true, "deleted" to caseId)
    }

    /**
     * Delete ALL cases in a trip group + the trip itself.
     * Products return to inventory.
     */
    fun deleteAllRelatedCases(caseId: String): Map<String, Any> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        val tripId = c.tripId
            ?: throw IllegalStateException("Case \"$caseId\" has no related cases")

        val allCases = caseRepo.findAllByTripId(tripId)
        val completedCount = allCases.count { it.status == VmaClinicalCaseStatus.COMPLETED }
        if (completedCount > 0)
            throw IllegalStateException("Cannot delete: $completedCount case(s) are completed. Reverse first.")

        val now = Instant.now()
        // Soft-delete all trip transactions
        val txns = txnRepo.findAllByTripIdAndDeletedAtIsNull(tripId)
        txns.forEach { it.deletedAt = now }
        txnRepo.saveAll(txns)

        // Hard-delete all cases
        allCases.forEach { caseRepo.delete(it) }

        // Delete the trip
        tripRepo.findByTripId(tripId)?.let { tripRepo.delete(it) }

        log.info("Deleted all {} cases in trip {} ({} txns soft-deleted)", allCases.size, tripId, txns.size)
        return mapOf("success" to true, "deletedCases" to allCases.size, "tripDeleted" to tripId)
    }

    /**
     * Add a new related case (sibling) to an existing trip.
     * If the source case has no trip yet, create one first.
     */
    fun addRelatedCase(sourceCaseId: String, dto: AddRelatedCaseRequest): Map<String, Any?> {
        val source = caseRepo.findByCaseId(sourceCaseId)
            ?: throw NotFoundException("Case \"$sourceCaseId\" not found")

        val newCaseId = "UVP-${dto.siteId}-${dto.patientId}"
        caseRepo.findByCaseId(newCaseId)?.let {
            throw ConflictException("Case \"$newCaseId\" already exists")
        }
        if (!dto.caseNo.isNullOrBlank()) {
            caseRepo.findByCaseNo(dto.caseNo)?.let {
                throw ConflictException("Case # \"${dto.caseNo}\" already exists")
            }
        }
        siteRepo.findBySiteId(dto.siteId)
            ?: throw NotFoundException("Site \"${dto.siteId}\" not found")

        val now = Instant.now()

        // Ensure source has a trip
        var tripId = source.tripId
        if (tripId == null) {
            // Promote standalone case to trip
            tripId = "TRIP-${source.siteId}-${source.caseDate.toString().replace("-", "")}-${System.currentTimeMillis() % 10000}"
            tripRepo.save(VmaClinicalTrip(
                tripId = tripId,
                tripDate = source.caseDate,
                siteId = source.siteId,
                status = VmaClinicalTripStatus.OUT,
            ))
            source.tripId = tripId
            source.updatedAt = now
            caseRepo.save(source)

            // Set tripId on existing OUT_CASE transactions (action stays OUT_CASE)
            val existingTxns = txnRepo.findAllByCaseIdAndDeletedAtIsNull(sourceCaseId)
            for (txn in existingTxns) {
                if (txn.action == VmaInventoryAction.OUT_CASE) {
                    txn.tripId = tripId
                    txn.caseId = null
                    txn.updatedAt = now
                    txnRepo.save(txn)
                }
            }
        }

        // Create new case linked to the trip
        val newCase = caseRepo.save(VmaClinicalCase(
            caseId = newCaseId,
            caseNo = dto.caseNo?.ifBlank { null },
            siteId = dto.siteId,
            patientId = dto.patientId,
            caseDate = LocalDate.parse(dto.caseDate),
            operator = source.operator,
            tripId = tripId,
            status = VmaClinicalCaseStatus.IN_PROGRESS,
        ))

        log.info("Added related case {} to trip {} (source: {})", newCaseId, tripId, sourceCaseId)
        return mapOf(
            "caseId" to newCase.caseId,
            "tripId" to tripId,
            "siblings" to caseRepo.findAllByTripId(tripId).map { it.caseId },
        )
    }

    fun addCaseItem(caseId: String, dto: AddCaseItemRequest): VmaInventoryTransaction {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed case")

        return txnRepo.save(VmaInventoryTransaction(
            id = UUID.randomUUID().toString(),
            date = c.caseDate,
            action = VmaInventoryAction.OUT_CASE,
            productType = VmaProductType.valueOf(dto.productType),
            specNo = dto.specNo,
            serialNo = dto.serialNo,
            qty = dto.qty,
            expDate = dto.expDate?.let { LocalDate.parse(it) },
            batchNo = dto.batchNo,
            caseId = caseId,
        )).also {
            // Auto-remove from fridge when going to WIP
            invService.clearFridgeSlotBySerial(dto.specNo, dto.serialNo)
        }
    }

    /**
     * Add multiple items to a case in a single transactional call.
     */
    fun addCaseItemsBatch(caseId: String, items: List<AddCaseItemRequest>): List<VmaInventoryTransaction> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed case")
        require(items.isNotEmpty()) { "At least one item is required" }

        return items.map { dto ->
            txnRepo.save(VmaInventoryTransaction(
                id = UUID.randomUUID().toString(),
                date = c.caseDate,
                action = VmaInventoryAction.OUT_CASE,
                productType = VmaProductType.valueOf(dto.productType),
                specNo = dto.specNo,
                serialNo = dto.serialNo,
                qty = dto.qty,
                expDate = dto.expDate?.let { LocalDate.parse(it) },
                batchNo = dto.batchNo,
                caseId = caseId,
            )).also {
                invService.clearFridgeSlotBySerial(dto.specNo, dto.serialNo)
            }
        }
    }

    // ═══════════ Case Completion ═══════════

    fun completeCase(caseId: String, dto: CompleteCaseRequest): Map<String, Any> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Case is already completed")

        // For trip cases, transactions are stored with tripId (caseId=null)
        val isTrip = c.tripId != null
        val caseTxns = if (isTrip) {
            txnRepo.findAllByTripIdAndDeletedAtIsNull(c.tripId!!)
        } else {
            txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
        }
        val txnMap = caseTxns.associateBy { it.id }

        val now = LocalDate.now()

        if (isTrip) {
            // ── Trip completion: per-case ──
            // Only the OUT_CASE items NOT already USED by other cases are available
            // Count-based: for DS products, same serial can have multiple OUT_CASE records
            val usedCounts = caseTxns
                .filter { it.action == VmaInventoryAction.USED_CASE }
                .groupBy { "${it.specNo}|${it.serialNo}" }
                .mapValues { it.value.size }
            val consumedCounts = mutableMapOf<String, Int>()
            val availableOutTxns = caseTxns
                .filter { it.action == VmaInventoryAction.OUT_CASE }
                .filter { txn ->
                    val key = "${txn.specNo}|${txn.serialNo}"
                    val usedQty = usedCounts[key] ?: 0
                    val consumed = consumedCounts[key] ?: 0
                    if (consumed < usedQty) {
                        consumedCounts[key] = consumed + 1
                        false // this unit was consumed by a USED_CASE
                    } else {
                        true // available
                    }
                }

            val availableIds = availableOutTxns.map { it.id }.toSet()
            val submittedIds = dto.items.map { it.txnId }.toSet()

            // Validate: every submitted txnId is an available OUT_CASE
            for (item in dto.items) {
                require(availableIds.contains(item.txnId)) {
                    "Transaction \"${item.txnId}\" is not available for this case"
                }
            }

            // Process items: only write USED_CASE immediately; skip "returned" items
            for (item in dto.items) {
                if (!item.returned) {
                    val origTxn = txnMap[item.txnId] ?: continue
                    txnRepo.save(VmaInventoryTransaction(
                        id = UUID.randomUUID().toString(),
                        date = now, action = VmaInventoryAction.USED_CASE,
                        productType = origTxn.productType, specNo = origTxn.specNo,
                        serialNo = origTxn.serialNo, qty = origTxn.qty,
                        expDate = origTxn.expDate, batchNo = origTxn.batchNo,
                        caseId = caseId, tripId = c.tripId,
                        notes = "COMPLETION_AUTO|USED",
                    ))
                }
                // "returned" items: do nothing yet — they stay as OUT_CASE with tripId
            }

            // Mark this case COMPLETED
            c.status = VmaClinicalCaseStatus.COMPLETED
            c.updatedAt = Instant.now()
            caseRepo.save(c)

            // Check: are ALL trip cases now COMPLETED?
            val tripCases = caseRepo.findAllByTripId(c.tripId!!)
            val allDone = tripCases.all { it.status == VmaClinicalCaseStatus.COMPLETED }
            if (allDone) {
                // Auto-return remaining products (OUT_CASE with tripId, not matched by any USED_CASE)
                // Count-based: DS products can have multiple OUT_CASE per serial
                val allTripTxns = txnRepo.findAllByTripIdAndDeletedAtIsNull(c.tripId!!)
                val returnUsedCounts = allTripTxns
                    .filter { it.action == VmaInventoryAction.USED_CASE }
                    .groupBy { "${it.specNo}|${it.serialNo}" }
                    .mapValues { it.value.size }
                val returnConsumed = mutableMapOf<String, Int>()
                val toReturn = caseTxns
                    .filter { it.action == VmaInventoryAction.OUT_CASE }
                    .filter { txn ->
                        val key = "${txn.specNo}|${txn.serialNo}"
                        val usedQty = returnUsedCounts[key] ?: 0
                        val consumed = returnConsumed[key] ?: 0
                        if (consumed < usedQty) {
                            returnConsumed[key] = consumed + 1
                            false // matched by USED_CASE — not returned
                        } else {
                            true // not used — should be returned
                        }
                    }

                for (outTxn in toReturn) {
                    txnRepo.save(VmaInventoryTransaction(
                        id = UUID.randomUUID().toString(),
                        date = now, action = VmaInventoryAction.REC_CASE,
                        productType = outTxn.productType, specNo = outTxn.specNo,
                        serialNo = outTxn.serialNo, qty = outTxn.qty,
                        expDate = outTxn.expDate, batchNo = outTxn.batchNo,
                        tripId = c.tripId, inspection = VmaInspectionResult.ACCEPT,
                        condition = arrayOf(), notes = "COMPLETION_AUTO|REC|TRIP_FINAL",
                    ))
                }
            }
        } else {
            // ── Standalone case: original behavior ──
            val outCaseIds = caseTxns
                .filter { it.action == VmaInventoryAction.OUT_CASE }
                .map { it.id }
                .toSet()
            val submittedIds = dto.items.map { it.txnId }.toSet()

            for (item in dto.items) {
                require(txnMap.containsKey(item.txnId)) {
                    "Transaction \"${item.txnId}\" does not belong to this case"
                }
            }
            val missing = outCaseIds - submittedIds
            require(missing.isEmpty()) {
                "All products must be accounted for. Missing: ${missing.joinToString()}"
            }

            for (item in dto.items) {
                val origTxn = txnMap[item.txnId] ?: continue
                if (!item.returned) {
                    txnRepo.save(VmaInventoryTransaction(
                        id = UUID.randomUUID().toString(),
                        date = now, action = VmaInventoryAction.USED_CASE,
                        productType = origTxn.productType, specNo = origTxn.specNo,
                        serialNo = origTxn.serialNo, qty = origTxn.qty,
                        expDate = origTxn.expDate, batchNo = origTxn.batchNo,
                        caseId = caseId, notes = "COMPLETION_AUTO|USED",
                    ))
                } else {
                    val accepted = item.accepted != false
                    val condArr = item.returnCondition?.toTypedArray() ?: arrayOf()
                    txnRepo.save(VmaInventoryTransaction(
                        id = UUID.randomUUID().toString(),
                        date = now, action = VmaInventoryAction.REC_CASE,
                        productType = origTxn.productType, specNo = origTxn.specNo,
                        serialNo = origTxn.serialNo, qty = origTxn.qty,
                        expDate = origTxn.expDate, batchNo = origTxn.batchNo,
                        caseId = caseId, inspection = if (accepted) VmaInspectionResult.ACCEPT else VmaInspectionResult.REJECT,
                        condition = condArr, notes = "COMPLETION_AUTO|REC",
                    ))
                    if (!accepted) {
                        txnRepo.save(VmaInventoryTransaction(
                            id = UUID.randomUUID().toString(),
                            date = now, action = VmaInventoryAction.MOVE_DEMO,
                            productType = origTxn.productType, specNo = origTxn.specNo,
                            serialNo = origTxn.serialNo, qty = origTxn.qty,
                            expDate = origTxn.expDate, batchNo = origTxn.batchNo,
                            caseId = caseId, inspection = VmaInspectionResult.REJECT,
                            condition = condArr, notes = "COMPLETION_AUTO|DEMO",
                        ))
                    }
                }
            }

            c.status = VmaClinicalCaseStatus.COMPLETED
            c.updatedAt = Instant.now()
            caseRepo.save(c)
        }

        return mapOf("success" to true, "caseId" to caseId, "status" to "COMPLETED")
    }

    fun reverseCompletion(caseId: String): Map<String, Any> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status != VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Case is not completed")

        val isTrip = c.tripId != null

        if (isTrip) {
            // ── Trip reversal ──
            // 1. Delete ALL REC_CASE for the trip (auto-return when all cases were done)
            // 2. Delete USED_CASE for THIS case only (keep other cases' USED)
            val allTripTxns = txnRepo.findAllByTripIdAndDeletedAtIsNull(c.tripId!!)
            val toDelete = allTripTxns.filter { txn ->
                txn.action == VmaInventoryAction.REC_CASE ||
                (txn.action == VmaInventoryAction.USED_CASE && txn.caseId == caseId)
            }
            txnRepo.deleteAll(toDelete)

            // Revert this case status
            c.status = VmaClinicalCaseStatus.IN_PROGRESS
            c.updatedAt = Instant.now()
            caseRepo.save(c)
        } else {
            // ── Standalone case: delete all completion artifacts ──
            val allTxns = txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
            val completionTxns = allTxns.filter { it.action != VmaInventoryAction.OUT_CASE }
            txnRepo.deleteAll(completionTxns)

            c.status = VmaClinicalCaseStatus.IN_PROGRESS
            c.updatedAt = Instant.now()
            caseRepo.save(c)
        }

        return mapOf("success" to true, "caseId" to caseId, "status" to "IN_PROGRESS")
    }
}
