package com.mgmt.modules.products.application.usecase

import com.mgmt.modules.products.application.dto.*
import com.mgmt.modules.products.domain.model.Product
import com.mgmt.modules.products.domain.model.ProductStatus
import com.mgmt.modules.products.domain.repository.ProductRepository
import com.mgmt.common.exception.NotFoundException
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/**
 * QueryProductUseCase — read-only product queries.
 *
 * V3 DDD: application/usecase layer.
 * V1 parity: cogs_load_table (list), cogs_get_form (metadata/dropdowns).
 */
@Service
@Transactional(readOnly = true)
class QueryProductUseCase(
    private val repo: ProductRepository,
) {

    fun findAll(params: ProductQueryParams): Pair<List<Product>, Long> {
        val page = maxOf(1, params.page)
        val limit = maxOf(1, minOf(params.limit, 100))
        val spec = buildSpec(params.search, params.category, params.status)
        val pageable = PageRequest.of(page - 1, limit, Sort.by("sku").ascending())
        val result = repo.findAll(spec, pageable)
        return result.content to result.totalElements
    }

    fun findOne(id: String): Product =
        repo.findByIdAndDeletedAtIsNull(id)
            ?: throw NotFoundException("products.errors.notFound")

    fun findBySku(sku: String): Product =
        repo.findBySkuAndDeletedAtIsNull(sku.uppercase())
            ?: throw NotFoundException("products.errors.notFound")

    fun getActiveSkuList(): List<Product> =
        repo.findAllByStatusAndDeletedAtIsNullOrderBySkuAsc(ProductStatus.ACTIVE)

    /** V1 parity: dropdown options for category / subcategory / type + existing SKU list */
    fun getMetadata(): ProductMetadataResponse = ProductMetadataResponse(
        categories = repo.findDistinctCategories(),
        subcategories = repo.findDistinctSubcategories(),
        types = repo.findDistinctTypes(),
        existingSkus = repo.findAllByDeletedAtIsNullOrderBySkuAsc().map { it.sku },
    )

    /**
     * Build category hierarchy tree: { category: { subcategory: [type] } }
     * Used by frontend cascading dropdowns for COGS edit modal.
     */
    fun getCategoryHierarchy(): Map<String, Map<String, List<String>>> {
        val products = repo.findAllByDeletedAtIsNull()
        val hierarchy = mutableMapOf<String, MutableMap<String, MutableSet<String>>>()

        for (p in products) {
            val cat = p.category ?: continue
            val subMap = hierarchy.getOrPut(cat) { mutableMapOf() }
            val sub = p.subcategory ?: continue
            val typeSet = subMap.getOrPut(sub) { mutableSetOf() }
            val type = p.type ?: continue
            typeSet.add(type)
        }

        return hierarchy.mapValues { (_, subs) ->
            subs.mapValues { (_, types) -> types.sorted() }
                .toSortedMap()
        }.toSortedMap()
    }

    private fun buildSpec(search: String?, category: String?, status: String?): Specification<Product> {
        @Suppress("DEPRECATION")
        return Specification.where<Product> { root, _, cb ->
            cb.isNull(root.get<Instant>("deletedAt"))
        }.let { spec ->
            if (search != null) {
                spec.and { root, _, cb ->
                    val pattern = "%${search.lowercase()}%"
                    cb.or(
                        cb.like(cb.lower(root.get("sku")), pattern),
                        cb.like(cb.lower(root.get("name")), pattern),
                    )
                }
            } else spec
        }.let { spec ->
            if (category != null) {
                spec.and { root, _, cb -> cb.equal(root.get<String>("category"), category) }
            } else spec
        }.let { spec ->
            if (status != null) {
                spec.and { root, _, cb -> cb.equal(root.get<ProductStatus>("status"), ProductStatus.valueOf(status)) }
            } else spec
        }
    }
}
