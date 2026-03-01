package com.mgmt.modules.sales.application.usecase.report

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import com.mgmt.modules.sales.domain.model.SalesAction
import java.math.BigDecimal

/**
 * SkuSlot — 从 CleanedTransaction 的 10-slot 结构中提取的单个 SKU 及其数量。
 *
 * V3: CleanedTransaction.sku1..sku10 / quantity1..quantity10
 */
data class SkuSlot(
    val sku: String,
    val perQty: Int,     // V1: qty{i} = per unit quantity
)

/**
 * Extract SKU slots from a CleanedTransaction.
 *
 */
fun CleanedTransaction.extractSkuSlots(): List<SkuSlot> {
    val slots = mutableListOf<SkuSlot>()
    val pairs = listOf(
        sku1 to quantity1, sku2 to quantity2, sku3 to quantity3,
        sku4 to quantity4, sku5 to quantity5, sku6 to quantity6,
        sku7 to quantity7, sku8 to quantity8, sku9 to quantity9,
        sku10 to quantity10,
    )
    for ((sku, qty) in pairs) {
        val s = sku?.trim()?.uppercase()
        if (s.isNullOrBlank() || s == "NAN" || s == "NONE" || s == "0") break
        slots.add(SkuSlot(s, qty ?: 0))
    }
    return slots
}

/**
 * Accumulate fee values from a CleanedTransaction row.
 *
 * V3 adaptation: V3 stores fees in typed columns, not TEXT.
 *   V1 has separate "Refund X" columns → V3 stores them in the same column
 *   (e.g., NN row has positive fee, RE row has the refund fee value).
 *
 * Returns a FeeBreakdown with each category summed.
 */
data class FeeBreakdown(
    var shippingFee: BigDecimal = BigDecimal.ZERO,
    var sellerTax: BigDecimal = BigDecimal.ZERO,
    var ebayTax: BigDecimal = BigDecimal.ZERO,
    var fvfFeeFixed: BigDecimal = BigDecimal.ZERO,
    var fvfFeeVariable: BigDecimal = BigDecimal.ZERO,
    var regulatoryFee: BigDecimal = BigDecimal.ZERO,
    var intlFee: BigDecimal = BigDecimal.ZERO,
    var adFee: BigDecimal = BigDecimal.ZERO,
    var promoFee: BigDecimal = BigDecimal.ZERO,
    var inadFee: BigDecimal = BigDecimal.ZERO,  // HIGH_ITEM_NOT_AS_DESCRIBED_FEE (from other_fee)
    var disputeFee: BigDecimal = BigDecimal.ZERO,
    var labelCost: BigDecimal = BigDecimal.ZERO,
    var labelReturn: BigDecimal = BigDecimal.ZERO,
) {
    /**
     * net_platform_fee = sum of PLATFORM_FEE_GROUP columns.
     * API stores fees as POSITIVE (expense from seller).
     * Profit formula: profit = rev + cog + fees, where fees are negative.
     * → we negate here so profit formula works: -fvf - regulatory - intl
     */
    val netPlatformFee: BigDecimal
        get() = -(fvfFeeFixed + fvfFeeVariable + regulatoryFee + intlFee)

    /** net_shipping = buyer-paid shipping (positive = income) */
    val netShipping: BigDecimal get() = shippingFee
    /** net_tax = all tax columns summed (pass-through, neutral) */
    val netTax: BigDecimal get() = sellerTax + ebayTax
    /** net_ad_fee (negative = expense) */
    val netAdFee: BigDecimal get() = -adFee
    /** net_promo_fee (negative = expense) */
    val netPromoFee: BigDecimal get() = -promoFee
    /** net_inad_fee = HIGH_ITEM_NOT_AS_DESCRIBED_FEE (negative = penalty) */
    val netInadFee: BigDecimal get() = -inadFee
    /** net_postage_cost = Shipping label cost (already negative in API) */
    val netPostageCost: BigDecimal get() = labelCost
    /** net_return_postage = Return shipping label cost (already negative in API) */
    val netReturnPostage: BigDecimal get() = labelReturn
    /** net_third_party_fee = Payments dispute fee (negative = expense) */
    val netThirdPartyFee: BigDecimal get() = -disputeFee

    /**
     * Accumulate fee values from a CleanedTransaction row.
     *
     * API convention: platform fees are POSITIVE (deducted from seller).
     * Refund rows (RE/CA) have NEGATIVE fees (refunded back to seller).
     * We store raw values here; sign normalization happens in computed properties above.
     */
    fun addFrom(tx: CleanedTransaction, weight: BigDecimal) {
        shippingFee += tx.shippingFee * weight
        sellerTax += tx.sellerTax * weight
        ebayTax += tx.ebayTax * weight
        fvfFeeFixed += tx.fvfFeeFixed * weight
        fvfFeeVariable += tx.fvfFeeVariable * weight
        regulatoryFee += tx.regulatoryFee * weight
        intlFee += tx.intlFee * weight
        adFee += tx.adFee * weight
        promoFee += tx.promoFee * weight
        inadFee += tx.otherFee * weight  // other_fee = INAD + regulatory from API Transform
        disputeFee += tx.disputeFee * weight
        labelCost += tx.labelCost * weight
        labelReturn += tx.labelReturn * weight
    }
}
