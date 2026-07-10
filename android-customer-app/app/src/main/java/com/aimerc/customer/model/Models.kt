package com.aimerc.customer.model

data class StoreInfo(
    val id: String,
    val slug: String,
    val name: String,
    val city: String,
    val state: String,
    val minimumOrder: Double,
    val deliveryFee: Double,
    val open: Boolean
)

data class Product(
    val id: String,
    val sku: String,
    val name: String,
    val category: String,
    val price: Double,
    val oldPrice: Double?,
    val stock: Double,
    val unit: String,
    val image: String,
    val promo: Boolean
)

data class Banner(
    val id: String,
    val eyebrow: String,
    val title: String,
    val subtitle: String
)

data class Catalog(
    val store: StoreInfo,
    val categories: List<String>,
    val banners: List<Banner>,
    val products: List<Product>
)

data class CartLine(val product: Product, val quantity: Int) {
    val total: Double get() = product.price * quantity
}

data class CheckoutData(
    val name: String,
    val phone: String,
    val address: String,
    val fulfillmentType: String,
    val paymentMethod: String,
    val changeFor: Double?,
    val notes: String
)
