package com.mgmt.modules.products

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.lang.ArchRule
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.junit.jupiter.api.Test

/**
 * ArchUnit DDD Layer Tests — validates Products module DDD structure.
 *
 * V3 architecture §6 compliance:
 *   domain → application → infrastructure → api
 *   (no backward dependencies allowed)
 */
class ProductDddArchTest {

    private val classes = ClassFileImporter()
        .importPackages("com.mgmt.modules.products")

    @Test
    fun `domain layer should not depend on application layer`() {
        val rule: ArchRule = noClasses()
            .that().resideInAPackage("..products.domain..")
            .should().dependOnClassesThat()
            .resideInAPackage("..products.application..")
        rule.check(classes)
    }

    @Test
    fun `domain layer should not depend on infrastructure layer`() {
        val rule: ArchRule = noClasses()
            .that().resideInAPackage("..products.domain..")
            .should().dependOnClassesThat()
            .resideInAPackage("..products.infrastructure..")
        rule.check(classes)
    }

    @Test
    fun `domain layer should not depend on api layer`() {
        val rule: ArchRule = noClasses()
            .that().resideInAPackage("..products.domain..")
            .should().dependOnClassesThat()
            .resideInAPackage("..products.api..")
        rule.check(classes)
    }

    @Test
    fun `application layer should not depend on api layer`() {
        val rule: ArchRule = noClasses()
            .that().resideInAPackage("..products.application..")
            .should().dependOnClassesThat()
            .resideInAPackage("..products.api..")
        rule.check(classes)
    }

    @Test
    fun `application layer should not depend on infrastructure layer`() {
        val rule: ArchRule = noClasses()
            .that().resideInAPackage("..products.application..")
            .should().dependOnClassesThat()
            .resideInAPackage("..products.infrastructure..")
        rule.check(classes)
    }

    @Test
    fun `infrastructure layer should not depend on api layer`() {
        val rule: ArchRule = noClasses()
            .that().resideInAPackage("..products.infrastructure..")
            .should().dependOnClassesThat()
            .resideInAPackage("..products.api..")
        rule.check(classes)
    }
}
