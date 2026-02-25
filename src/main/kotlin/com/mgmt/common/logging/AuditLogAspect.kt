package com.mgmt.common.logging

import com.mgmt.common.web.IpUtils
import com.mgmt.domain.log.AuditResult
import com.mgmt.domain.log.BusinessLog
import com.mgmt.domain.log.LogStatus
import com.mgmt.domain.log.RiskLevel
import com.mgmt.modules.auth.JwtTokenProvider
import jakarta.servlet.http.HttpServletRequest
import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.aspectj.lang.reflect.MethodSignature
import org.slf4j.LoggerFactory
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.context.request.RequestContextHolder
import org.springframework.web.context.request.ServletRequestAttributes
import java.util.*
import com.mgmt.domain.log.AuditLog as AuditLogEntity
import com.mgmt.domain.log.BusinessLogRepository
import com.mgmt.domain.log.AuditLogRepository

/**
 * AuditLogAspect — AOP implementation for @AuditLog.
 *
 * V2 parity: NestJS LogWriterService.logBusiness() + logAudit().
 *
 * Flow:
 *   1. Read @AuditLog annotation from method
 *   2. Execute the target method
 *   3. On success: write BusinessLog + AuditLog (if riskLevel >= HIGH or DELETE action)
 *   4. On failure: write BusinessLog with FAILED status
 *
 * Logging is async-safe: failures in log writing don't affect the request.
 */
@Aspect
@Component
class AuditLogAspect(
    private val businessLogRepo: BusinessLogRepository,
    private val auditLogRepo: AuditLogRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Around("@annotation(com.mgmt.common.logging.AuditLog)")
    fun auditLog(joinPoint: ProceedingJoinPoint): Any? {
        val method = (joinPoint.signature as MethodSignature).method
        val annotation = method.getAnnotation(AuditLog::class.java)

        // Get user context (may be null for unauthenticated requests)
        val auth = SecurityContextHolder.getContext().authentication
        val claims = auth?.principal as? JwtTokenProvider.TokenClaims

        // Get request context
        val request = (RequestContextHolder.getRequestAttributes() as? ServletRequestAttributes)?.request

        return try {
            val result = joinPoint.proceed()

            // Write logs asynchronously (don't block the response)
            writeBusinessLog(annotation, claims, request, LogStatus.SUCCESS)
            if (shouldWriteAuditLog(annotation)) {
                writeAuditLog(annotation, claims, request, AuditResult.SUCCESS)
            }

            result
        } catch (ex: Exception) {
            // Log the failure but still re-throw
            writeBusinessLog(annotation, claims, request, LogStatus.FAILED, ex.message)
            if (shouldWriteAuditLog(annotation)) {
                writeAuditLog(annotation, claims, request, AuditResult.FAILED)
            }
            throw ex
        }
    }

    private fun shouldWriteAuditLog(annotation: AuditLog): Boolean {
        val riskLevel = try { RiskLevel.valueOf(annotation.riskLevel) } catch (_: Exception) { RiskLevel.MEDIUM }
        return riskLevel == RiskLevel.HIGH || riskLevel == RiskLevel.CRITICAL
                || annotation.action.startsWith("DELETE")
    }

    private fun writeBusinessLog(
        annotation: AuditLog,
        claims: JwtTokenProvider.TokenClaims?,
        request: HttpServletRequest?,
        status: LogStatus,
        errorMessage: String? = null,
    ) {
        try {
            val traceId = UUID.randomUUID().toString()
            businessLogRepo.save(BusinessLog(
                id = UUID.randomUUID().toString(),
                traceId = traceId,
                userId = claims?.userId,
                username = claims?.username,
                ipAddress = request?.let { IpUtils.extractClientIp(it) },
                module = annotation.module,
                action = annotation.action,
                summary = if (status == LogStatus.FAILED) "FAILED: $errorMessage" else "OK",
                status = status,
                devMode = false,
            ))
        } catch (ex: Exception) {
            log.error("Failed to write business log for {}.{}: {}", annotation.module, annotation.action, ex.message)
        }
    }

    private fun writeAuditLog(
        annotation: AuditLog,
        claims: JwtTokenProvider.TokenClaims?,
        request: HttpServletRequest?,
        result: AuditResult,
    ) {
        try {
            val riskLevel = try { RiskLevel.valueOf(annotation.riskLevel) } catch (_: Exception) { RiskLevel.MEDIUM }
            auditLogRepo.save(AuditLogEntity(
                id = UUID.randomUUID().toString(),
                traceId = UUID.randomUUID().toString(),
                userId = claims?.userId,
                username = claims?.username,
                ipAddress = request?.let { IpUtils.extractClientIp(it) },
                userAgent = request?.getHeader("User-Agent"),
                module = annotation.module,
                action = annotation.action,
                result = result,
                riskLevel = riskLevel,
            ))
        } catch (ex: Exception) {
            log.error("Failed to write audit log for {}.{}: {}", annotation.module, annotation.action, ex.message)
        }
    }
}
