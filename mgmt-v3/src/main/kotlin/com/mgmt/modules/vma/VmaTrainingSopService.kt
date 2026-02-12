package com.mgmt.modules.vma

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.*
import java.util.UUID

/**
 * VmaTrainingSopService — Training SOP 文档管理
 *
 * V2 parity: training-sop.service.ts (213 lines)
 *
 * Features:
 *   - SOP 主文档 CRUD (两表架构: 主表 + 版本表)
 *   - 版本管理 (add / edit latest)
 *   - 状态切换 (ACTIVE / DEPRECATED)
 *   - 下一个可用 seqNo
 */
@Service
@Transactional
class VmaTrainingSopService(
    private val sopRepo: VmaTrainingSopRepository,
    private val versionRepo: VmaTrainingSopVersionRepository,
) {

    private val pacific = ZoneId.of("America/Los_Angeles")

    // ─── Pacific Date Parser (inline, same as Employee service) ──

    private fun parsePacificDate(dateStr: String): Instant =
        LocalDate.parse(dateStr)
            .atTime(12, 0)
            .atZone(pacific)
            .toInstant()

    // ─── findAll ────────────────────────────────────────

    fun findAll(): List<TrainingSopResponse> {
        val sops = sopRepo.findAllByOrderBySeqNoAsc()
        return sops.map { sop ->
            val versions = versionRepo.findAllBySopIdOrderByEffectiveDateDesc(sop.id)
            toResponse(sop, versions)
        }
    }

    // ─── findOne ────────────────────────────────────────

    fun findOne(id: String): TrainingSopResponse {
        val sop = sopRepo.findById(id)
            .orElseThrow { NotFoundException("Training SOP $id not found") }
        val versions = versionRepo.findAllBySopIdOrderByEffectiveDateDesc(sop.id)
        return toResponse(sop, versions)
    }

    // ─── create (SOP + initial version) ─────────────────

    fun create(dto: CreateTrainingSopRequest): TrainingSopResponse {
        sopRepo.findBySopNo(dto.sopNo)?.let {
            throw ConflictException("SOP ${dto.sopNo} already exists")
        }

        val sop = sopRepo.save(VmaTrainingSop(
            id = UUID.randomUUID().toString(),
            seqNo = dto.seqNo,
            sopNo = dto.sopNo,
            name = dto.name,
            description = dto.description,
            structureClassification = dto.structureClassification,
            documentType = dto.documentType,
            status = VmaSopStatus.ACTIVE,
        ))

        val version = versionRepo.save(VmaTrainingSopVersion(
            id = UUID.randomUUID().toString(),
            sopId = sop.id,
            version = dto.version,
            daNo = dto.daNo,
            effectiveDate = parsePacificDate(dto.effectiveDate),
            trainingRequired = dto.trainingRequired ?: true,
        ))

        return toResponse(sop, listOf(version))
    }

    // ─── update (SOP + latest version) ──────────────────

    fun update(id: String, dto: UpdateTrainingSopRequest): TrainingSopResponse {
        val sop = sopRepo.findById(id)
            .orElseThrow { NotFoundException("Training SOP $id not found") }

        dto.name?.let { sop.name = it }
        dto.description?.let { sop.description = it }
        dto.structureClassification?.let { sop.structureClassification = it }
        dto.documentType?.let { sop.documentType = it }
        sop.updatedAt = Instant.now()
        sopRepo.save(sop)

        // Update latest version fields if provided
        val versions = versionRepo.findAllBySopIdOrderByEffectiveDateDesc(sop.id)
        val latestVersion = versions.firstOrNull()
        if (latestVersion != null && (dto.version != null || dto.daNo != null || dto.effectiveDate != null || dto.trainingRequired != null)) {
            dto.version?.let { latestVersion.version = it }
            dto.daNo?.let { latestVersion.daNo = it }
            dto.effectiveDate?.let { latestVersion.effectiveDate = parsePacificDate(it) }
            dto.trainingRequired?.let { latestVersion.trainingRequired = it }
            latestVersion.updatedAt = Instant.now()
            versionRepo.save(latestVersion)
        }

        val updatedVersions = versionRepo.findAllBySopIdOrderByEffectiveDateDesc(sop.id)
        return toResponse(sop, updatedVersions)
    }

    // ─── addVersion ─────────────────────────────────────

    fun addVersion(sopId: String, dto: AddSopVersionRequest): SopVersionResponse {
        val sop = sopRepo.findById(sopId)
            .orElseThrow { NotFoundException("Training SOP $sopId not found") }

        versionRepo.findBySopIdAndVersion(sopId, dto.version)?.let {
            throw ConflictException("Version ${dto.version} already exists for SOP ${sop.sopNo}")
        }

        val version = versionRepo.save(VmaTrainingSopVersion(
            id = UUID.randomUUID().toString(),
            sopId = sopId,
            version = dto.version,
            daNo = dto.daNo,
            effectiveDate = parsePacificDate(dto.effectiveDate),
            trainingRequired = dto.trainingRequired ?: true,
        ))

        return SopVersionResponse(
            id = version.id,
            version = version.version,
            daNo = version.daNo,
            effectiveDate = version.effectiveDate,
            trainingRequired = version.trainingRequired,
        )
    }

    // ─── toggleStatus ───────────────────────────────────

    fun toggleStatus(id: String): TrainingSopResponse {
        val sop = sopRepo.findById(id)
            .orElseThrow { NotFoundException("Training SOP $id not found") }

        sop.status = if (sop.status == VmaSopStatus.ACTIVE) VmaSopStatus.DEPRECATED else VmaSopStatus.ACTIVE
        sop.updatedAt = Instant.now()
        sopRepo.save(sop)

        val versions = versionRepo.findAllBySopIdOrderByEffectiveDateDesc(sop.id)
        return toResponse(sop, versions)
    }

    // ─── getNextSeqNo ───────────────────────────────────

    fun getNextSeqNo(): Map<String, Int> =
        mapOf("nextSeqNo" to sopRepo.findMaxSeqNo() + 1)

    // ─── Response Mapper ────────────────────────────────

    private fun toResponse(sop: VmaTrainingSop, versions: List<VmaTrainingSopVersion>): TrainingSopResponse {
        val latest = versions.firstOrNull()
        return TrainingSopResponse(
            id = sop.id,
            seqNo = sop.seqNo,
            sopNo = sop.sopNo,
            name = sop.name,
            description = sop.description,
            structureClassification = sop.structureClassification,
            documentType = sop.documentType,
            status = sop.status.name,
            version = latest?.version ?: "",
            daNo = latest?.daNo ?: "",
            effectiveDate = latest?.effectiveDate ?: sop.createdAt,
            trainingRequired = latest?.trainingRequired ?: true,
            versions = versions.map { v ->
                SopVersionResponse(
                    id = v.id,
                    version = v.version,
                    daNo = v.daNo,
                    effectiveDate = v.effectiveDate,
                    trainingRequired = v.trainingRequired,
                )
            },
            createdAt = sop.createdAt,
            updatedAt = sop.updatedAt,
        )
    }
}
