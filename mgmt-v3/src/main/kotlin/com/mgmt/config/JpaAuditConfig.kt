package com.mgmt.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.domain.AuditorAware
import org.springframework.data.jpa.repository.config.EnableJpaAuditing
import org.springframework.security.core.context.SecurityContextHolder
import java.util.Optional

/**
 * JPA Auditing Configuration — auto-populates createdBy / updatedBy fields.
 */
@Configuration
@EnableJpaAuditing
class JpaAuditConfig {

    @Bean
    fun auditorProvider(): AuditorAware<String> {
        return AuditorAware {
            val auth = SecurityContextHolder.getContext().authentication
            if (auth != null && auth.isAuthenticated && auth.name != "anonymousUser") {
                Optional.of(auth.name)
            } else {
                Optional.of("system")
            }
        }
    }
}
