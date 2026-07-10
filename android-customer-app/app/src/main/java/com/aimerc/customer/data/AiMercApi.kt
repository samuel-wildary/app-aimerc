package com.aimerc.customer.data

import com.aimerc.customer.BuildConfig
import com.aimerc.customer.model.Banner
import com.aimerc.customer.model.CartLine
import com.aimerc.customer.model.Catalog
import com.aimerc.customer.model.CheckoutData
import com.aimerc.customer.model.Product
import com.aimerc.customer.model.StoreInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiException(message: String) : Exception(message)

object AiMercApi {
    private const val STORE_SLUG = "aimerc-demo"

    suspend fun catalog(): Catalog = withContext(Dispatchers.IO) {
        val json = request("/public/stores/$STORE_SLUG/catalog")
        val storeJson = json.getJSONObject("store")
        val store = StoreInfo(
            id = storeJson.getString("id"),
            slug = storeJson.getString("slug"),
            name = storeJson.getString("name"),
            city = storeJson.optString("city"),
            state = storeJson.optString("state"),
            minimumOrder = storeJson.optDouble("minimumOrder", 0.0),
            deliveryFee = storeJson.optDouble("deliveryFee", 0.0),
            open = storeJson.optBoolean("open", false)
        )
        val categories = json.getJSONArray("categories").toStringList()
        val banners = json.getJSONArray("banners").mapObjects { item ->
            Banner(item.getString("id"), item.optString("eyebrow"), item.getString("title"), item.optString("subtitle"))
        }
        val productMap = linkedMapOf<String, Product>()
        val promotions = json.getJSONArray("promotions")
        for (index in 0 until promotions.length()) {
            val product = promotions.getJSONObject(index).toProduct()
            productMap[product.id] = product
        }
        val shelves = json.getJSONArray("shelves")
        for (shelfIndex in 0 until shelves.length()) {
            val items = shelves.getJSONObject(shelfIndex).getJSONArray("products")
            for (index in 0 until items.length()) {
                val product = items.getJSONObject(index).toProduct()
                productMap[product.id] = product
            }
        }
        // The public products endpoint guarantees that categories without a shelf still appear in search.
        val allProducts = requestArray("/public/stores/$STORE_SLUG/products").mapObjects { it.toProduct() }
        allProducts.forEach { productMap[it.id] = it }
        Catalog(store, categories, banners, productMap.values.toList())
    }

    suspend fun createOrder(checkout: CheckoutData, lines: List<CartLine>): String = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("customer", JSONObject().apply {
                put("name", checkout.name)
                put("phone", checkout.phone)
                put("address", checkout.address)
            })
            put("fulfillmentType", checkout.fulfillmentType)
            put("paymentMethod", checkout.paymentMethod)
            if (checkout.changeFor != null) put("changeFor", checkout.changeFor)
            put("notes", checkout.notes)
            put("items", JSONArray().apply {
                lines.forEach { line -> put(JSONObject().apply { put("productId", line.product.id); put("quantity", line.quantity) }) }
            })
        }
        request("/public/stores/$STORE_SLUG/orders", "POST", body).getString("id")
    }

    private fun requestArray(path: String): JSONArray {
        val result = rawRequest(path, "GET", null)
        return JSONArray(result)
    }

    private fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        return JSONObject(rawRequest(path, method, body))
    }

    private fun rawRequest(path: String, method: String, body: JSONObject?): String {
        val connection = URL("${BuildConfig.API_BASE_URL}$path").openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 8_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.bufferedWriter().use { it.write(body.toString()) }
            }
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (connection.responseCode !in 200..299) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
                throw ApiException(message.ifBlank { "Nao foi possivel conectar ao supermercado" })
            }
            text
        } finally {
            connection.disconnect()
        }
    }
}

private fun JSONObject.toProduct() = Product(
    id = getString("id"),
    sku = optString("sku"),
    name = getString("name"),
    category = getString("category"),
    price = getDouble("price"),
    oldPrice = if (isNull("oldPrice")) null else optDouble("oldPrice"),
    stock = optDouble("stock"),
    unit = optString("unit", "UN"),
    image = optString("image"),
    promo = optBoolean("promo")
)

private fun JSONArray.toStringList() = List(length()) { index -> getString(index) }
private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T) = List(length()) { index -> transform(getJSONObject(index)) }
