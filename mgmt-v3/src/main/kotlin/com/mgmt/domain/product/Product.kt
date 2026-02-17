// This package has been moved to com.mgmt.modules.products.domain.model
// as part of V3 DDD restructure (Phase 0).
//
// New location: modules/products/domain/model/Product.kt
//
// This file is kept as a type alias bridge for backward compatibility
// until all imports are updated.
@file:Suppress("unused")
package com.mgmt.domain.product

// Re-export from new DDD location
typealias Product = com.mgmt.modules.products.domain.model.Product
typealias ProductStatus = com.mgmt.modules.products.domain.model.ProductStatus
