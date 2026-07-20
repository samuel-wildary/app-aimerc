package com.aimerc.customer.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.aimerc.customer.data.AiMercApi
import com.aimerc.customer.model.CartLine
import com.aimerc.customer.model.Catalog
import com.aimerc.customer.model.CheckoutData
import com.aimerc.customer.model.CustomerOrder
import com.aimerc.customer.model.OrderReceipt
import com.aimerc.customer.model.Product
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class AiMercViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = EncryptedSharedPreferences.create(
        "aimerc_customer_secure",
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
        application,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    init {
        if (!preferences.getBoolean("legacy_migrated", false)) {
            val legacy = application.getSharedPreferences("aimerc_customer", 0)
            val editor = preferences.edit()
            legacy.all.forEach { (key, value) ->
                when (value) {
                    is String -> editor.putString(key, value)
                    is Boolean -> editor.putBoolean(key, value)
                    is Int -> editor.putInt(key, value)
                    is Long -> editor.putLong(key, value)
                    is Float -> editor.putFloat(key, value)
                }
            }
            editor.putBoolean("legacy_migrated", true).apply()
            legacy.edit().clear().apply()
        }
    }

    var catalog by mutableStateOf<Catalog?>(null)
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var query by mutableStateOf("")
    var selectedCategory by mutableStateOf("Todos")
    var submitting by mutableStateOf(false)
        private set
    var confirmedOrderId by mutableStateOf<String?>(null)
        private set
    var orders by mutableStateOf<List<CustomerOrder>>(emptyList())
        private set
    var ordersLoading by mutableStateOf(false)
        private set

    var customerName by mutableStateOf(preferences.getString("profile_name", "").orEmpty())
        private set
    var customerPhone by mutableStateOf(preferences.getString("profile_phone", "").orEmpty())
        private set
    var customerCep by mutableStateOf(preferences.getString("profile_cep", "").orEmpty())
        private set
    var customerStreet by mutableStateOf(preferences.getString("profile_street", "").orEmpty())
        private set
    var customerNumber by mutableStateOf(preferences.getString("profile_number", "").orEmpty())
        private set
    var customerComplement by mutableStateOf(preferences.getString("profile_complement", "").orEmpty())
        private set
    var customerNeighborhood by mutableStateOf(preferences.getString("profile_neighborhood", "").orEmpty())
        private set
    var customerCity by mutableStateOf(preferences.getString("profile_city", "").orEmpty())
        private set
    var customerState by mutableStateOf(preferences.getString("profile_state", "").orEmpty())
        private set
    var customerReference by mutableStateOf(preferences.getString("profile_reference", "").orEmpty())
        private set

    private val quantities = mutableStateMapOf<String, Int>()

    init {
        loadCatalog()
        refreshOrders()
    }

    val products: List<Product>
        get() = catalog?.products.orEmpty().filter { product ->
            (selectedCategory == "Todos" || product.category == selectedCategory) &&
                (query.isBlank() || product.name.contains(query, true) || product.sku.contains(query, true) || product.category.contains(query, true))
        }

    val cartLines: List<CartLine>
        get() = catalog?.products.orEmpty().mapNotNull { product -> quantities[product.id]?.takeIf { it > 0 }?.let { CartLine(product, it) } }
    val cartCount: Int get() = quantities.values.sum()
    val subtotal: Double get() = cartLines.sumOf { it.total }
    val customerAddressLabel: String
        get() = if (customerStreet.isBlank()) "Informe seu endereco de entrega" else "$customerStreet, $customerNumber"
    val customerAddress: String
        get() = customerAddressLabel

    fun quantity(productId: String) = quantities[productId] ?: 0
    fun add(product: Product) { quantities[product.id] = quantity(product.id) + 1 }
    fun remove(product: Product) {
        val next = quantity(product.id) - 1
        if (next <= 0) quantities.remove(product.id) else quantities[product.id] = next
    }
    fun clearError() { error = null }
    fun resetOrder() { confirmedOrderId = null }

    fun saveProfile(name: String, phone: String, cep: String, street: String, number: String, complement: String, neighborhood: String, city: String, state: String, reference: String) {
        customerName = name.trim()
        customerPhone = phone.trim()
        customerCep = cep.filter(Char::isDigit).take(8)
        customerStreet = street.trim()
        customerNumber = number.trim()
        customerComplement = complement.trim()
        customerNeighborhood = neighborhood.trim()
        customerCity = city.trim()
        customerState = state.trim().uppercase()
        customerReference = reference.trim()
        preferences.edit()
            .putString("profile_name", customerName)
            .putString("profile_phone", customerPhone)
            .putString("profile_cep", customerCep)
            .putString("profile_street", customerStreet)
            .putString("profile_number", customerNumber)
            .putString("profile_complement", customerComplement)
            .putString("profile_neighborhood", customerNeighborhood)
            .putString("profile_city", customerCity)
            .putString("profile_state", customerState)
            .putString("profile_reference", customerReference)
            .apply()
    }

    @Suppress("unused")
    fun saveProfile(name: String, phone: String, address: String) {
        saveProfile(name, phone, customerCep, address, customerNumber.ifBlank { "S/N" }, customerComplement, customerNeighborhood, customerCity, customerState, customerReference)
    }

    fun loadCatalog() {
        viewModelScope.launch {
            loading = true
            error = null
            try { catalog = AiMercApi.catalog() }
            catch (exception: Exception) { error = exception.message ?: "Falha ao carregar o catalogo" }
            finally { loading = false }
        }
    }

    fun refreshOrders() {
        viewModelScope.launch {
            ordersLoading = true
            val refreshed = trackingReferences().mapNotNull { reference ->
                runCatching { AiMercApi.order(reference.id, reference.token) }.getOrNull()
            }
            orders = refreshed.sortedByDescending { it.createdAt }
            ordersLoading = false
        }
    }

    fun submit(checkout: CheckoutData, onSuccess: () -> Unit) {
        if (cartLines.isEmpty()) return
        viewModelScope.launch {
            submitting = true
            error = null
            try {
                val receipt = AiMercApi.createOrder(checkout, cartLines)
                confirmedOrderId = receipt.id
                saveTrackingReference(receipt)
                saveProfile(checkout.name, checkout.phone, checkout.cep, checkout.street, checkout.number, checkout.complement, checkout.neighborhood, checkout.city, checkout.state, checkout.reference)
                orders = (listOf(receipt.order) + orders.filterNot { it.id == receipt.id }).sortedByDescending { it.createdAt }
                quantities.clear()
                refreshOrders()
                loadCatalog()
                onSuccess()
            } catch (exception: Exception) {
                error = exception.message ?: "Nao foi possivel enviar o pedido"
            } finally { submitting = false }
        }
    }

    fun cancelOrder(order: CustomerOrder) {
        val reference = trackingReferences().firstOrNull { it.id == order.id } ?: return
        viewModelScope.launch {
            try {
                val cancelled = AiMercApi.cancelOrder(reference.id, reference.token)
                orders = orders.map { current -> if (current.id == cancelled.id) cancelled else current }
            } catch (exception: Exception) {
                error = exception.message ?: "Nao foi possivel cancelar o pedido"
            }
        }
    }

    private data class TrackingReference(val id: String, val token: String)

    private fun trackingReferences(): List<TrackingReference> {
        val array = runCatching { JSONArray(preferences.getString("tracked_orders", "[]")) }.getOrElse { JSONArray() }
        return List(array.length()) { index ->
            val item = array.getJSONObject(index)
            TrackingReference(item.getString("id"), item.getString("token"))
        }
    }

    private fun saveTrackingReference(receipt: OrderReceipt) {
        val current = trackingReferences().filterNot { it.id == receipt.id }.toMutableList()
        current.add(0, TrackingReference(receipt.id, receipt.trackingToken))
        val array = JSONArray()
        current.take(50).forEach { reference -> array.put(JSONObject().put("id", reference.id).put("token", reference.token)) }
        preferences.edit().putString("tracked_orders", array.toString()).apply()
    }
}
