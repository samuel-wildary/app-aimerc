package com.mercadinhoqueiroz.app.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.mercadinhoqueiroz.app.data.AiMercApi
import com.mercadinhoqueiroz.app.model.CartLine
import com.mercadinhoqueiroz.app.model.CepAddress
import com.mercadinhoqueiroz.app.model.Catalog
import com.mercadinhoqueiroz.app.model.CheckoutData
import com.mercadinhoqueiroz.app.model.CustomerOrder
import com.mercadinhoqueiroz.app.model.OrderReceipt
import com.mercadinhoqueiroz.app.model.Product
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class AiMercViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences("aimerc_customer", 0)
    private val storedProfileActive = preferences.getBoolean("profile_active", preferences.getString("profile_phone", "").orEmpty().isNotBlank())

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
    var cepLoading by mutableStateOf(false)
        private set
    var cepError by mutableStateOf<String?>(null)
        private set
    var profileActive by mutableStateOf(storedProfileActive)
        private set
    private var refreshingOrders = false
    private var fullProducts by mutableStateOf<List<Product>>(emptyList())

    var customerName by mutableStateOf(if (storedProfileActive) preferences.getString("profile_name", "").orEmpty() else "")
        private set
    var customerPhone by mutableStateOf(if (storedProfileActive) preferences.getString("profile_phone", "").orEmpty() else "")
        private set
    var customerCep by mutableStateOf(if (storedProfileActive) preferences.getString("profile_cep", "").orEmpty() else "")
        private set
    var customerStreet by mutableStateOf(if (storedProfileActive) preferences.getString("profile_street", "").orEmpty() else "")
        private set
    var customerNumber by mutableStateOf(if (storedProfileActive) preferences.getString("profile_number", "").orEmpty() else "")
        private set
    var customerComplement by mutableStateOf(if (storedProfileActive) preferences.getString("profile_complement", "").orEmpty() else "")
        private set
    var customerNeighborhood by mutableStateOf(if (storedProfileActive) preferences.getString("profile_neighborhood", "").orEmpty() else "")
        private set
    var customerCity by mutableStateOf(if (storedProfileActive) preferences.getString("profile_city", "").orEmpty() else "")
        private set
    var customerState by mutableStateOf(if (storedProfileActive) preferences.getString("profile_state", "").orEmpty() else "")
        private set
    var customerReference by mutableStateOf(if (storedProfileActive) preferences.getString("profile_reference", "").orEmpty() else "")
        private set

    private val quantities = mutableStateMapOf<String, Int>()

    init {
        loadCatalog()
        refreshOrders()
        viewModelScope.launch {
            while (true) {
                delay(8_000L)
                if (trackingReferences().isNotEmpty()) refreshOrders(showLoading = false)
            }
        }
        viewModelScope.launch {
            while (true) {
                delay(5 * 60 * 1_000L)
                loadCatalog()
            }
        }
    }

    val products: List<Product>
        get() = productSource().filter { product ->
            (selectedCategory == "Todos" || product.category == selectedCategory) &&
                (query.isBlank() || product.name.contains(query, true) || product.sku.contains(query, true) || product.category.contains(query, true))
        }

    val cartLines: List<CartLine>
        get() = productSource().mapNotNull { product -> quantities[product.id]?.takeIf { it > 0 }?.let { CartLine(product, it) } }
    val cartCount: Int get() = quantities.values.sum()
    val subtotal: Double get() = cartLines.sumOf { it.total }
    val customerAddressLabel: String
        get() = if (customerStreet.isBlank()) "Informe seu endereco de entrega" else "$customerStreet, $customerNumber"
    val customerAddress: String
        get() = customerAddressLabel

    fun quantity(productId: String) = quantities[productId] ?: 0
    fun product(productId: String): Product? = productSource().firstOrNull { it.id == productId }
    fun relatedProducts(product: Product): List<Product> {
        val available = productSource().filter { it.id != product.id && it.stock > 0 }
        val sameCategory = available.filter { it.category == product.category }
            .sortedWith(compareByDescending<Product> { it.image.isNotBlank() }.thenByDescending { it.promo }.thenBy { it.name })
        if (sameCategory.size >= 12) return sameCategory.take(12)
        val complements = available.filter { candidate -> candidate.category != product.category }
            .sortedWith(compareByDescending<Product> { it.promo }.thenByDescending { it.image.isNotBlank() }.thenBy { it.name })
        return (sameCategory + complements).distinctBy { it.id }.take(12)
    }
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
        profileActive = true
        preferences.edit()
            .putBoolean("profile_active", true)
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

    fun loginWithPhone(phone: String): Boolean {
        val normalized = phone.filter(Char::isDigit)
        val storedPhone = preferences.getString("profile_phone", "").orEmpty()
        if (normalized.isBlank() || storedPhone.filter(Char::isDigit) != normalized) {
            clearVisibleProfile()
            customerPhone = phone.trim()
            return false
        }
        customerName = preferences.getString("profile_name", "").orEmpty()
        customerPhone = storedPhone
        customerCep = preferences.getString("profile_cep", "").orEmpty()
        customerStreet = preferences.getString("profile_street", "").orEmpty()
        customerNumber = preferences.getString("profile_number", "").orEmpty()
        customerComplement = preferences.getString("profile_complement", "").orEmpty()
        customerNeighborhood = preferences.getString("profile_neighborhood", "").orEmpty()
        customerCity = preferences.getString("profile_city", "").orEmpty()
        customerState = preferences.getString("profile_state", "").orEmpty()
        customerReference = preferences.getString("profile_reference", "").orEmpty()
        profileActive = true
        preferences.edit().putBoolean("profile_active", true).apply()
        return true
    }

    fun logoutProfile() {
        profileActive = false
        preferences.edit().putBoolean("profile_active", false).apply()
        clearVisibleProfile()
    }

    private fun clearVisibleProfile() {
        customerName = ""
        customerPhone = ""
        customerCep = ""
        customerStreet = ""
        customerNumber = ""
        customerComplement = ""
        customerNeighborhood = ""
        customerCity = ""
        customerState = ""
        customerReference = ""
    }

    fun lookupCep(cep: String, onFound: (CepAddress) -> Unit) {
        val normalized = cep.filter(Char::isDigit)
        if (normalized.length != 8 || cepLoading) return
        viewModelScope.launch {
            cepLoading = true
            cepError = null
            try { onFound(AiMercApi.lookupCep(normalized)) }
            catch (exception: Exception) { cepError = exception.message ?: "CEP nao encontrado" }
            finally { cepLoading = false }
        }
    }

    @Suppress("unused")
    fun saveProfile(name: String, phone: String, address: String) {
        saveProfile(name, phone, customerCep, address, customerNumber.ifBlank { "S/N" }, customerComplement, customerNeighborhood, customerCity, customerState, customerReference)
    }

    fun loadCatalog() {
        viewModelScope.launch {
            loading = true
            error = null
            try {
                catalog = AiMercApi.catalog()
                loading = false
                runCatching { AiMercApi.products() }.getOrNull()?.let { fullProducts = it }
            }
            catch (exception: Exception) { error = exception.message ?: "Falha ao carregar o catalogo" }
            finally { loading = false }
        }
    }

    private fun productSource(): List<Product> = fullProducts.ifEmpty { catalog?.products.orEmpty() }

    fun refreshOrders(showLoading: Boolean = true) {
        if (refreshingOrders) return
        viewModelScope.launch {
            refreshingOrders = true
            if (showLoading) ordersLoading = true
            try {
                val refreshed = trackingReferences().mapNotNull { reference ->
                    runCatching { AiMercApi.order(reference.id, reference.token) }.getOrNull()
                }
                orders = refreshed.sortedByDescending { it.createdAt }
            } finally {
                ordersLoading = false
                refreshingOrders = false
            }
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
