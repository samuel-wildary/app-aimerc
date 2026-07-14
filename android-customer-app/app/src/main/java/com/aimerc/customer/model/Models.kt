package com.aimerc.customer.model

data class StoreInfo(
    val id: String,
    val slug: String,
    val name: String,
    val city: String,
    val state: String,
    val minimumOrder: Double,
    val deliveryFee: Double,
    val freeDeliveryAbove: Double,
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
    val subtitle: String,
    val image: String,
    val position: Int
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
    val cep: String,
    val street: String,
    val number: String,
    val complement: String,
    val neighborhood: String,
    val city: String,
    val state: String,
    val reference: String,
    val fulfillmentType: String,
    val paymentMethod: String,
    val changeFor: Double?,
    val notes: String
) {
    @Suppress("unused")
    constructor(name: String, phone: String, address: String, fulfillmentType: String, paymentMethod: String, changeFor: Double?, notes: String) : this(
        name, phone, "", address, "S/N", "", "", "", "", "", fulfillmentType, paymentMethod, changeFor, notes
    )
}

data class OrderReceipt(val id: String, val trackingToken: String, val order: CustomerOrder)

data class OrderItem(
    val productId: String,
    val name: String,
    val unit: String,
    val quantity: Double,
    val price: Double,
    val total: Double
)

data class CustomerOrder(
    val id: String,
    val status: String,
    val fulfillmentType: String,
    val paymentMethod: String,
    val subtotal: Double,
    val deliveryFee: Double,
    val total: Double,
    val createdAt: String,
    val items: List<OrderItem>,
    val cancellation: CancellationInfo?
)

data class CancellationInfo(
    val eligible: Boolean,
    val windowEndsAt: String,
    val supportPhone: String,
    val message: String
)
