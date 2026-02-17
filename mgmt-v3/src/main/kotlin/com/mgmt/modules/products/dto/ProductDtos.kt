// This package has been superseded by DDD-structured DTOs.
// New location: modules/products/application/dto/ProductDtos.kt
@file:Suppress("unused")
package com.mgmt.modules.products.dto

// Re-export from new DDD location for backward compatibility
typealias ProductQueryParams = com.mgmt.modules.products.application.dto.ProductQueryParams
typealias CreateProductRequest = com.mgmt.modules.products.application.dto.CreateProductRequest
typealias BatchCreateProductRequest = com.mgmt.modules.products.application.dto.BatchCreateProductRequest
typealias UpdateProductRequest = com.mgmt.modules.products.application.dto.UpdateProductRequest
typealias BatchUpdateCogsRequest = com.mgmt.modules.products.application.dto.BatchUpdateCogsRequest
typealias GenerateBarcodeRequest = com.mgmt.modules.products.application.dto.GenerateBarcodeRequest
typealias ProductResponse = com.mgmt.modules.products.application.dto.ProductResponse
typealias BatchResult = com.mgmt.modules.products.application.dto.BatchResult
typealias BatchResultItem = com.mgmt.modules.products.application.dto.BatchResultItem
