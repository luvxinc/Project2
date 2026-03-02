package com.mgmt.modules.ebayapi.infrastructure

import org.slf4j.LoggerFactory
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException

/**
 * Shared utilities for eBay API integration.
 */
object EbayApiUtils {

    private val log = LoggerFactory.getLogger(EbayApiUtils::class.java)

    /**
     * Escape XML special characters to prevent XML injection.
     * Handles the 5 predefined XML entities: & < > " '
     */
    fun escapeXml(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")

    /**
     * Retry an eBay API call with exponential backoff on 429/5xx errors.
     *
     * @param maxRetries max number of retries (default 3)
     * @param label log label for this call
     * @param block the API call to execute
     * @return result of the API call
     * @throws the last exception if all retries are exhausted
     */
    fun <T> callWithRetry(
        maxRetries: Int = 3,
        label: String = "eBay API",
        block: () -> T,
    ): T {
        var lastException: Exception? = null
        for (attempt in 0..maxRetries) {
            try {
                return block()
            } catch (e: HttpClientErrorException) {
                if (e.statusCode.value() == 429) {
                    lastException = e
                    if (attempt < maxRetries) {
                        val delaySec = 1L shl attempt // 2^n: 1, 2, 4
                        log.warn("[Retry] {} got 429, retrying in {}s (attempt {}/{})",
                            label, delaySec, attempt + 1, maxRetries)
                        Thread.sleep(delaySec * 1000)
                    }
                } else {
                    throw e // 4xx (not 429) — don't retry
                }
            } catch (e: HttpServerErrorException) {
                lastException = e
                if (attempt < maxRetries) {
                    val delaySec = 1L shl attempt
                    log.warn("[Retry] {} got {}, retrying in {}s (attempt {}/{})",
                        label, e.statusCode.value(), delaySec, attempt + 1, maxRetries)
                    Thread.sleep(delaySec * 1000)
                }
            }
        }
        throw lastException!!
    }
}
