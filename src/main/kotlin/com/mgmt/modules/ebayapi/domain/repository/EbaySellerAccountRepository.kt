package com.mgmt.modules.ebayapi.domain.repository

import com.mgmt.modules.ebayapi.domain.model.EbaySellerAccount
import org.springframework.data.jpa.repository.JpaRepository

interface EbaySellerAccountRepository : JpaRepository<EbaySellerAccount, Long> {
    fun findBySellerUsername(sellerUsername: String): EbaySellerAccount?
    fun findAllByStatus(status: String): List<EbaySellerAccount>
    fun findAllByStatusOrderBySellerUsernameAsc(status: String): List<EbaySellerAccount>
    fun existsBySellerUsername(sellerUsername: String): Boolean
}
