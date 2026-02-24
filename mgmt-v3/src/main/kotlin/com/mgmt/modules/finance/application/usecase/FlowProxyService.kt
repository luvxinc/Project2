package com.mgmt.modules.finance.application.usecase

import com.fasterxml.jackson.databind.ObjectMapper
import com.mgmt.modules.finance.application.dto.*
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.net.HttpURLConnection
import java.net.URI

/**
 * FlowProxyService — Proxies flow overview requests to V1 Django backend.
 *
 * V1 endpoints:
 *   GET /dashboard/finance/flow/api/list/
 *   GET /dashboard/finance/flow/api/detail/?po_num=XXX
 *
 * Rationale: The flow calculation is ~900 lines of Python with 11-step
 * multi-table aggregation. Rather than re-implementing immediately,
 * we proxy to V1 and serve the data through V3's API contract.
 */
@Service
class FlowProxyService(
    @Value("\${mgmt.v1.base-url:http://localhost:8000}") private val v1BaseUrl: String,
) {

    private val log = LoggerFactory.getLogger(javaClass)
    private val mapper = ObjectMapper()

    /**
     * Proxy the flow list from V1.
     * V1 returns: { success: true, data: [...], count: N }
     */
    fun getFlowList(sessionCookie: String): FlowListResponse {
        val url = "$v1BaseUrl/dashboard/finance/flow/api/list/"
        val json = fetchFromV1(url, sessionCookie)

        val root = mapper.readTree(json)
        if (root["success"]?.asBoolean() != true) {
            val msg = root["message"]?.asText() ?: "V1 flow list failed"
            throw RuntimeException(msg)
        }

        val dataNode = root["data"]
        val items = mutableListOf<FlowOrderItem>()

        if (dataNode != null && dataNode.isArray) {
            for (node in dataNode) {
                items.add(FlowOrderItem(
                    poNum = node["po_num"]?.asText() ?: "",
                    poDate = node["po_date"]?.asText() ?: "",
                    skuCount = node["sku_count"]?.asInt() ?: 0,
                    curCurrency = node["cur_currency"]?.asText() ?: "USD",
                    curUsdRmb = node["cur_usd_rmb"]?.asDouble() ?: 7.0,
                    totalAmount = node["total_amount"]?.asDouble() ?: 0.0,
                    totalAmountUsd = node["total_amount_usd"]?.asDouble() ?: 0.0,
                    depositRequiredUsd = node["deposit_required_usd"]?.asDouble() ?: 0.0,
                    depositPar = node["deposit_par"]?.asDouble() ?: 0.0,
                    depositStatus = node["deposit_status"]?.asText() ?: "not_required",
                    depositStatusText = node["deposit_status_text"]?.asText() ?: "",
                    depPaidUsd = node["dep_paid_usd"]?.asDouble() ?: 0.0,
                    pmtPaid = node["pmt_paid"]?.asDouble() ?: 0.0,
                    pmtPaidUsd = node["pmt_paid_usd"]?.asDouble() ?: 0.0,
                    balanceRemaining = node["balance_remaining"]?.asDouble() ?: 0.0,
                    balanceRemainingUsd = node["balance_remaining_usd"]?.asDouble() ?: 0.0,
                    actualPaid = node["actual_paid"]?.asDouble() ?: 0.0,
                    actualPaidUsd = node["actual_paid_usd"]?.asDouble() ?: 0.0,
                    waiverUsd = node["waiver_usd"]?.asDouble() ?: 0.0,
                    depExtraUsd = node["dep_extra_usd"]?.asDouble() ?: 0.0,
                    pmtExtraUsd = node["pmt_extra_usd"]?.asDouble() ?: 0.0,
                    logisticsExtraUsd = node["logistics_extra_usd"]?.asDouble() ?: 0.0,
                    totalExtra = node["total_extra"]?.asDouble() ?: 0.0,
                    totalExtraUsd = node["total_extra_usd"]?.asDouble() ?: 0.0,
                    logisticsList = node["logistics_list"]?.map { it.asText() } ?: emptyList(),
                    orderWeightKg = node["order_weight_kg"]?.asDouble() ?: 0.0,
                    logisticsApportioned = node["logistics_apportioned"]?.asDouble() ?: 0.0,
                    logisticsApportionedUsd = node["logistics_apportioned_usd"]?.asDouble() ?: 0.0,
                    logisticsCurrency = node["logistics_currency"]?.asText() ?: "RMB",
                    logisticsUsdRmb = node["logistics_usd_rmb"]?.asDouble() ?: 7.0,
                    totalCost = node["total_cost"]?.asDouble() ?: 0.0,
                    totalCostUsd = node["total_cost_usd"]?.asDouble() ?: 0.0,
                    orderStatus = node["order_status"]?.asText() ?: "pending",
                    orderStatusText = node["order_status_text"]?.asText() ?: "",
                    hasDiff = node["has_diff"]?.asBoolean() ?: false,
                    logisticsStatus = node["logistics_status"]?.asText() ?: "none",
                    logisticsPaymentStatus = node["logistics_payment_status"]?.asText() ?: "unpaid",
                    paymentStatusText = node["payment_status_text"]?.asText() ?: "",
                    curFloat = node["cur_float"]?.asBoolean() ?: false,
                    curExFloat = node["cur_ex_float"]?.asDouble() ?: 0.0,
                    fluctuationTriggered = node["fluctuation_triggered"]?.asBoolean() ?: false,
                ))
            }
        }

        return FlowListResponse(data = items, count = items.size)
    }

    /**
     * Proxy the flow detail from V1.
     * V1 returns: { success: true, data: [...], meta: { ... } }
     */
    fun getFlowDetail(poNum: String, sessionCookie: String): FlowDetailResponse {
        val url = "$v1BaseUrl/dashboard/finance/flow/api/detail/?po_num=${java.net.URLEncoder.encode(poNum, "UTF-8")}"
        val json = fetchFromV1(url, sessionCookie)

        val root = mapper.readTree(json)
        if (root["success"]?.asBoolean() != true) {
            val msg = root["message"]?.asText() ?: "V1 flow detail failed"
            throw RuntimeException(msg)
        }

        val dataNode = root["data"]
        val blocks = mutableListOf<FlowLogisticsBlock>()

        if (dataNode != null && dataNode.isArray) {
            for (block in dataNode) {
                val skus = mutableListOf<FlowSkuDetail>()
                val skuNode = block["skus"]
                if (skuNode != null && skuNode.isArray) {
                    for (s in skuNode) {
                        skus.add(FlowSkuDetail(
                            sku = s["sku"]?.asText() ?: "",
                            priceOriginal = s["price_original"]?.asDouble() ?: 0.0,
                            priceUsd = s["price_usd"]?.asDouble() ?: 0.0,
                            actualPrice = s["actual_price"]?.asDouble() ?: 0.0,
                            actualPriceUsd = s["actual_price_usd"]?.asDouble() ?: 0.0,
                            feeApportioned = s["fee_apportioned"]?.asDouble() ?: 0.0,
                            feeApportionedUsd = s["fee_apportioned_usd"]?.asDouble() ?: 0.0,
                            landedPrice = s["landed_price"]?.asDouble() ?: 0.0,
                            landedPriceUsd = s["landed_price_usd"]?.asDouble() ?: 0.0,
                            qty = s["qty"]?.asInt() ?: 0,
                            totalUsd = s["total_usd"]?.asDouble() ?: 0.0,
                        ))
                    }
                }

                blocks.add(FlowLogisticsBlock(
                    logisticNum = block["logistic_num"]?.asText() ?: "",
                    currency = block["currency"]?.asText() ?: "USD",
                    usdRmb = block["usd_rmb"]?.asDouble() ?: 7.0,
                    logPriceRmb = block["log_price_rmb"]?.asDouble() ?: 0.0,
                    logPriceUsd = block["log_price_usd"]?.asDouble() ?: 0.0,
                    isPaid = block["is_paid"]?.asBoolean() ?: false,
                    skus = skus,
                ))
            }
        }

        val metaNode = root["meta"]
        val meta = if (metaNode != null) {
            FlowDetailMeta(
                totalCostUsd = metaNode["total_cost_usd"]?.asDouble() ?: 0.0,
                totalCostRmb = metaNode["total_cost_rmb"]?.asDouble() ?: 0.0,
            )
        } else null

        return FlowDetailResponse(data = blocks, count = blocks.size, meta = meta)
    }

    /**
     * Make an HTTP GET request to V1 Django with the user's session cookie.
     */
    private fun fetchFromV1(url: String, sessionCookie: String): String {
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.setRequestProperty("Cookie", "sessionid=$sessionCookie")
        connection.connectTimeout = 15000
        connection.readTimeout = 30000

        val responseCode = connection.responseCode
        if (responseCode != 200) {
            val errorBody = try { connection.errorStream?.bufferedReader()?.readText() } catch (_: Exception) { null }
            throw RuntimeException("V1 returned $responseCode: ${errorBody ?: "no body"}")
        }

        return connection.inputStream.bufferedReader().readText()
    }
}
