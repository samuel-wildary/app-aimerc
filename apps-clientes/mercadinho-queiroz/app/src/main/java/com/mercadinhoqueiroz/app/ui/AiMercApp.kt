package com.mercadinhoqueiroz.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.Image
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.HeadsetMic
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.outlined.LocalOffer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.mercadinhoqueiroz.app.R
import com.mercadinhoqueiroz.app.model.CartLine
import com.mercadinhoqueiroz.app.model.Banner
import com.mercadinhoqueiroz.app.model.CheckoutData
import com.mercadinhoqueiroz.app.model.CustomerOrder
import com.mercadinhoqueiroz.app.model.Product
import kotlinx.coroutines.delay
import java.text.NumberFormat
import java.util.Locale

private val Forest = Color(0xFF1B2950)
private val ForestLight = Color(0xFF2A407A)
private val Mint = Color(0xFFFF7D18)
private val MintSoft = Color(0xFFFFF0E3)
private val Canvas = Color(0xFFF7F8FC)
private val Ink = Color(0xFF17213D)
private val Muted = Color(0xFF68718A)
private val Line = Color(0xFFE1E5EF)
private val Orange = Color(0xFFFF7D18)

private enum class Screen { HOME, SEARCH, PRODUCT, CART, CHECKOUT, SUCCESS, ORDERS, PROFILE }

private val currency = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR"))

@Composable
fun AiMercApp(viewModel: AiMercViewModel = viewModel()) {
    var screen by rememberSaveable { mutableStateOf(Screen.HOME) }
    var selectedProductId by rememberSaveable { mutableStateOf<String?>(null) }
    var productBackTarget by remember { mutableStateOf(Screen.HOME) }
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(viewModel.error) {
        viewModel.error?.let { snackbar.showSnackbar(it); viewModel.clearError() }
    }
    LaunchedEffect(screen) {
        if (screen == Screen.ORDERS) viewModel.refreshOrders()
    }
    MaterialTheme(
        colorScheme = MaterialTheme.colorScheme.copy(primary = Mint, secondary = Forest, background = Canvas, surface = Color.White, onPrimary = Forest, onBackground = Ink),
        typography = MaterialTheme.typography.copy(
            headlineLarge = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Black, letterSpacing = (-1).sp),
            headlineSmall = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Black),
            titleLarge = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
            titleMedium = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
        )
    ) {
        Scaffold(
            containerColor = Canvas,
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                if (screen in listOf(Screen.HOME, Screen.SEARCH, Screen.ORDERS, Screen.PROFILE)) {
                    Column {
                        AnimatedVisibility(viewModel.cartCount > 0) {
                            CartDock(viewModel.cartCount, viewModel.subtotal) { screen = Screen.CART }
                        }
                        MainNavigation(screen) { screen = it }
                    }
                }
            }
        ) { padding ->
            when (screen) {
                Screen.HOME -> HomeScreen(viewModel, Modifier.padding(padding), openSearch = { screen = Screen.SEARCH }) { product -> selectedProductId = product.id; productBackTarget = Screen.HOME; screen = Screen.PRODUCT }
                Screen.SEARCH -> SearchScreen(viewModel, Modifier.padding(padding)) { product -> selectedProductId = product.id; productBackTarget = Screen.SEARCH; screen = Screen.PRODUCT }
                Screen.PRODUCT -> viewModel.product(selectedProductId.orEmpty())?.let { product -> ProductDetailScreen(product, viewModel, back = { screen = productBackTarget }) { related -> selectedProductId = related.id } } ?: ErrorScreen { screen = productBackTarget }
                Screen.CART -> CartScreen(viewModel, back = { screen = Screen.HOME }, checkout = { screen = Screen.CHECKOUT })
                Screen.CHECKOUT -> CheckoutScreenV2(viewModel, back = { screen = Screen.CART }) { screen = Screen.SUCCESS }
                Screen.SUCCESS -> SuccessScreen(viewModel.confirmedOrderId.orEmpty()) { viewModel.resetOrder(); screen = Screen.HOME }
                Screen.ORDERS -> OrdersScreen(viewModel, Modifier.padding(padding))
                Screen.PROFILE -> ProfileScreenV2(viewModel, Modifier.padding(padding))
            }
        }
    }
}

@Composable
private fun HomeScreen(viewModel: AiMercViewModel, modifier: Modifier, openSearch: () -> Unit, openProduct: (Product) -> Unit) {
    when {
        viewModel.loading && viewModel.catalog == null -> LoadingScreen(branded = true)
        viewModel.catalog == null -> ErrorScreen(viewModel::loadCatalog)
        else -> {
            val catalog = viewModel.catalog ?: return
            LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                item { HomeHeader(catalog.store.name, catalog.store.open, viewModel.customerAddressLabel, openSearch) }
                item { PromoHero(catalog.banners) }
                item { CategoryRail(listOf("Todos") + catalog.categories, viewModel.selectedCategory) { viewModel.selectedCategory = it } }
                val featured = viewModel.products.filter { it.promo }
                if (featured.isNotEmpty()) item { ProductShelf("Ofertas que valem a pena", "Economize nos favoritos", featured, viewModel, openProduct) }
                catalog.categories.forEach { category ->
                    val categoryProducts = viewModel.products.filter { it.category == category }
                    if (categoryProducts.isNotEmpty()) item { ProductShelf(category, "Selecionados para sua compra", categoryProducts, viewModel, openProduct) }
                }
                item { StorePromise() }
            }
        }
    }
}

@Composable
private fun HomeHeader(storeName: String, open: Boolean, deliveryAddress: String, openSearch: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Forest).statusBarsPadding().padding(horizontal = 18.dp, vertical = 14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                painter = painterResource(R.drawable.queiroz_menu_logo),
                contentDescription = "Mercadinho Queiroz",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .width(78.dp)
                    .height(58.dp)
                    .offset(y = (-6).dp)
            )
            Spacer(Modifier.width(17.dp))
            Column(Modifier.weight(1f)) { Text(storeName, color = Color.White, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis); Text(if (open) "Aberto agora" else "Fechado", color = if (open) Mint else Orange, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            IconButton(onClick = {}) { Icon(Icons.Default.Person, null, tint = Color.White) }
        }
        Spacer(Modifier.height(13.dp))
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White).clickable(onClick = openSearch).padding(horizontal = 14.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Search, null, tint = Muted, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(9.dp)); Text("O que esta faltando em casa?", color = Muted, fontSize = 14.sp)
        }
        Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.LocationOn, null, tint = Mint, modifier = Modifier.size(17.dp)); Spacer(Modifier.width(5.dp)); Text(deliveryAddress, color = Color(0xFFC4DDD4), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis); Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF88AA9E), modifier = Modifier.size(17.dp)) }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PromoHero(banners: List<Banner>) {
    if (banners.isEmpty()) return
    val pagerState = rememberPagerState(pageCount = { banners.size })
    LaunchedEffect(banners.size) {
        if (banners.size <= 1) return@LaunchedEffect
        while (true) {
            delay(4_500)
            pagerState.animateScrollToPage((pagerState.currentPage + 1) % banners.size)
        }
    }
    Column(Modifier.padding(top = 18.dp)) {
        HorizontalPager(state = pagerState, contentPadding = PaddingValues(horizontal = 18.dp), pageSpacing = 10.dp) { page ->
            val banner = banners[page]
            Box(Modifier.fillMaxWidth().height(180.dp).clip(RoundedCornerShape(24.dp)).background(Forest)) {
                if (banner.image.isNotBlank()) AsyncImage(model = banner.image, contentDescription = banner.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Color(0xF21B2950), Color(0xC42A407A), Color(0x331B2950)))))
                Column(Modifier.align(Alignment.CenterStart).padding(22.dp).fillMaxWidth(.74f)) {
                    Text(banner.eyebrow.uppercase(), color = Mint, fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                    Spacer(Modifier.height(8.dp)); Text(banner.title, color = Color.White, fontSize = 26.sp, lineHeight = 28.sp, fontWeight = FontWeight.Black); Spacer(Modifier.height(7.dp)); Text(banner.subtitle, color = Color(0xFFD5E8E1), fontSize = 12.sp, lineHeight = 16.sp)
                }
                Box(Modifier.align(Alignment.BottomEnd).padding(16.dp).size(48.dp).clip(CircleShape).background(Mint), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.LocalOffer, null, tint = Forest, modifier = Modifier.size(24.dp)) }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 9.dp), horizontalArrangement = Arrangement.Center) {
            banners.indices.forEach { index -> Box(Modifier.padding(horizontal = 3.dp).width(if (pagerState.currentPage == index) 20.dp else 6.dp).height(6.dp).clip(CircleShape).background(if (pagerState.currentPage == index) Forest else Line)) }
        }
    }
}

@Composable
private fun CategoryRail(categories: List<String>, selected: String, onSelect: (String) -> Unit) {
    Column { SectionHeading("Compre por categoria", null); Row(Modifier.horizontalScroll(androidx.compose.foundation.rememberScrollState()).padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) { categories.forEach { category -> FilterChip(selected = selected == category, onClick = { onSelect(category) }, label = { Text(category) }, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Forest, selectedLabelColor = Color.White, containerColor = Color.White), border = FilterChipDefaults.filterChipBorder(enabled = true, selected = selected == category, borderColor = Line, selectedBorderColor = Forest)) } }; Spacer(Modifier.height(5.dp)) }
}

@Composable
private fun ProductShelf(title: String, subtitle: String, products: List<Product>, viewModel: AiMercViewModel, openProduct: (Product) -> Unit) {
    Column(Modifier.padding(top = 22.dp)) {
        SectionHeading(title, subtitle)
        LazyRow(contentPadding = PaddingValues(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) { items(products, key = { it.id }) { product -> ProductCard(product, viewModel.quantity(product.id), { viewModel.add(product) }, { viewModel.remove(product) }, { openProduct(product) }) } }
    }
}

@Composable
private fun SectionHeading(title: String, subtitle: String?) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 11.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) { Column { Text(title, fontWeight = FontWeight.Black, fontSize = 20.sp, color = Ink); if (subtitle != null) Text(subtitle, color = Muted, fontSize = 11.sp) }; Text("Ver tudo", color = Color(0xFF0A9266), fontSize = 11.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun ProductCard(product: Product, quantity: Int, add: () -> Unit, remove: () -> Unit, open: () -> Unit) {
    Card(Modifier.width(164.dp).clickable(onClick = open), shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.padding(11.dp)) {
            Box(Modifier.fillMaxWidth().height(116.dp).clip(RoundedCornerShape(13.dp)).background(Color.White)) {
                AsyncImage(model = product.image, contentDescription = product.name, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(8.dp))
                if (product.promo) Text("OFERTA", Modifier.padding(7.dp).clip(RoundedCornerShape(999.dp)).background(Orange).padding(horizontal = 8.dp, vertical = 4.dp), color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Black)
            }
            Spacer(Modifier.height(10.dp)); Text(product.name, minLines = 2, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold, color = Ink, fontSize = 13.sp, lineHeight = 16.sp)
            Text(product.category, color = Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
            Spacer(Modifier.height(8.dp)); product.oldPrice?.let { Text(currency.format(it), color = Muted, fontSize = 10.sp, textDecoration = TextDecoration.LineThrough) }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Column { Text(currency.format(product.price), fontWeight = FontWeight.Black, fontSize = 15.sp, color = Ink); Text("por ${product.unit.lowercase()}", color = Muted, fontSize = 9.sp) }
                QuantityControl(quantity, add, remove)
            }
        }
    }
}

@Composable
private fun QuantityControl(quantity: Int, add: () -> Unit, remove: () -> Unit) {
    if (quantity == 0) IconButton(onClick = add, modifier = Modifier.size(36.dp).clip(CircleShape).background(Mint)) { Icon(Icons.Default.Add, "Adicionar", tint = Forest, modifier = Modifier.size(19.dp)) }
    else Row(Modifier.clip(RoundedCornerShape(999.dp)).background(Forest), verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = remove, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Remove, "Remover", tint = Color.White, modifier = Modifier.size(15.dp)) }; Text(quantity.toString(), color = Color.White, fontWeight = FontWeight.Black, fontSize = 12.sp); IconButton(onClick = add, modifier = Modifier.size(32.dp)) { Icon(Icons.Default.Add, "Adicionar", tint = Mint, modifier = Modifier.size(15.dp)) } }
}

@Composable
private fun StorePromise() {
    Row(Modifier.padding(18.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MintSoft).padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(44.dp).clip(CircleShape).background(Mint), contentAlignment = Alignment.Center) { Icon(Icons.Default.Check, null, tint = Forest) }; Spacer(Modifier.width(13.dp)); Column { Text("Compra segura e separada com cuidado", fontWeight = FontWeight.ExtraBold, color = Forest); Text("Voce confere tudo na entrega ou retirada.", color = Color(0xFF527266), fontSize = 11.sp) } }
}

@Composable
private fun SearchScreen(viewModel: AiMercViewModel, modifier: Modifier, openProduct: (Product) -> Unit) {
    Column(modifier.fillMaxSize().background(Canvas)) {
        Column(Modifier.fillMaxWidth().background(Forest).statusBarsPadding().padding(18.dp)) { Text("Buscar produtos", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black); Spacer(Modifier.height(14.dp)); OutlinedTextField(value = viewModel.query, onValueChange = { viewModel.query = it }, placeholder = { Text("Nome, marca, categoria ou SKU") }, leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(), colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(focusedContainerColor = Color.White, unfocusedContainerColor = Color.White, focusedBorderColor = Mint, unfocusedBorderColor = Color.Transparent)) }
        LazyColumn(contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { items(viewModel.products, key = { it.id }) { product -> SearchProductRow(product, viewModel.quantity(product.id), { viewModel.add(product) }, { viewModel.remove(product) }, { openProduct(product) }) } }
    }
}

@Composable
private fun SearchProductRow(product: Product, quantity: Int, add: () -> Unit, remove: () -> Unit, open: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).clickable(onClick = open).padding(10.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(78.dp).clip(RoundedCornerShape(12.dp)).background(Color.White).padding(6.dp)) { AsyncImage(product.image, product.name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }; Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text(product.name, fontWeight = FontWeight.ExtraBold, color = Ink, maxLines = 2); Text(product.category, color = Muted, fontSize = 10.sp); Text(currency.format(product.price), fontWeight = FontWeight.Black, color = Forest, modifier = Modifier.padding(top = 8.dp)) }; QuantityControl(quantity, add, remove) }
}

@Composable
private fun ProductDetailScreen(product: Product, viewModel: AiMercViewModel, back: () -> Unit, openProduct: (Product) -> Unit) {
    val quantity = viewModel.quantity(product.id)
    val related = viewModel.relatedProducts(product)
    Scaffold(
        containerColor = Canvas,
        topBar = { SimpleTopBar("Detalhes do produto", back) },
        bottomBar = {
            Row(
                Modifier.fillMaxWidth().background(Color.White).navigationBarsPadding().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Total do item", color = Muted, fontSize = 11.sp)
                    Text(currency.format(product.price * quantity.coerceAtLeast(1)), color = Ink, fontSize = 21.sp, fontWeight = FontWeight.Black)
                }
                if (quantity == 0) {
                    Button(onClick = { viewModel.add(product) }, modifier = Modifier.height(50.dp), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.buttonColors(containerColor = Mint, contentColor = Forest)) {
                        Icon(Icons.Default.Add, null)
                        Spacer(Modifier.width(6.dp))
                        Text("Adicionar", fontWeight = FontWeight.Black)
                    }
                } else QuantityControl(quantity, { viewModel.add(product) }, { viewModel.remove(product) })
            }
        }
    ) { padding ->
        LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Box(Modifier.fillMaxWidth().height(330.dp).background(Color.White).padding(28.dp), contentAlignment = Alignment.Center) {
                    AsyncImage(product.image, product.name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                    if (product.promo) Text("OFERTA", Modifier.align(Alignment.TopStart).clip(RoundedCornerShape(999.dp)).background(Orange).padding(horizontal = 12.dp, vertical = 7.dp), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black)
                }
            }
            item {
                Column(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 20.dp, vertical = 18.dp)) {
                    Text(product.category.uppercase(), color = ForestLight, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(product.name, color = Ink, fontSize = 25.sp, lineHeight = 30.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.height(12.dp))
                    product.oldPrice?.let { Text(currency.format(it), color = Muted, fontSize = 13.sp, textDecoration = TextDecoration.LineThrough) }
                    Text(currency.format(product.price), color = Forest, fontSize = 28.sp, fontWeight = FontWeight.Black)
                    Text("Valor por ${product.unit.lowercase()} · produto disponivel", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
                }
            }
            if (related.isNotEmpty()) item { ProductShelf("Voce tambem pode gostar", "Itens relacionados para completar sua compra", related, viewModel, openProduct) }
        }
    }
}

@Composable
private fun CartDock(count: Int, subtotal: Double, open: () -> Unit) {
    Surface(color = Color.Transparent) { Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(Forest).clickable(onClick = open).padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(32.dp).clip(CircleShape).background(Mint), contentAlignment = Alignment.Center) { Text(count.toString(), color = Forest, fontWeight = FontWeight.Black) }; Spacer(Modifier.width(10.dp)); Text("Ver carrinho", color = Color.White, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f)); Text(currency.format(subtotal), color = Mint, fontWeight = FontWeight.Black); Icon(Icons.Default.ChevronRight, null, tint = Mint) } }
}

@Composable
private fun MainNavigation(screen: Screen, onChange: (Screen) -> Unit) {
    val items = listOf(Screen.HOME to (Icons.Default.Home to "Inicio"), Screen.SEARCH to (Icons.Default.Search to "Buscar"), Screen.ORDERS to (Icons.AutoMirrored.Filled.ReceiptLong to "Pedidos"), Screen.PROFILE to (Icons.Default.Person to "Conta"))
    NavigationBar(containerColor = Color.White, modifier = Modifier.navigationBarsPadding()) { items.forEach { (target, data) -> NavigationBarItem(selected = screen == target, onClick = { onChange(target) }, icon = { Icon(data.first, data.second) }, label = { Text(data.second, fontSize = 10.sp) }, colors = NavigationBarItemDefaults.colors(selectedIconColor = Forest, selectedTextColor = Forest, indicatorColor = MintSoft, unselectedIconColor = Muted, unselectedTextColor = Muted)) } }
}

private val orderStatusLabels = mapOf(
    "RECEIVED" to "Pedido recebido",
    "PICKING" to "Separando produtos",
    "READY" to "Pedido pronto",
    "OUT_FOR_DELIVERY" to "Saiu para entrega",
    "DONE" to "Pedido entregue",
    "CANCELLED" to "Pedido cancelado"
)

@Composable
private fun OrdersScreen(viewModel: AiMercViewModel, modifier: Modifier) {
    Column(modifier.fillMaxSize().background(Canvas)) {
        Row(Modifier.fillMaxWidth().background(Forest).statusBarsPadding().padding(horizontal = 18.dp, vertical = 17.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Text("Seus pedidos", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black); Text("Acompanhe cada etapa em tempo real", color = Color(0xFFACCCC0), fontSize = 11.sp) }
            IconButton(onClick = viewModel::refreshOrders) { Icon(Icons.Default.Refresh, "Atualizar pedidos", tint = Mint) }
        }
        when {
            viewModel.ordersLoading && viewModel.orders.isEmpty() -> LoadingScreen()
            viewModel.orders.isEmpty() -> PlaceholderScreen("Nenhum pedido neste aparelho", "Depois de confirmar uma compra, o acompanhamento aparece automaticamente aqui.", Icons.AutoMirrored.Filled.ReceiptLong, Modifier.fillMaxSize())
            else -> LazyColumn(contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(viewModel.orders, key = { it.id }) { order -> CustomerOrderCard(order) { viewModel.cancelOrder(order) } }
            }
        }
    }
}

@Composable
private fun CustomerOrderCard(order: CustomerOrder, onCancel: () -> Unit) {
    val context = LocalContext.current
    var confirmCancel by rememberSaveable(order.id) { mutableStateOf(false) }
    val cancelled = order.status == "CANCELLED"
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column { Text("#${order.id}", color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold); Text(orderStatusLabels[order.status] ?: order.status, color = if (cancelled) Color(0xFFC64A4A) else Forest, fontWeight = FontWeight.Black, fontSize = 18.sp, modifier = Modifier.padding(top = 3.dp)) }
                Column(horizontalAlignment = Alignment.End) { Text(currency.format(order.total), fontWeight = FontWeight.Black, color = Ink); Text(formatOrderDate(order.createdAt), color = Muted, fontSize = 10.sp) }
            }
            if (!cancelled) { Spacer(Modifier.height(17.dp)); OrderProgress(order.status) }
            Spacer(Modifier.height(16.dp)); order.items.take(3).forEach { item -> Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) { Text("${formatQuantity(item.quantity)} ${item.unit}", color = Color(0xFF0A9066), fontSize = 11.sp, fontWeight = FontWeight.Black, modifier = Modifier.width(58.dp)); Text(item.name, color = Ink, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis) } }
            if (order.items.size > 3) Text("+ ${order.items.size - 3} itens", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp))
            if (!cancelled && order.cancellation != null) {
                Spacer(Modifier.height(12.dp))
                if (order.cancellation.eligible) {
                    if (confirmCancel) {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFFFFF0F0)).padding(12.dp)) {
                            Text("Cancelar este pedido?", color = Color(0xFF9A3535), fontWeight = FontWeight.Black)
                            Text("Os itens voltarao ao estoque da loja.", color = Color(0xFF8B5A5A), fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
                            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                TextButton(onClick = { confirmCancel = false }, modifier = Modifier.weight(1f)) { Text("Manter pedido") }
                                Button(onClick = onCancel, modifier = Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD94B4B), contentColor = Color.White)) { Text("Confirmar") }
                            }
                        }
                    } else {
                        TextButton(onClick = { confirmCancel = true }, modifier = Modifier.fillMaxWidth()) { Text("Cancelar pedido", color = Color(0xFFC24242), fontWeight = FontWeight.Bold) }
                    }
                } else {
                    TextButton(onClick = {
                        val number = order.cancellation.supportPhone.filter { it.isDigit() }
                        if (number.isNotBlank()) context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")))
                    }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Phone, null, tint = Forest, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text("Precisa cancelar? Ligar para a central", color = Forest, fontWeight = FontWeight.Bold) }
                    Text(order.cancellation.message, color = Muted, fontSize = 10.sp, lineHeight = 13.sp)
                }
            }
            Spacer(Modifier.height(12.dp)); Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(Color(0xFFF3F7F4)).padding(11.dp), verticalAlignment = Alignment.CenterVertically) { Icon(if (order.fulfillmentType == "DELIVERY") Icons.Default.LocalShipping else Icons.Default.Storefront, null, tint = Forest, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(if (order.fulfillmentType == "DELIVERY") "Entrega · taxa ${currency.format(order.deliveryFee)}" else "Retirada no supermercado", color = Color(0xFF52615A), fontSize = 11.sp, fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun OrderProgress(status: String) {
    val steps = listOf("RECEIVED", "PICKING", "READY", "OUT_FOR_DELIVERY", "DONE")
    val current = steps.indexOf(status).coerceAtLeast(0)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        steps.forEachIndexed { index, _ ->
            Box(Modifier.size(if (index == current) 15.dp else 10.dp).clip(CircleShape).background(if (index <= current) Mint else Line), contentAlignment = Alignment.Center) { if (index == current) Box(Modifier.size(5.dp).clip(CircleShape).background(Forest)) }
            if (index < steps.lastIndex) Box(Modifier.weight(1f).height(3.dp).background(if (index < current) Mint else Line))
        }
    }
}

@Composable
private fun ProfileScreen(viewModel: AiMercViewModel, modifier: Modifier) {
    var name by rememberSaveable(viewModel.customerName) { mutableStateOf(viewModel.customerName) }
    var phone by rememberSaveable(viewModel.customerPhone) { mutableStateOf(viewModel.customerPhone) }
    var address by rememberSaveable(viewModel.customerAddress) { mutableStateOf(viewModel.customerAddress) }
    var saved by remember { mutableStateOf(false) }
    LazyColumn(modifier.fillMaxSize().background(Canvas), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Column(Modifier.fillMaxWidth().background(Forest).statusBarsPadding().padding(20.dp)) { Box(Modifier.size(58.dp).clip(CircleShape).background(Mint), contentAlignment = Alignment.Center) { Icon(Icons.Default.Person, null, tint = Forest, modifier = Modifier.size(30.dp)) }; Spacer(Modifier.height(13.dp)); Text(if (name.isBlank()) "Sua conta" else name, color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black); Text("Dados usados para agilizar suas compras", color = Color(0xFFACCCC0), fontSize = 11.sp) } }
        item { Column(Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White).padding(16.dp)) { Text("Dados pessoais", fontSize = 18.sp, fontWeight = FontWeight.Black); Text("Voce pode alterar quando quiser.", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(bottom = 14.dp)); AppField(name, { name = it; saved = false }, "Nome completo"); Spacer(Modifier.height(9.dp)); AppField(phone, { phone = it; saved = false }, "WhatsApp", KeyboardType.Phone); Spacer(Modifier.height(9.dp)); AppField(address, { address = it; saved = false }, "Endereco principal"); Button(onClick = { viewModel.saveProfile(name, phone, address); saved = true }, enabled = name.isNotBlank() && phone.isNotBlank(), modifier = Modifier.fillMaxWidth().height(50.dp).padding(top = 8.dp), shape = RoundedCornerShape(13.dp), colors = ButtonDefaults.buttonColors(containerColor = Mint, contentColor = Forest)) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(6.dp)); Text(if (saved) "Dados salvos" else "Salvar meus dados", fontWeight = FontWeight.Black) } } }
        item { Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(17.dp)).background(MintSoft).padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.HeadsetMic, null, tint = Forest, modifier = Modifier.size(26.dp)); Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text("Precisa de ajuda?", fontWeight = FontWeight.Black, color = Forest); Text("Fale diretamente com o supermercado.", color = Color(0xFF587268), fontSize = 11.sp) }; Icon(Icons.Default.ChevronRight, null, tint = Forest) } }
        item { Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.Center) { Text("Mercadinho Queiroz · praticidade & qualidade", color = Muted, fontSize = 10.sp) } }
    }
}

@Composable
private fun ProfileScreenV2(viewModel: AiMercViewModel, modifier: Modifier) {
    var name by rememberSaveable { mutableStateOf(viewModel.customerName) }; var phone by rememberSaveable { mutableStateOf(viewModel.customerPhone) }; var cep by rememberSaveable { mutableStateOf(viewModel.customerCep) }; var street by rememberSaveable { mutableStateOf(viewModel.customerStreet) }; var number by rememberSaveable { mutableStateOf(viewModel.customerNumber) }; var complement by rememberSaveable { mutableStateOf(viewModel.customerComplement) }; var neighborhood by rememberSaveable { mutableStateOf(viewModel.customerNeighborhood) }; var city by rememberSaveable { mutableStateOf(viewModel.customerCity) }; var state by rememberSaveable { mutableStateOf(viewModel.customerState) }; var reference by rememberSaveable { mutableStateOf(viewModel.customerReference) }; var saved by remember { mutableStateOf(false) }
    LazyColumn(modifier.fillMaxSize().background(Canvas), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Column(Modifier.fillMaxWidth().background(Forest).statusBarsPadding().padding(20.dp)) { Box(Modifier.size(58.dp).clip(CircleShape).background(Mint), contentAlignment = Alignment.Center) { Icon(Icons.Default.Person, null, tint = Forest, modifier = Modifier.size(30.dp)) }; Spacer(Modifier.height(13.dp)); Text(if (name.isBlank()) "Seus dados" else name, color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Black); Text("Salvos neste aparelho para agilizar sua proxima compra", color = Color(0xFFACCCC0), fontSize = 11.sp) } }
        item { Column(Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White).padding(16.dp)) { Text("Cadastro de entrega", fontSize = 18.sp, fontWeight = FontWeight.Black); Text("Preencha uma vez. Nas proximas compras, apenas confirme.", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(bottom = 14.dp)); AppField(name, { name = it; saved = false }, "Nome completo"); Spacer(Modifier.height(9.dp)); AppField(phone, { phone = it; saved = false }, "WhatsApp", KeyboardType.Phone); Spacer(Modifier.height(9.dp)); AppField(cep, { cep = it.filter(Char::isDigit).take(8); saved = false }, "CEP (somente numeros)", KeyboardType.Number); Spacer(Modifier.height(9.dp)); AppField(street, { street = it; saved = false }, "Rua ou avenida"); Spacer(Modifier.height(9.dp)); AppField(number, { number = it; saved = false }, "Numero da casa"); Spacer(Modifier.height(9.dp)); AppField(complement, { complement = it; saved = false }, "Complemento (opcional)"); Spacer(Modifier.height(9.dp)); AppField(neighborhood, { neighborhood = it; saved = false }, "Bairro"); Spacer(Modifier.height(9.dp)); AppField(city, { city = it; saved = false }, "Cidade"); Spacer(Modifier.height(9.dp)); AppField(state, { state = it.uppercase().take(2); saved = false }, "UF"); Spacer(Modifier.height(9.dp)); AppField(reference, { reference = it; saved = false }, "Ponto de referencia (opcional)"); Button(onClick = { viewModel.saveProfile(name, phone, cep, street, number, complement, neighborhood, city, state, reference); saved = true }, enabled = name.isNotBlank() && phone.isNotBlank() && cep.length == 8 && street.isNotBlank() && number.isNotBlank() && neighborhood.isNotBlank() && city.isNotBlank() && state.length == 2, modifier = Modifier.fillMaxWidth().height(50.dp).padding(top = 8.dp), shape = RoundedCornerShape(13.dp), colors = ButtonDefaults.buttonColors(containerColor = Mint, contentColor = Forest)) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(6.dp)); Text(if (saved) "Dados salvos" else "Salvar dados", fontWeight = FontWeight.Black) } } }
    }
}

private fun formatQuantity(value: Double) = if (value % 1.0 == 0.0) value.toInt().toString() else String.format(Locale.forLanguageTag("pt-BR"), "%.2f", value)
private fun formatOrderDate(value: String): String {
    if (value.length < 16) return value
    val date = value.substring(0, 10).split('-')
    return "${date.getOrElse(2) { "" }}/${date.getOrElse(1) { "" }} · ${value.substring(11, 16)}"
}

@Composable
private fun CartScreen(viewModel: AiMercViewModel, back: () -> Unit, checkout: () -> Unit) {
    val store = viewModel.catalog?.store
    Scaffold(containerColor = Canvas, topBar = { SimpleTopBar("Seu carrinho", back) }, bottomBar = { Column(Modifier.background(Color.White).navigationBarsPadding().padding(16.dp)) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Subtotal", color = Muted); Text(currency.format(viewModel.subtotal), fontWeight = FontWeight.Black, fontSize = 20.sp) }; val remaining = (store?.minimumOrder ?: 0.0) - viewModel.subtotal; if (remaining > 0) Text("Faltam ${currency.format(remaining)} para o pedido minimo", color = Orange, fontSize = 11.sp, modifier = Modifier.padding(vertical = 7.dp)); Button(onClick = checkout, enabled = viewModel.cartLines.isNotEmpty() && remaining <= 0, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.buttonColors(containerColor = Mint, contentColor = Forest)) { Text("Continuar", fontWeight = FontWeight.Black); Spacer(Modifier.width(5.dp)); Icon(Icons.Default.ChevronRight, null) } } }) { padding ->
        if (viewModel.cartLines.isEmpty()) PlaceholderScreen("Carrinho vazio", "Adicione produtos para continuar sua compra.", Icons.Default.ShoppingBag, Modifier.padding(padding))
        else LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { items(viewModel.cartLines, key = { it.product.id }) { line -> CartLineCard(line, { viewModel.add(line.product) }, { viewModel.remove(line.product) }) } }
    }
}

@Composable
private fun CartLineCard(line: CartLine, add: () -> Unit, remove: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White).padding(11.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(72.dp).clip(RoundedCornerShape(11.dp)).background(Color.White).padding(6.dp)) { AsyncImage(line.product.image, line.product.name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }; Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { Text(line.product.name, fontWeight = FontWeight.ExtraBold, maxLines = 2); Text(currency.format(line.total), color = Forest, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 6.dp)) }; QuantityControl(line.quantity, add, remove) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CheckoutScreenV2(viewModel: AiMercViewModel, back: () -> Unit, success: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(viewModel.customerName) }; var phone by rememberSaveable { mutableStateOf(viewModel.customerPhone) }; var cep by rememberSaveable { mutableStateOf(viewModel.customerCep) }; var street by rememberSaveable { mutableStateOf(viewModel.customerStreet) }; var number by rememberSaveable { mutableStateOf(viewModel.customerNumber) }; var complement by rememberSaveable { mutableStateOf(viewModel.customerComplement) }; var neighborhood by rememberSaveable { mutableStateOf(viewModel.customerNeighborhood) }; var city by rememberSaveable { mutableStateOf(viewModel.customerCity) }; var state by rememberSaveable { mutableStateOf(viewModel.customerState) }; var reference by rememberSaveable { mutableStateOf(viewModel.customerReference) }; var notes by rememberSaveable { mutableStateOf("") }; var fulfillment by rememberSaveable { mutableStateOf("DELIVERY") }; var payment by rememberSaveable { mutableStateOf("CARD_ON_DELIVERY") }
    val store = viewModel.catalog?.store; val deliveryFee = if (fulfillment == "DELIVERY" && !(store?.freeDeliveryAbove ?: 0.0 > 0 && viewModel.subtotal >= (store?.freeDeliveryAbove ?: 0.0))) store?.deliveryFee ?: 0.0 else 0.0
    val validAddress = fulfillment == "PICKUP" || (cep.length == 8 && street.isNotBlank() && number.isNotBlank() && neighborhood.isNotBlank() && city.isNotBlank() && state.length == 2)
    val valid = name.isNotBlank() && phone.isNotBlank() && validAddress
    Scaffold(containerColor = Canvas, topBar = { SimpleTopBar("Finalizar compra", back) }, bottomBar = { Column(Modifier.background(Color.White).navigationBarsPadding().padding(16.dp)) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Total", color = Muted); Text(currency.format(viewModel.subtotal + deliveryFee), fontWeight = FontWeight.Black, fontSize = 21.sp) }; Button(onClick = { viewModel.submit(CheckoutData(name, phone, cep, street, number, complement, neighborhood, city, state, reference, fulfillment, payment, null, notes), success) }, enabled = valid && !viewModel.submitting, modifier = Modifier.fillMaxWidth().height(52.dp).padding(top = 7.dp), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.buttonColors(containerColor = Mint, contentColor = Forest)) { Text(if (viewModel.submitting) "Enviando pedido..." else "Confirmar pedido", fontWeight = FontWeight.Black) } } }) { padding ->
        LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            item { CheckoutSection("Como voce quer receber?") { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { ChoiceChip("Entrega", fulfillment == "DELIVERY") { fulfillment = "DELIVERY" }; ChoiceChip("Retirada", fulfillment == "PICKUP") { fulfillment = "PICKUP" } } } }
            item { CheckoutSection("Quem vai receber") { AppField(name, { name = it }, "Nome completo"); Spacer(Modifier.height(9.dp)); AppField(phone, { phone = it }, "WhatsApp", KeyboardType.Phone) } }
            if (fulfillment == "DELIVERY") item { CheckoutSection("Endereco de entrega") { AppField(cep, { cep = it.filter(Char::isDigit).take(8) }, "CEP", KeyboardType.Number); Spacer(Modifier.height(9.dp)); AppField(street, { street = it }, "Rua ou avenida"); Spacer(Modifier.height(9.dp)); AppField(number, { number = it }, "Numero da casa"); Spacer(Modifier.height(9.dp)); AppField(complement, { complement = it }, "Complemento (opcional)"); Spacer(Modifier.height(9.dp)); AppField(neighborhood, { neighborhood = it }, "Bairro"); Spacer(Modifier.height(9.dp)); AppField(city, { city = it }, "Cidade"); Spacer(Modifier.height(9.dp)); AppField(state, { state = it.uppercase().take(2) }, "UF"); Spacer(Modifier.height(9.dp)); AppField(reference, { reference = it }, "Ponto de referencia (opcional)") } }
            item { CheckoutSection("Pagamento na ${if (fulfillment == "DELIVERY") "entrega" else "retirada"}") { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { ChoiceChip("Cartao", payment == "CARD_ON_DELIVERY") { payment = "CARD_ON_DELIVERY" }; ChoiceChip("Dinheiro", payment == "CASH") { payment = "CASH" } } } }
            item { CheckoutSection("Observacoes") { AppField(notes, { notes = it }, "Ex.: substituir somente por marca similar") } }
            item { CheckoutSection("Resumo") { SummaryRow("Produtos", viewModel.subtotal); SummaryRow("Taxa de entrega", deliveryFee); if (deliveryFee == 0.0 && fulfillment == "DELIVERY" && (store?.freeDeliveryAbove ?: 0.0) > 0) Text("Frete gratis aplicado", color = Color(0xFF07845C), fontWeight = FontWeight.Bold, fontSize = 11.sp) } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CheckoutScreen(viewModel: AiMercViewModel, back: () -> Unit, success: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(viewModel.customerName) }; var phone by rememberSaveable { mutableStateOf(viewModel.customerPhone) }; var address by rememberSaveable { mutableStateOf(viewModel.customerAddress) }; var notes by rememberSaveable { mutableStateOf("") }; var fulfillment by rememberSaveable { mutableStateOf("DELIVERY") }; var payment by rememberSaveable { mutableStateOf("CARD_ON_DELIVERY") }
    val store = viewModel.catalog?.store
    val deliveryFee = if (fulfillment == "DELIVERY") store?.deliveryFee ?: 0.0 else 0.0
    val valid = name.isNotBlank() && phone.isNotBlank() && (fulfillment == "PICKUP" || address.isNotBlank())
    Scaffold(containerColor = Canvas, topBar = { SimpleTopBar("Finalizar compra", back) }, bottomBar = { Column(Modifier.background(Color.White).navigationBarsPadding().padding(16.dp)) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Total", color = Muted); Text(currency.format(viewModel.subtotal + deliveryFee), fontWeight = FontWeight.Black, fontSize = 21.sp) }; Button(onClick = { viewModel.submit(CheckoutData(name, phone, address, fulfillment, payment, null, notes), success) }, enabled = valid && !viewModel.submitting, modifier = Modifier.fillMaxWidth().height(52.dp).padding(top = 7.dp), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.buttonColors(containerColor = Mint, contentColor = Forest)) { Text(if (viewModel.submitting) "Enviando pedido..." else "Confirmar pedido", fontWeight = FontWeight.Black) } } }) { padding ->
        LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            item { CheckoutSection("Como voce quer receber?") { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { ChoiceChip("Entrega", fulfillment == "DELIVERY") { fulfillment = "DELIVERY" }; ChoiceChip("Retirada", fulfillment == "PICKUP") { fulfillment = "PICKUP" } } } }
            item { CheckoutSection("Seus dados") { AppField(name, { name = it }, "Nome completo"); Spacer(Modifier.height(9.dp)); AppField(phone, { phone = it }, "WhatsApp", KeyboardType.Phone); if (fulfillment == "DELIVERY") { Spacer(Modifier.height(9.dp)); AppField(address, { address = it }, "Endereco completo") } } }
            item { CheckoutSection("Pagamento na ${if (fulfillment == "DELIVERY") "entrega" else "retirada"}") { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { ChoiceChip("Cartao", payment == "CARD_ON_DELIVERY") { payment = "CARD_ON_DELIVERY" }; ChoiceChip("Dinheiro", payment == "CASH") { payment = "CASH" } } } }
            item { CheckoutSection("Observacoes") { AppField(notes, { notes = it }, "Ex.: substituir somente por marca similar") } }
            item { CheckoutSection("Resumo") { SummaryRow("Produtos", viewModel.subtotal); SummaryRow("Taxa de entrega", deliveryFee); Row(Modifier.fillMaxWidth().padding(top = 9.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text("Pagamento", color = Muted); Text(if (payment == "CASH") "Dinheiro" else "Cartao na entrega", fontWeight = FontWeight.Bold) } } }
        }
    }
}

@Composable
private fun CheckoutSection(title: String, content: @Composable () -> Unit) { Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(17.dp)).background(Color.White).padding(16.dp)) { Text(title, fontWeight = FontWeight.Black, fontSize = 16.sp); Spacer(Modifier.height(12.dp)); content() } }
@Composable
private fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit) { FilterChip(selected = selected, onClick = onClick, label = { Text(label, fontWeight = FontWeight.Bold) }, leadingIcon = if (selected) {{ Icon(Icons.Default.Check, null, Modifier.size(16.dp)) }} else null, colors = FilterChipDefaults.filterChipColors(selectedContainerColor = MintSoft, selectedLabelColor = Forest), border = FilterChipDefaults.filterChipBorder(enabled = true, selected = selected, borderColor = Line, selectedBorderColor = Mint)) }
@Composable
private fun AppField(value: String, change: (String) -> Unit, label: String, keyboard: KeyboardType = KeyboardType.Text) { OutlinedTextField(value = value, onValueChange = change, label = { Text(label) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = keyboard), shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth(), colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(focusedBorderColor = Forest, cursorColor = Forest)) }
@Composable
private fun SummaryRow(label: String, value: Double) { Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = Muted); Text(currency.format(value), fontWeight = FontWeight.Bold) } }

@Composable
private fun SuccessScreen(orderId: String, finish: () -> Unit) { Column(Modifier.fillMaxSize().background(Forest).statusBarsPadding().navigationBarsPadding().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Box(Modifier.size(90.dp).clip(CircleShape).background(Mint), contentAlignment = Alignment.Center) { Icon(Icons.Default.Check, null, tint = Forest, modifier = Modifier.size(46.dp)) }; Spacer(Modifier.height(26.dp)); Text("Pedido confirmado!", color = Color.White, fontSize = 31.sp, lineHeight = 34.sp, fontWeight = FontWeight.Black); Spacer(Modifier.height(9.dp)); Text("#$orderId", color = Mint, fontWeight = FontWeight.Black); Spacer(Modifier.height(12.dp)); Text("O supermercado ja recebeu seu pedido. Voce podera acompanhar cada etapa por aqui.", color = Color(0xFFB9D4CA), lineHeight = 21.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center); Spacer(Modifier.height(34.dp)); Button(onClick = finish, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.buttonColors(containerColor = Mint, contentColor = Forest)) { Text("Voltar para o inicio", fontWeight = FontWeight.Black) } }
}

@Composable
private fun SimpleTopBar(title: String, back: () -> Unit) { Row(Modifier.fillMaxWidth().background(Color.White).statusBarsPadding().padding(10.dp), verticalAlignment = Alignment.CenterVertically) { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Voltar") }; Text(title, fontWeight = FontWeight.Black, fontSize = 20.sp, modifier = Modifier.padding(start = 5.dp)) } }
@Composable
private fun LoadingScreen(branded: Boolean = false) {
    val background = if (branded) Forest else Canvas
    Box(Modifier.fillMaxSize().background(background), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (branded) {
                Image(
                    painter = painterResource(R.drawable.queiroz_splash_transparent),
                    contentDescription = "Mercadinho Queiroz",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(230.dp)
                )
                Spacer(Modifier.height(24.dp))
            }
            CircularProgressIndicator(color = Mint)
            Spacer(Modifier.height(14.dp))
            Text("Montando sua prateleira...", color = if (branded) Color.White else Muted)
        }
    }
}
@Composable
private fun ErrorScreen(retry: () -> Unit) { Column(Modifier.fillMaxSize().background(Canvas).padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Icon(Icons.Default.Refresh, null, tint = Forest, modifier = Modifier.size(46.dp)); Spacer(Modifier.height(15.dp)); Text("Nao foi possivel abrir o mercado", fontWeight = FontWeight.Black, fontSize = 20.sp); Text("Confira sua conexao e tente novamente.", color = Muted, modifier = Modifier.padding(vertical = 8.dp)); Button(onClick = retry, colors = ButtonDefaults.buttonColors(containerColor = Mint, contentColor = Forest)) { Text("Tentar novamente", fontWeight = FontWeight.Bold) } } }
@Composable
private fun PlaceholderScreen(title: String, text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier) { Column(modifier.fillMaxSize().background(Canvas).padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Box(Modifier.size(70.dp).clip(CircleShape).background(MintSoft), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Forest, modifier = Modifier.size(32.dp)) }; Spacer(Modifier.height(18.dp)); Text(title, fontWeight = FontWeight.Black, fontSize = 23.sp); Text(text, color = Muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 8.dp)) } }
