package com.mgmt.modules.vma

import com.mgmt.common.exception.ConflictException
import com.mgmt.common.exception.NotFoundException
import com.mgmt.domain.vma.*
import com.mgmt.modules.vma.dto.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * VmaSiteService — 站点 CRUD
 * V2 parity: site.service.ts (34 lines)
 */
@Service
@Transactional
class VmaSiteService(
    private val siteRepo: VmaSiteRepository,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    fun findAll(): List<VmaSite> =
        siteRepo.findAllByOrderBySiteIdAsc()

    fun create(dto: CreateSiteRequest): VmaSite {
        siteRepo.findBySiteId(dto.siteId)?.let {
            throw ConflictException("Site ID \"${dto.siteId}\" already exists")
        }
        return siteRepo.save(VmaSite(
            siteId = dto.siteId,
            siteName = dto.siteName,
            address = dto.address,
            address2 = dto.address2,
            city = dto.city,
            state = dto.state,
            zipCode = dto.zipCode,
            country = dto.country,
        ))
    }

    fun update(siteId: String, dto: UpdateSiteRequest): VmaSite {
        val site = siteRepo.findBySiteId(siteId)
            ?: throw NotFoundException("Site \"$siteId\" not found")

        dto.siteName?.let { site.siteName = it }
        dto.address?.let { site.address = it }
        dto.address2?.let { site.address2 = it }
        dto.city?.let { site.city = it }
        dto.state?.let { site.state = it }
        dto.zipCode?.let { site.zipCode = it }
        dto.country?.let { site.country = it }
        site.updatedAt = Instant.now()

        return siteRepo.save(site)
    }
}
