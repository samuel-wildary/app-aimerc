package com.mercadinhoqueiroz.app.data

import com.mercadinhoqueiroz.app.BuildConfig
import com.mercadinhoqueiroz.app.model.Banner
import com.mercadinhoqueiroz.app.model.CartLine
import com.mercadinhoqueiroz.app.model.CepAddress
import com.mercadinhoqueiroz.app.model.Catalog
import com.mercadinhoqueiroz.app.model.CheckoutData
import com.mercadinhoqueiroz.app.model.CustomerOrder
import com.mercadinhoqueiroz.app.model.OrderItem
import com.mercadinhoqueiroz.app.model.OrderReceipt
import com.mercadinhoqueiroz.app.model.Product
import com.mercadinhoqueiroz.app.model.StoreInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiException(message: String) : Exception(message)

object AiMercApi {
    private const val STORE_SLUG = "mecadinho-queiroz"

    suspend fun catalog(): Catalog = withContext(Dispatchers.IO) {
        val json = request("/public/stores/$STORE_SLUG/catalog")
        val storeJson = json.getJSONObject("store")
        val store = StoreInfo(
            id = storeJson.getString("id"),
            slug = storeJson.getString("slug"),
            name = "Mercadinho Queiroz",
            city = storeJson.optString("city"),
            state = storeJson.optString("state"),
            minimumOrder = storeJson.optDouble("minimumOrder", 0.0),
            deliveryFee = storeJson.optDouble("deliveryFee", 0.0),
            freeDeliveryAbove = storeJson.optDouble("freeDeliveryAbove", 0.0),
            open = storeJson.optBoolean("open", false)
        )
        val categories = json.getJSONArray("categories").toStringList()
        val banners = json.getJSONArray("banners").mapObjects { item ->
            Banner(item.getString("id"), item.optString("eyebrow"), item.getString("title"), item.optString("subtitle"), normalizeImageUrl(item.optString("image")), item.optInt("position"))
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
        Catalog(store, categories, banners, productMap.values.toList())
    }

    suspend fun products(): List<Product> = withContext(Dispatchers.IO) {
        requestArray("/public/stores/$STORE_SLUG/products").mapObjects { it.toProduct() }
    }

    suspend fun lookupCep(cep: String): CepAddress = withContext(Dispatchers.IO) {
        val result = request("/public/cep/${cep.filter(Char::isDigit)}")
        CepAddress(
            cep = result.getString("cep"),
            street = result.optString("street"),
            complement = result.optString("complement"),
            neighborhood = result.optString("neighborhood"),
            city = result.optString("city"),
            state = result.optString("state")
        )
    }

    suspend fun createOrder(checkout: CheckoutData, lines: List<CartLine>): OrderReceipt = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("customer", JSONObject().apply {
                put("name", checkout.name)
                put("phone", checkout.phone)
                put("cep", checkout.cep)
                put("street", checkout.street)
                put("number", checkout.number)
                put("complement", checkout.complement)
                put("neighborhood", checkout.neighborhood)
                put("city", checkout.city)
                put("state", checkout.state)
                put("reference", checkout.reference)
            })
            put("fulfillmentType", checkout.fulfillmentType)
            put("paymentMethod", checkout.paymentMethod)
            if (checkout.changeFor != null) put("changeFor", checkout.changeFor)
            put("notes", checkout.notes)
            put("items", JSONArray().apply {
                lines.forEach { line -> put(JSONObject().apply { put("productId", line.product.id); put("quantity", line.quantity) }) }
            })
        }
        val result = request("/public/stores/$STORE_SLUG/orders", "POST", body)
        OrderReceipt(result.getString("id"), result.getString("trackingToken"), result.toCustomerOrder())
    }

    suspend fun order(id: String, trackingToken: String): CustomerOrder = withContext(Dispatchers.IO) {
        request("/public/stores/$STORE_SLUG/orders/$id", headers = mapOf("X-Order-Token" to trackingToken)).toCustomerOrder()
    }

    suspend fun cancelOrder(id: String, trackingToken: String): CustomerOrder = withContext(Dispatchers.IO) {
        request("/public/stores/$STORE_SLUG/orders/$id/cancel", "POST", JSONObject(), mapOf("X-Order-Token" to trackingToken)).toCustomerOrder()
    }

    suspend fun registerPushDevice(token: String, customerPhone: String = "") = withContext(Dispatchers.IO) {
        request("/public/stores/$STORE_SLUG/push/devices", "POST", JSONObject().apply {
            put("token", token)
            put("customerPhone", customerPhone)
        })
    }

    private fun requestArray(path: String): JSONArray {
        val result = rawRequest(path, "GET", null)
        return JSONArray(result)
    }

    private fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        headers: Map<String, String> = emptyMap()
    ): JSONObject {
        return JSONObject(rawRequest(path, method, body, headers))
    }

    private fun rawRequest(
        path: String,
        method: String,
        body: JSONObject?,
        headers: Map<String, String> = emptyMap()
    ): String {
        val connection = URL("${BuildConfig.API_BASE_URL}$path").openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 8_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/json")
            headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
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
    image = normalizeImageUrl(optString("image")),
    promo = optBoolean("promo")
)

private fun JSONObject.toCustomerOrder() = CustomerOrder(
    id = getString("id"),
    status = getString("status"),
    fulfillmentType = getString("fulfillmentType"),
    paymentMethod = getString("paymentMethod"),
    subtotal = getDouble("subtotal"),
    deliveryFee = getDouble("deliveryFee"),
    total = getDouble("total"),
    createdAt = getString("createdAt"),
    items = getJSONArray("items").mapObjects { item ->
        OrderItem(
            productId = item.getString("productId"),
            name = item.getString("name"),
            unit = item.getString("unit"),
            quantity = item.getDouble("quantity"),
            price = item.getDouble("price"),
            total = item.getDouble("total")
        )
    },
    cancellation = optJSONObject("cancellation")?.let { cancellation ->
        com.mercadinhoqueiroz.app.model.CancellationInfo(
            eligible = cancellation.optBoolean("eligible"),
            windowEndsAt = cancellation.optString("windowEndsAt"),
            supportPhone = cancellation.optString("supportPhone"),
            message = cancellation.optString("message")
        )
    }
)

private fun normalizeImageUrl(value: String): String = value

private fun JSONArray.toStringList() = List(length()) { index -> getString(index) }
private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T) = List(length()) { index -> transform(getJSONObject(index)) }
