package com.aimerc.customer.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aimerc.customer.data.AiMercApi
import com.aimerc.customer.model.CartLine
import com.aimerc.customer.model.Catalog
import com.aimerc.customer.model.CheckoutData
import com.aimerc.customer.model.Product
import kotlinx.coroutines.launch

class AiMercViewModel : ViewModel() {
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

    private val quantities = mutableStateMapOf<String, Int>()

    init { loadCatalog() }

    val products: List<Product>
        get() = catalog?.products.orEmpty().filter { product ->
            (selectedCategory == "Todos" || product.category == selectedCategory) &&
                (query.isBlank() || product.name.contains(query, true) || product.sku.contains(query, true) || product.category.contains(query, true))
        }

    val cartLines: List<CartLine>
        get() = catalog?.products.orEmpty().mapNotNull { product -> quantities[product.id]?.takeIf { it > 0 }?.let { CartLine(product, it) } }
    val cartCount: Int get() = quantities.values.sum()
    val subtotal: Double get() = cartLines.sumOf { it.total }

    fun quantity(productId: String) = quantities[productId] ?: 0
    fun add(product: Product) { quantities[product.id] = quantity(product.id) + 1 }
    fun remove(product: Product) {
        val next = quantity(product.id) - 1
        if (next <= 0) quantities.remove(product.id) else quantities[product.id] = next
    }
    fun clearError() { error = null }
    fun resetOrder() { confirmedOrderId = null }

    fun loadCatalog() {
        viewModelScope.launch {
            loading = true
            error = null
            try { catalog = AiMercApi.catalog() }
            catch (exception: Exception) { error = exception.message ?: "Falha ao carregar o catalogo" }
            finally { loading = false }
        }
    }

    fun submit(checkout: CheckoutData, onSuccess: () -> Unit) {
        if (cartLines.isEmpty()) return
        viewModelScope.launch {
            submitting = true
            error = null
            try {
                confirmedOrderId = AiMercApi.createOrder(checkout, cartLines)
                quantities.clear()
                loadCatalog()
                onSuccess()
            } catch (exception: Exception) {
                error = exception.message ?: "Nao foi possivel enviar o pedido"
            } finally { submitting = false }
        }
    }
}
