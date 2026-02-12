package com.mgmt.common.response

import com.fasterxml.jackson.annotation.JsonInclude

/**
 * Unified API Response — single item
 */
data class ApiResponse<T>(
    val success: Boolean = true,
    val data: T,
) {
    companion object {
        fun <T> ok(data: T): ApiResponse<T> = ApiResponse(success = true, data = data)
    }
}

/**
 * Unified API Response — paginated list
 */
data class PagedResponse<T>(
    val data: List<T>,
    val meta: PageMeta
)

data class PageMeta(
    val page: Int,
    val size: Int,
    val total: Long,
    val totalPages: Int
) {
    companion object {
        fun of(page: Int, size: Int, total: Long): PageMeta {
            val totalPages = if (size > 0) ((total + size - 1) / size).toInt() else 0
            return PageMeta(page, size, total, totalPages)
        }
    }
}

/**
 * RFC 7807 Problem Details for error responses
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ProblemDetail(
    val type: String,
    val title: String,
    val status: Int,
    val detail: String,
    val errors: List<FieldError>? = null,
    val errorCode: String? = null,
    val remainingAttempts: Int? = null,
    val remainingSeconds: Int? = null,
    val traceId: String? = null
)

data class FieldError(
    val field: String,
    val code: String,
    val message: String
)
