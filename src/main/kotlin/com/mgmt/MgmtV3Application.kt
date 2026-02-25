package com.mgmt

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableAsync
import org.springframework.scheduling.annotation.EnableScheduling

/**
 * MGMT ERP V3 — Main Application Entry Point
 *
 * Spring Boot 3.5 + Kotlin
 * - @EnableAsync: for fire-and-forget logging, PDF generation
 * - @EnableScheduling: for refresh token cleanup, log archival
 */
@SpringBootApplication
@EnableAsync
@EnableScheduling
class MgmtV3Application

fun main(args: Array<String>) {
    runApplication<MgmtV3Application>(*args)
}
