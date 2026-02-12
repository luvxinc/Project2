package com.mgmt.domain.auth

import org.springframework.data.jpa.repository.JpaRepository

interface RoleRepository : JpaRepository<Role, String> {

    fun findByName(name: String): Role?

    fun findByIsActiveTrue(): List<Role>

    fun findByNameIn(names: Collection<String>): List<Role>

    fun existsByName(name: String): Boolean
}

interface RolePermissionBoundaryRepository : JpaRepository<RolePermissionBoundary, String> {

    fun findByRoleId(roleId: String): List<RolePermissionBoundary>

    fun findByRoleIdIn(roleIds: Collection<String>): List<RolePermissionBoundary>

    fun deleteByRoleIdAndPermissionKey(roleId: String, permissionKey: String): Int
}
