package com.mgmt.common.exception

import org.springframework.http.HttpStatus

/**
 * Base business exception — all domain-specific exceptions extend this.
 *
 * Maps cleanly to RFC 7807 ProblemDetail via GlobalExceptionHandler.
 * Preserves V2 security fields for frontend compatibility.
 */
open class BusinessException(
    message: String,
    val status: HttpStatus = HttpStatus.BAD_REQUEST,
    val errorCode: String = "business_error",
    val title: String = "Business Error",
    val remainingAttempts: Int? = null,
    val remainingSeconds: Int? = null,
) : RuntimeException(message)

// === Common Exceptions ===

class NotFoundException(
    message: String,
    errorCode: String = "not_found"
) : BusinessException(message, HttpStatus.NOT_FOUND, errorCode, "Not Found") {
    companion object {
        fun forEntity(entityType: String, id: String) = NotFoundException("$entityType not found: $id")
    }
}

class ConflictException(
    message: String,
    errorCode: String = "conflict"
) : BusinessException(message, HttpStatus.CONFLICT, errorCode, "Conflict")

class ForbiddenException(
    message: String,
    errorCode: String = "forbidden"
) : BusinessException(message, HttpStatus.FORBIDDEN, errorCode, "Forbidden")

class BadRequestException(
    message: String,
    errorCode: String = "bad_request"
) : BusinessException(message, HttpStatus.BAD_REQUEST, errorCode, "Bad Request")

class UnauthorizedException(
    message: String,
    errorCode: String = "unauthorized"
) : BusinessException(message, HttpStatus.UNAUTHORIZED, errorCode, "Unauthorized")

// === Security Exceptions (V2-compatible) ===

class AccountLockedException(
    message: String,
    remainingSeconds: Int
) : BusinessException(
    message,
    HttpStatus.FORBIDDEN,
    "account_locked",
    "Account Locked",
    remainingSeconds = remainingSeconds
)

class SecurityCodeException(
    message: String,
    remainingAttempts: Int? = null,
    remainingSeconds: Int? = null
) : BusinessException(
    message,
    HttpStatus.FORBIDDEN,
    "security_code_invalid",
    "Security Code Invalid",
    remainingAttempts = remainingAttempts,
    remainingSeconds = remainingSeconds
)

class IpBlockedException(
    message: String,
    remainingSeconds: Int
) : BusinessException(
    message,
    HttpStatus.FORBIDDEN,
    "ip_blocked",
    "IP Address Blocked",
    remainingSeconds = remainingSeconds
)
