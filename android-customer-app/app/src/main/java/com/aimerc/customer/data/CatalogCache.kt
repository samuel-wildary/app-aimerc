package com.aimerc.customer.data

import android.content.Context
import com.aimerc.customer.model.Banner
import com.aimerc.customer.model.Catalog
import com.aimerc.customer.model.Product
import com.aimerc.customer.model.StoreInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Cache local do catalogo: permite abrir o app instantaneamente e atualizar
 * em segundo plano via sync incremental (products/sync?since=...).
 */
class CatalogCache(context: Context) {
    private val file = File(context.filesDir, "catalog-cache.json")

    /** Devolve o catalogo cacheado e o serverTime da ultima carga, ou null. */
    fun load(): Pair<Catalog, String>? = runCatching {
        if (!file.exists()) return null
        val json = JSONObject(file.readText())
        val since = json.optString("serverTime")
        if (since.isBlank()) return null
        val store = jsonToStore(json.getJSONObject("store"))
        val categoriesJson = json.getJSONArray("categories")
        val categories = List(categoriesJson.length()) { categoriesJson.getString(it) }
        val bannersJson = json.getJSONArray("banners")
        val banners = List(bannersJson.length()) { jsonToBanner(bannersJson.getJSONObject(it)) }
        val productsJson = json.getJSONArray("products")
        val products = List(productsJson.length()) { jsonToProduct(productsJson.getJSONObject(it)) }
        Catalog(store, categories, banners, products) to since
    }.getOrNull()

    fun save(catalog: Catalog, serverTime: String) {
        runCatching {
            val json = JSONObject()
            json.put("serverTime", serverTime)
            json.put("store", storeToJson(catalog.store))
            json.put("categories", JSONArray().apply { catalog.categories.forEach { put(it) } })
            json.put("banners", JSONArray().apply { catalog.banners.forEach { put(bannerToJson(it)) } })
            json.put("products", JSONArray().apply { catalog.products.forEach { put(productToJson(it)) } })
            file.writeText(json.toString())
        }
    }

    private fun storeToJson(store: StoreInfo) = JSONObject().apply {
        put("id", store.id); put("slug", store.slug); put("name", store.name)
        put("city", store.city); put("state", store.state)
        put("minimumOrder", store.minimumOrder); put("deliveryFee", store.deliveryFee)
        put("freeDeliveryAbove", store.freeDeliveryAbove); put("open", store.open)
        put("enablePickupScheduling", store.enablePickupScheduling); put("pickupSlots", store.pickupSlots)
    }

    private fun jsonToStore(o: JSONObject) = StoreInfo(
        id = o.getString("id"), slug = o.getString("slug"), name = o.getString("name"),
        city = o.optString("city"), state = o.optString("state"),
        minimumOrder = o.optDouble("minimumOrder", 0.0),
        deliveryFee = o.optDouble("deliveryFee", 0.0),
        freeDeliveryAbove = o.optDouble("freeDeliveryAbove", 0.0),
        open = o.optBoolean("open", false),
        enablePickupScheduling = o.optBoolean("enablePickupScheduling", true),
        pickupSlots = o.optString("pickupSlots")
    )

    private fun bannerToJson(banner: Banner) = JSONObject().apply {
        put("id", banner.id); put("eyebrow", banner.eyebrow); put("title", banner.title)
        put("subtitle", banner.subtitle); put("image", banner.image); put("position", banner.position)
    }

    private fun jsonToBanner(o: JSONObject) = Banner(
        id = o.getString("id"), eyebrow = o.optString("eyebrow"), title = o.getString("title"),
        subtitle = o.optString("subtitle"), image = o.optString("image"), position = o.optInt("position")
    )

    private fun productToJson(p: Product) = JSONObject().apply {
        put("id", p.id); put("sku", p.sku); put("name", p.name); put("category", p.category)
        put("price", p.price); put("oldPrice", p.oldPrice ?: JSONObject.NULL)
        put("stock", p.stock); put("unit", p.unit); put("image", p.image); put("promo", p.promo)
        put("active", p.active); put("catalogVisible", p.catalogVisible); put("updatedAt", p.updatedAt)
    }

    private fun jsonToProduct(o: JSONObject) = Product(
        id = o.getString("id"), sku = o.optString("sku"), name = o.getString("name"),
        category = o.getString("category"), price = o.getDouble("price"),
        oldPrice = if (o.isNull("oldPrice")) null else o.optDouble("oldPrice"),
        stock = o.optDouble("stock"), unit = o.optString("unit", "UN"),
        image = o.optString("image"), promo = o.optBoolean("promo"),
        active = o.optBoolean("active", true),
        catalogVisible = o.optBoolean("catalogVisible", true),
        updatedAt = o.optString("updatedAt")
    )
}
