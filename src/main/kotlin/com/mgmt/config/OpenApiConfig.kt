package com.mgmt.config

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Contact
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.security.SecurityRequirement
import io.swagger.v3.oas.models.security.SecurityScheme
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * OpenAPI / Swagger Configuration.
 *
 * Auto-generates API documentation from controller annotations.
 * Frontend can consume via openapi-typescript for type-safe API client.
 */
@Configuration
class OpenApiConfig {

    @Bean
    fun openAPI(): OpenAPI {
        return OpenAPI()
            .info(
                Info()
                    .title("MGMT ERP V3 API")
                    .description("Enterprise Resource Planning system — V3 Spring Boot")
                    .version("3.0.0")
                    .contact(Contact().name("MGMT Engineering"))
            )
            .addSecurityItem(SecurityRequirement().addList("bearer-jwt"))
            .components(
                Components()
                    .addSecuritySchemes(
                        "bearer-jwt",
                        SecurityScheme()
                            .type(SecurityScheme.Type.HTTP)
                            .scheme("bearer")
                            .bearerFormat("JWT")
                            .description("JWT access token")
                    )
                    .addSecuritySchemes(
                        "security-code",
                        SecurityScheme()
                            .type(SecurityScheme.Type.APIKEY)
                            .`in`(SecurityScheme.In.HEADER)
                            .name("X-Security-Code")
                            .description("L1-L4 security verification code")
                    )
            )
    }
}
