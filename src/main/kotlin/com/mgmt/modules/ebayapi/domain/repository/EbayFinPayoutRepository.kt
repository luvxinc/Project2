package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbayFinPayout
import org.springframework.data.jpa.repository.JpaRepository

interface EbayFinPayoutRepository : JpaRepository<EbayFinPayout, Long> {
    fun findByPayoutId(payoutId: String): EbayFinPayout?
    fun existsByPayoutId(payoutId: String): Boolean
}
