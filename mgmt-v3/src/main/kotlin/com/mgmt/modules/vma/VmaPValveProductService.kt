package com.mgmt.modules.vma

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

/**
 * VmaPValveProductService — P-Valve + Delivery System + Fit 产品管理
 *
 * V2 parity: pvalve-product.service.ts (289 lines)
 */
@Service
@Transactional
class VmaPValveProductService(
    private val pvRepo: VmaPValveProductRepository,
    private val dsRepo: VmaDeliverySystemProductRepository,
    private val fitRepo: VmaDeliverySystemFitRepository,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    // ═══════════ P-Valve Products ═══════════

    fun findAllPValveProducts(): List<PValveProductResponse> {
        val products = pvRepo.findAllByIsActiveTrueOrderByModelAscSpecificationAsc()
        val allFits = fitRepo.findAllByPvalveIdIn(products.map { it.id })
        val fitMap = allFits.groupBy { it.pvalveId }
        val dsIds = allFits.map { it.deliverySystemId }.distinct()
        val dsMap = dsRepo.findAllById(dsIds).associateBy { it.id }

        return products.map { pv ->
            val fits = fitMap[pv.id]?.mapNotNull { fit ->
                dsMap[fit.deliverySystemId]?.let { ds ->
                    FitRef(ds.id, ds.model, ds.specification)
                }
            } ?: emptyList()
            toPValveResponse(pv, fits)
        }
    }

    fun createPValveProduct(dto: CreatePValveProductRequest): PValveProductResponse {
        pvRepo.findBySpecification(dto.specification)?.let {
            throw ConflictException("P-Valve specification \"${dto.specification}\" already exists")
        }
        val pv = pvRepo.save(VmaPValveProduct(
            id = UUID.randomUUID().toString(),
            model = dto.model,
            specification = dto.specification,
            diameterA = dto.diameterA,
            diameterB = dto.diameterB,
            diameterC = dto.diameterC,
            expandedLengthD = dto.expandedLengthD,
            expandedLengthE = dto.expandedLengthE,
            crimpedTotalLength = dto.crimpedTotalLength,
        ))
        return toPValveResponse(pv, emptyList())
    }

    fun updatePValveProduct(id: String, dto: UpdatePValveProductRequest): PValveProductResponse {
        val pv = pvRepo.findById(id).orElseThrow { NotFoundException("P-Valve product not found") }
        dto.model?.let { pv.model = it }
        dto.diameterA?.let { pv.diameterA = it }
        dto.diameterB?.let { pv.diameterB = it }
        dto.diameterC?.let { pv.diameterC = it }
        dto.expandedLengthD?.let { pv.expandedLengthD = it }
        dto.expandedLengthE?.let { pv.expandedLengthE = it }
        dto.crimpedTotalLength?.let { pv.crimpedTotalLength = it }
        pv.updatedAt = Instant.now()
        pvRepo.save(pv)

        val fits = fitRepo.findAllByPvalveId(id).mapNotNull { fit ->
            dsRepo.findById(fit.deliverySystemId).orElse(null)?.let {
                FitRef(it.id, it.model, it.specification)
            }
        }
        return toPValveResponse(pv, fits)
    }

    fun deletePValveProduct(id: String): PValveProductResponse {
        val pv = pvRepo.findById(id).orElseThrow { NotFoundException("P-Valve product not found") }
        pv.isActive = false
        pv.updatedAt = Instant.now()
        pvRepo.save(pv)
        return toPValveResponse(pv, emptyList())
    }

    // ═══════════ Delivery System Products ═══════════

    fun findAllDeliverySystemProducts(): List<DeliverySystemProductResponse> {
        val products = dsRepo.findAllByIsActiveTrueOrderByModelAscSpecificationAsc()
        val allFits = fitRepo.findAllByDeliverySystemIdIn(products.map { it.id })
        val fitMap = allFits.groupBy { it.deliverySystemId }
        val pvIds = allFits.map { it.pvalveId }.distinct()
        val pvMap = pvRepo.findAllById(pvIds).associateBy { it.id }

        return products.map { ds ->
            val fits = fitMap[ds.id]?.mapNotNull { fit ->
                pvMap[fit.pvalveId]?.let { FitRef(it.id, it.model, it.specification) }
            } ?: emptyList()
            toDsResponse(ds, fits)
        }
    }

    fun createDeliverySystemProduct(dto: CreateDeliverySystemProductRequest): DeliverySystemProductResponse {
        dsRepo.findBySpecification(dto.specification)?.let {
            throw ConflictException("Delivery System specification \"${dto.specification}\" already exists")
        }

        val ds = dsRepo.save(VmaDeliverySystemProduct(
            id = UUID.randomUUID().toString(),
            model = dto.model,
            specification = dto.specification,
        ))

        val fits = mutableListOf<FitRef>()
        if (!dto.fitPValveSpecs.isNullOrEmpty()) {
            val pvalves = pvRepo.findAllBySpecificationIn(dto.fitPValveSpecs)
            if (pvalves.size != dto.fitPValveSpecs.size) {
                val found = pvalves.map { it.specification }.toSet()
                val missing = dto.fitPValveSpecs.filter { it !in found }
                throw NotFoundException("P-Valve specifications not found: ${missing.joinToString()}")
            }
            for (pv in pvalves) {
                fitRepo.save(VmaDeliverySystemFit(
                    id = UUID.randomUUID().toString(),
                    deliverySystemId = ds.id,
                    pvalveId = pv.id,
                ))
                fits.add(FitRef(pv.id, pv.model, pv.specification))
            }
        }
        return toDsResponse(ds, fits)
    }

    fun updateDeliverySystemProduct(id: String, dto: UpdateDeliverySystemProductRequest): DeliverySystemProductResponse {
        val ds = dsRepo.findById(id).orElseThrow { NotFoundException("Delivery System product not found") }

        dto.model?.let { ds.model = it; ds.updatedAt = Instant.now(); dsRepo.save(ds) }

        if (dto.fitPValveSpecs != null) {
            fitRepo.deleteAllByDeliverySystemId(id)
            if (dto.fitPValveSpecs.isNotEmpty()) {
                val pvalves = pvRepo.findAllBySpecificationIn(dto.fitPValveSpecs)
                for (pv in pvalves) {
                    fitRepo.save(VmaDeliverySystemFit(
                        id = UUID.randomUUID().toString(),
                        deliverySystemId = id,
                        pvalveId = pv.id,
                    ))
                }
            }
        }

        val fits = fitRepo.findAllByDeliverySystemId(id).mapNotNull { fit ->
            pvRepo.findById(fit.pvalveId).orElse(null)?.let { FitRef(it.id, it.model, it.specification) }
        }
        return toDsResponse(ds, fits)
    }

    fun deleteDeliverySystemProduct(id: String): DeliverySystemProductResponse {
        val ds = dsRepo.findById(id).orElseThrow { NotFoundException("Delivery System product not found") }
        ds.isActive = false
        ds.updatedAt = Instant.now()
        dsRepo.save(ds)
        return toDsResponse(ds, emptyList())
    }

    // ═══════════ Fit Relationship ═══════════

    fun getFitMatrix(): FitMatrixResponse {
        val pvalves = findAllPValveProducts()
        val deliverySystems = findAllDeliverySystemProducts()
        return FitMatrixResponse(pvalves, deliverySystems)
    }

    fun updateFitRelationship(dto: UpdateFitRelationshipRequest): DeliverySystemProductResponse {
        val ds = dsRepo.findBySpecification(dto.deliverySystemSpec)
            ?: throw NotFoundException("Delivery System \"${dto.deliverySystemSpec}\" not found")

        fitRepo.deleteAllByDeliverySystemId(ds.id)

        if (dto.pvalveSpecs.isNotEmpty()) {
            val pvalves = pvRepo.findAllBySpecificationIn(dto.pvalveSpecs).filter { it.isActive }
            for (pv in pvalves) {
                fitRepo.save(VmaDeliverySystemFit(
                    id = UUID.randomUUID().toString(),
                    deliverySystemId = ds.id,
                    pvalveId = pv.id,
                ))
            }
        }

        val fits = fitRepo.findAllByDeliverySystemId(ds.id).mapNotNull { fit ->
            pvRepo.findById(fit.pvalveId).orElse(null)?.let { FitRef(it.id, it.model, it.specification) }
        }
        return toDsResponse(ds, fits)
    }

    // ═══════════ Helpers ═══════════

    private fun toPValveResponse(pv: VmaPValveProduct, fits: List<FitRef>) = PValveProductResponse(
        id = pv.id, model = pv.model, specification = pv.specification,
        diameterA = pv.diameterA, diameterB = pv.diameterB, diameterC = pv.diameterC,
        expandedLengthD = pv.expandedLengthD, expandedLengthE = pv.expandedLengthE,
        crimpedTotalLength = pv.crimpedTotalLength,
        isActive = pv.isActive, fits = fits,
        createdAt = pv.createdAt, updatedAt = pv.updatedAt,
    )

    private fun toDsResponse(ds: VmaDeliverySystemProduct, fits: List<FitRef>) = DeliverySystemProductResponse(
        id = ds.id, model = ds.model, specification = ds.specification,
        isActive = ds.isActive, fits = fits,
        createdAt = ds.createdAt, updatedAt = ds.updatedAt,
    )
}
