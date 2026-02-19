package com.mgmt.common.exception

import com.mgmt.common.response.FieldError
import com.mgmt.common.response.ProblemDetail
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.validation.BindException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

/**
 * Global Exception Handler — RFC 7807 Problem Details
 *
 * Translates all exceptions into a uniform error response format.
 * Preserves V2 security fields (remainingAttempts, remainingSeconds, errorCode)
 * for frontend compatibility.
 */
@RestControllerAdvice
class GlobalExceptionHandler {

    private val logger = LoggerFactory.getLogger(GlobalExceptionHandler::class.java)

    // === Business Exceptions ===

    @ExceptionHandler(BusinessException::class)
    fun handleBusiness(ex: BusinessException, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        logger.warn("[{}] Business error: {} — {}", getTraceId(request), ex.errorCode, ex.message)
        return ResponseEntity.status(ex.status).body(
            ProblemDetail(
                type = ex.errorCode,
                title = ex.title,
                status = ex.status.value(),
                detail = ex.message ?: "Business logic error",
                errorCode = ex.errorCode,
                remainingAttempts = ex.remainingAttempts,
                remainingSeconds = ex.remainingSeconds,
                traceId = getTraceId(request)
            )
        )
    }

    // === Validation Exceptions ===

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(ex: MethodArgumentNotValidException, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        val errors = ex.bindingResult.fieldErrors.map {
            FieldError(
                field = it.field,
                code = it.code ?: "invalid",
                message = it.defaultMessage ?: "Invalid value"
            )
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ProblemDetail(
                type = "validation_error",
                title = "Validation Failed",
                status = 400,
                detail = "Request validation failed with ${errors.size} error(s)",
                errors = errors,
                traceId = getTraceId(request)
            )
        )
    }

    @ExceptionHandler(BindException::class)
    fun handleBind(ex: BindException, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        val errors = ex.fieldErrors.map {
            FieldError(
                field = it.field,
                code = it.code ?: "invalid",
                message = it.defaultMessage ?: "Invalid value"
            )
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ProblemDetail(
                type = "validation_error",
                title = "Binding Failed",
                status = 400,
                detail = "Request binding failed with ${errors.size} error(s)",
                errors = errors,
                traceId = getTraceId(request)
            )
        )
    }

    // === Security Exceptions ===

    @ExceptionHandler(AccessDeniedException::class)
    fun handleAccessDenied(ex: AccessDeniedException, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        logger.warn("[{}] Access denied: {}", getTraceId(request), ex.message)
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(
            ProblemDetail(
                type = "access_denied",
                title = "Access Denied",
                status = 403,
                detail = "You do not have permission to perform this action",
                traceId = getTraceId(request)
            )
        )
    }

    @ExceptionHandler(BadCredentialsException::class)
    fun handleBadCredentials(ex: BadCredentialsException, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        logger.warn("[{}] Bad credentials", getTraceId(request))
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
            ProblemDetail(
                type = "authentication_error",
                title = "Authentication Failed",
                status = 401,
                detail = "Invalid username or password",
                traceId = getTraceId(request)
            )
        )
    }

    // === Type Mismatch ===

    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun handleTypeMismatch(ex: MethodArgumentTypeMismatchException, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ProblemDetail(
                type = "type_mismatch",
                title = "Invalid Parameter",
                status = 400,
                detail = "Parameter '${ex.name}' must be of type ${ex.requiredType?.simpleName}",
                traceId = getTraceId(request)
            )
        )
    }

    // === Illegal Argument (require() failures) ===

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleIllegalArgument(ex: IllegalArgumentException, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        logger.warn("[{}] Illegal argument: {}", getTraceId(request), ex.message)
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ProblemDetail(
                type = "invalid_operation",
                title = "Invalid Operation",
                status = 400,
                detail = ex.message ?: "Invalid argument",
                traceId = getTraceId(request)
            )
        )
    }

    // === Illegal State (check() failures, business state violations) ===

    @ExceptionHandler(IllegalStateException::class)
    fun handleIllegalState(ex: IllegalStateException, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        logger.warn("[{}] Illegal state: {}", getTraceId(request), ex.message)
        return ResponseEntity.status(HttpStatus.CONFLICT).body(
            ProblemDetail(
                type = "invalid_state",
                title = "Invalid State",
                status = 409,
                detail = ex.message ?: "Invalid state",
                traceId = getTraceId(request)
            )
        )
    }

    // === Catch-All ===

    @ExceptionHandler(Exception::class)
    fun handleGeneral(ex: Exception, request: HttpServletRequest): ResponseEntity<ProblemDetail> {
        logger.error("[{}] Unhandled exception: {}", getTraceId(request), ex.message, ex)
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
            ProblemDetail(
                type = "internal_error",
                title = "Internal Server Error",
                status = 500,
                detail = if (isProduction()) "An unexpected error occurred" else (ex.message ?: "Unknown error"),
                traceId = getTraceId(request)
            )
        )
    }

    // === Helpers ===

    private fun getTraceId(request: HttpServletRequest): String {
        return request.getAttribute("traceId") as? String
            ?: request.getHeader("X-Trace-Id")
            ?: ""
    }

    private fun isProduction(): Boolean {
        return System.getenv("SPRING_PROFILES_ACTIVE")?.contains("prod") == true
    }
}
