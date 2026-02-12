package com.mgmt.modules.vma

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.security.RequirePermission
import com.mgmt.modules.vma.dto.*
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * VmaSiteController — 站点管理 REST API
 *
 * Endpoints (3):
 *   GET    /vma/sites              - 站点列表
 *   POST   /vma/sites              - 创建站点
 *   PATCH  /vma/sites/{siteId}     - 更新站点
 */
@RestController
@RequestMapping("/vma")
class VmaSiteController(
    private val siteService: VmaSiteService,
) {

    @GetMapping("/sites")
    @RequirePermission("vma.employees.manage")
    fun findAll(): ResponseEntity<Any> =
        ResponseEntity.ok(siteService.findAll())

    @PostMapping("/sites")
    @RequirePermission("vma.employees.manage")
    @AuditLog(module = "VMA", action = "CREATE_SITE")
    fun create(@RequestBody dto: CreateSiteRequest): ResponseEntity<Any> =
        ResponseEntity.status(HttpStatus.CREATED).body(siteService.create(dto))

    @PatchMapping("/sites/{siteId}")
    @RequirePermission("vma.employees.manage")
    fun update(@PathVariable siteId: String, @RequestBody dto: UpdateSiteRequest): ResponseEntity<Any> =
        ResponseEntity.ok(siteService.update(siteId, dto))
}
