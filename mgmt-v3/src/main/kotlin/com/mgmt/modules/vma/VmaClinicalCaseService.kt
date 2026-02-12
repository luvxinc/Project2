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
 * V2 parity: clinical-case.service.ts (514 lines)
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
                "status" to c.status.name, "createdAt" to c.createdAt, "updatedAt" to c.updatedAt,
            )
        }
    }

    fun findOne(caseId: String): Map<String, Any?> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        val site = siteRepo.findBySiteId(c.siteId)
        val txns = txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
            .filter { it.action == VmaInventoryAction.OUT_CASE }
            .sortedWith(compareBy({ it.productType }, { it.specNo }, { it.serialNo }))
        return mapOf(
            "caseId" to c.caseId, "caseNo" to c.caseNo,
            "siteId" to c.siteId, "site" to site,
            "patientId" to c.patientId, "caseDate" to c.caseDate.toString(),
            "status" to c.status.name,
            "transactions" to txns,
            "createdAt" to c.createdAt, "updatedAt" to c.updatedAt,
        )
    }

    // ═══════════ Case Info Update ═══════════

    fun updateCaseInfo(caseId: String, dto: UpdateClinicalCaseInfoRequest): Map<String, Any?> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Cannot modify a completed case")

        if (dto.caseNo != null && dto.caseNo != c.caseNo) {
            // Check uniqueness
            val all = caseRepo.findAll()
            if (all.any { it.caseNo == dto.caseNo && it.caseId != caseId }) {
                throw ConflictException("Case # \"${dto.caseNo}\" already exists")
            }
        }

        dto.caseNo?.let { c.caseNo = it.ifEmpty { null } }
        dto.siteId?.let { c.siteId = it }
        dto.patientId?.let { c.patientId = it }
        dto.caseDate?.let { c.caseDate = LocalDate.parse(it) }
        c.updatedAt = Instant.now()
        caseRepo.save(c)

        val site = siteRepo.findBySiteId(c.siteId)
        return mapOf(
            "caseId" to c.caseId, "caseNo" to c.caseNo,
            "siteId" to c.siteId, "siteName" to site?.siteName,
            "patientId" to c.patientId, "caseDate" to c.caseDate.toString(),
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
            if (caseRepo.findAll().any { it.caseNo == dto.caseNo }) {
                throw ConflictException("Case # \"${dto.caseNo}\" already exists")
            }
        }

        val site = siteRepo.findBySiteId(dto.siteId)
            ?: throw NotFoundException("Site \"${dto.siteId}\" not found")

        require(dto.items.isNotEmpty()) { "At least one product item is required" }

        val caseDate = LocalDate.parse(dto.caseDate)

        // Create clinical case
        val clinicalCase = caseRepo.save(VmaClinicalCase(
            caseId = caseId,
            caseNo = dto.caseNo?.ifBlank { null },
            siteId = dto.siteId,
            patientId = dto.patientId,
            caseDate = caseDate,
            status = VmaClinicalCaseStatus.IN_PROGRESS,
        ))

        // Create OUT_CASE transactions for each item
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
                caseId = caseId,
            ))
        }

        return mapOf(
            "caseId" to clinicalCase.caseId, "caseNo" to clinicalCase.caseNo,
            "siteId" to clinicalCase.siteId, "site" to site,
            "patientId" to clinicalCase.patientId, "caseDate" to clinicalCase.caseDate.toString(),
            "status" to clinicalCase.status.name,
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
        val txns = txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
            .filter { it.action == VmaInventoryAction.OUT_CASE }
            .sortedWith(compareBy({ it.productType }, { it.specNo }, { it.serialNo }))

        // Build product spec name lookup
        val pvSpecs = txns.filter { it.productType == VmaProductType.PVALVE }
            .map { it.specNo }.distinct()
        val dsSpecs = txns.filter { it.productType == VmaProductType.DELIVERY_SYSTEM }
            .map { it.specNo }.distinct()
        val pvMap = pvRepo.findAllBySpecificationIn(pvSpecs).associateBy { it.specification }
        val dsMap = dsRepo.findAllBySpecificationIn(dsSpecs).associateBy { it.specification }

        val packingItems = txns.mapIndexed { idx, txn ->
            val deviceName = when (txn.productType) {
                VmaProductType.PVALVE -> "P-Valve ${pvMap[txn.specNo]?.model ?: txn.specNo}"
                VmaProductType.DELIVERY_SYSTEM -> "DS ${dsMap[txn.specNo]?.model ?: txn.specNo}"
            }
            val expFormatted = txn.expDate?.let {
                val months = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
                "${months[it.monthValue - 1]} ${it.year}"
            } ?: ""

            VmaPackingListPdfService.PackingItem(
                itemNo = idx + 1,
                specNo = txn.specNo,
                serialNo = txn.serialNo ?: "-",
                expDate = txn.expDate?.toString() ?: "",
                expDateFormatted = expFormatted,
                deviceName = deviceName,
            )
        }

        val data = VmaPackingListPdfService.PackingListData(
            caseId = caseId,
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
            .resolve("../apps/web/src/app/(dashboard)/vma/data/PackingList_UVP.pdf")
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
        ))
    }

    // ═══════════ Case Completion ═══════════

    fun completeCase(caseId: String, dto: CompleteCaseRequest): Map<String, Any> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status == VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Case is already completed")

        val caseTxns = txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
        val txnMap = caseTxns.associateBy { it.id }

        for (item in dto.items) {
            require(txnMap.containsKey(item.txnId)) {
                "Transaction \"${item.txnId}\" does not belong to this case"
            }
        }

        val now = LocalDate.now()

        for (item in dto.items) {
            val origTxn = txnMap[item.txnId] ?: continue

            if (!item.returned) {
                // USED_CASE — consumed
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

                // REC_CASE — return to inventory
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
                    // MOVE_DEMO — rejected, move to demo
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

        // Update case status
        c.status = VmaClinicalCaseStatus.COMPLETED
        c.updatedAt = Instant.now()
        caseRepo.save(c)

        return mapOf("success" to true, "caseId" to caseId, "status" to "COMPLETED")
    }

    fun reverseCompletion(caseId: String): Map<String, Any> {
        val c = caseRepo.findByCaseId(caseId)
            ?: throw NotFoundException("Case \"$caseId\" not found")
        if (c.status != VmaClinicalCaseStatus.COMPLETED)
            throw IllegalStateException("Case is not completed")

        // Delete all COMPLETION_AUTO transactions
        val autoTxns = txnRepo.findAllByCaseIdAndDeletedAtIsNull(caseId)
            .filter { it.notes?.startsWith("COMPLETION_AUTO") == true }
        txnRepo.deleteAll(autoTxns)

        // Revert status
        c.status = VmaClinicalCaseStatus.IN_PROGRESS
        c.updatedAt = Instant.now()
        caseRepo.save(c)

        return mapOf("success" to true, "caseId" to caseId, "status" to "IN_PROGRESS")
    }
}
