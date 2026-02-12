package com.mgmt.domain.vma

import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.JpaSpecificationExecutor
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository
import java.time.Instant

// ─── Employee ───────────────────────────────────────────

@Repository
interface VmaEmployeeRepository
    : JpaRepository<VmaEmployee, String>, JpaSpecificationExecutor<VmaEmployee> {

    fun findByEmployeeNo(employeeNo: String): VmaEmployee?

    fun findByEmployeeNoAndIdNot(employeeNo: String, id: String): VmaEmployee?
}

// ─── Department ─────────────────────────────────────────

@Repository
interface VmaDepartmentRepository : JpaRepository<VmaDepartment, String> {

    fun findByCodeAndDuties(code: String, duties: String): VmaDepartment?

    fun findByCodeAndDutiesAndIdNot(code: String, duties: String, id: String): VmaDepartment?

    fun findAllByOrderByCodeAscDutiesAsc(): List<VmaDepartment>
}

// ─── Employee-Department Junction ───────────────────────

@Repository
interface VmaEmployeeDepartmentRepository : JpaRepository<VmaEmployeeDepartment, String> {

    fun findAllByEmployeeIdOrderByAssignedAtAsc(employeeId: String): List<VmaEmployeeDepartment>

    fun findByEmployeeIdAndDepartmentIdAndRemovedAtIsNull(
        employeeId: String, departmentId: String,
    ): VmaEmployeeDepartment?

    fun findAllByEmployeeIdOrderByAssignedAtDesc(employeeId: String): List<VmaEmployeeDepartment>

    fun countByDepartmentId(departmentId: String): Long
}

// ─── Duty SOP Requirements ─────────────────────────────

@Repository
interface VmaDutySopRequirementRepository : JpaRepository<VmaDutySopRequirement, String> {

    fun findAllByDutyIdOrderByCreatedAtAsc(dutyId: String): List<VmaDutySopRequirement>

    fun deleteAllByDutyId(dutyId: String)
}

// ─── Duty SOP History ──────────────────────────────────

@Repository
interface VmaDutySopHistoryRepository : JpaRepository<VmaDutySopHistory, String> {

    fun findAllByDepartmentIdOrderByChangeDateAsc(departmentId: String): List<VmaDutySopHistory>

    fun findAllByDepartmentIdOrderByChangeDateDesc(departmentId: String): List<VmaDutySopHistory>

    fun findFirstByDepartmentIdOrderByChangeDateDesc(departmentId: String): VmaDutySopHistory?
}

// ─── Training SOP (for name lookups) ───────────────────

@Repository
interface VmaTrainingSopRepository : JpaRepository<VmaTrainingSop, String> {

    fun findBySopNoIn(sopNos: List<String>): List<VmaTrainingSop>

    fun findBySopNo(sopNo: String): VmaTrainingSop?

    fun findAllByOrderBySeqNoAsc(): List<VmaTrainingSop>

    fun findAllByStatusOrderBySeqNoAsc(status: VmaSopStatus): List<VmaTrainingSop>

    @Query("SELECT COALESCE(MAX(t.seqNo), 0) FROM VmaTrainingSop t")
    fun findMaxSeqNo(): Int
}

// ─── Training SOP Versions ─────────────────────────────

@Repository
interface VmaTrainingSopVersionRepository : JpaRepository<VmaTrainingSopVersion, String> {

    fun findAllBySopIdOrderByEffectiveDateDesc(sopId: String): List<VmaTrainingSopVersion>

    fun findAllBySopIdOrderByEffectiveDateAsc(sopId: String): List<VmaTrainingSopVersion>

    fun findBySopIdAndVersion(sopId: String, version: String): VmaTrainingSopVersion?

    fun findAllBySopIdInOrderByEffectiveDateAsc(sopIds: List<String>): List<VmaTrainingSopVersion>
}

// ─── Training Sessions ─────────────────────────────────

@Repository
interface VmaTrainingSessionRepository : JpaRepository<VmaTrainingSession, String> {

    fun findAllByOrderByTrainingNoDesc(): List<VmaTrainingSession>

    fun findByTrainingNo(trainingNo: String): VmaTrainingSession?
}

// ─── Training Records ──────────────────────────────────

@Repository
interface VmaTrainingRecordRepository : JpaRepository<VmaTrainingRecord, String> {

    fun findAllByOrderByCreatedAtDesc(): List<VmaTrainingRecord>

    fun findAllByEmployeeNoOrderByTrainingDateDesc(employeeNo: String): List<VmaTrainingRecord>

    fun findByEmployeeNoAndSopNoAndSopVersion(
        employeeNo: String, sopNo: String, sopVersion: String,
    ): VmaTrainingRecord?

    fun findAllBySessionId(sessionId: String): List<VmaTrainingRecord>

    fun deleteAllBySessionId(sessionId: String)

    @Query("SELECT DISTINCT r.employeeNo FROM VmaTrainingRecord r WHERE r.sessionId = :sessionId")
    fun findDistinctEmployeeNosBySessionId(sessionId: String): List<String>
}

// ─── P-Valve Product ───────────────────────────────────

@Repository
interface VmaPValveProductRepository : JpaRepository<VmaPValveProduct, String> {

    fun findBySpecification(specification: String): VmaPValveProduct?

    fun findAllByIsActiveTrueOrderByModelAscSpecificationAsc(): List<VmaPValveProduct>

    fun findAllBySpecificationIn(specs: List<String>): List<VmaPValveProduct>
}

// ─── Delivery System Product ────────────────────────────

@Repository
interface VmaDeliverySystemProductRepository : JpaRepository<VmaDeliverySystemProduct, String> {

    fun findBySpecification(specification: String): VmaDeliverySystemProduct?

    fun findAllBySpecificationIn(specs: List<String>): List<VmaDeliverySystemProduct>

    fun findAllByIsActiveTrueOrderByModelAscSpecificationAsc(): List<VmaDeliverySystemProduct>
}

// ─── Delivery System Fit ────────────────────────────────

@Repository
interface VmaDeliverySystemFitRepository : JpaRepository<VmaDeliverySystemFit, String> {

    fun findAllByDeliverySystemId(deliverySystemId: String): List<VmaDeliverySystemFit>

    fun findAllByPvalveId(pvalveId: String): List<VmaDeliverySystemFit>

    fun deleteAllByDeliverySystemId(deliverySystemId: String)

    fun findAllByDeliverySystemIdIn(dsIds: List<String>): List<VmaDeliverySystemFit>

    fun findAllByPvalveIdIn(pvIds: List<String>): List<VmaDeliverySystemFit>
}

// ─── Receiving Batch ────────────────────────────────────

@Repository
interface VmaReceivingBatchRepository : JpaRepository<VmaReceivingBatch, String> {

    fun findByBatchNo(batchNo: String): VmaReceivingBatch?

    fun findAllByOrderByDateReceivedDesc(): List<VmaReceivingBatch>
}

// ─── Inventory Transaction ──────────────────────────────

@Repository
interface VmaInventoryTransactionRepository : JpaRepository<VmaInventoryTransaction, String> {

    fun findAllByProductTypeAndDeletedAtIsNullOrderByDateDesc(
        productType: VmaProductType,
    ): List<VmaInventoryTransaction>

    fun findAllByDeletedAtIsNullOrderByDateDesc(): List<VmaInventoryTransaction>

    fun findAllByCaseIdAndDeletedAtIsNull(caseId: String): List<VmaInventoryTransaction>

    fun findAllByBatchNoAndDeletedAtIsNull(batchNo: String): List<VmaInventoryTransaction>

    fun findAllBySpecNoAndProductTypeAndDeletedAtIsNull(
        specNo: String, productType: VmaProductType,
    ): List<VmaInventoryTransaction>

    @Query("SELECT DISTINCT t.operator FROM VmaInventoryTransaction t WHERE t.operator IS NOT NULL AND t.deletedAt IS NULL")
    fun findDistinctOperators(): List<String>

    @Query("SELECT DISTINCT t.specNo FROM VmaInventoryTransaction t WHERE t.productType = :pt AND t.deletedAt IS NULL ORDER BY t.specNo")
    fun findDistinctSpecNos(pt: VmaProductType): List<String>
}

// ─── Clinical Case ──────────────────────────────────────

@Repository
interface VmaClinicalCaseRepository : JpaRepository<VmaClinicalCase, String> {

    fun findAllByOrderByCaseDateDesc(): List<VmaClinicalCase>

    fun findByCaseId(caseId: String): VmaClinicalCase?
}

// ─── Site ────────────────────────────────────────────────

@Repository
interface VmaSiteRepository : JpaRepository<VmaSite, String> {

    fun findAllByOrderBySiteIdAsc(): List<VmaSite>

    fun findBySiteId(siteId: String): VmaSite?
}

