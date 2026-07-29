package com.mercadinhoqueiroz.app.data

import com.mercadinhoqueiroz.app.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class AiMercRealtime(
    private val storeSlug: String,
    private val scope: CoroutineScope,
    private val onEvent: (JSONObject) -> Unit
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var socket: WebSocket? = null
    private var reconnectJob: Job? = null
    private val started = AtomicBoolean(false)
    private var orders: List<Pair<String, String>> = emptyList()
    private var backoffMs = 1_000L

    fun start() {
        if (!started.compareAndSet(false, true)) return
        connect()
    }

    fun stop() {
        started.set(false)
        reconnectJob?.cancel()
        reconnectJob = null
        socket?.close(1000, "bye")
        socket = null
    }

    fun updateTrackedOrders(references: List<Pair<String, String>>) {
        orders = references.take(50)
        val active = socket
        if (active != null) {
            subscribe(active)
        } else if (started.get()) {
            connect()
        }
    }

    private fun realtimeUrl(): String {
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
        return when {
            base.startsWith("https://") -> base.replaceFirst("https://", "wss://") + "/realtime"
            base.startsWith("http://") -> base.replaceFirst("http://", "ws://") + "/realtime"
            else -> "$base/realtime"
        }
    }

    private fun connect() {
        if (!started.get()) return
        socket?.cancel()
        val request = Request.Builder().url(realtimeUrl()).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                backoffMs = 1_000L
                subscribe(webSocket)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val json = runCatching { JSONObject(text) }.getOrNull() ?: return
                onEvent(json)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                scheduleReconnect()
            }
        })
    }

    private fun subscribe(webSocket: WebSocket) {
        val payload = JSONObject()
            .put("type", "subscribe")
            .put("storeSlug", storeSlug)
            .put("orders", JSONArray().apply {
                orders.forEach { (id, token) ->
                    put(JSONObject().put("id", id).put("token", token))
                }
            })
        webSocket.send(payload.toString())
    }

    private fun scheduleReconnect() {
        if (!started.get()) return
        reconnectJob?.cancel()
        reconnectJob = scope.launch(Dispatchers.IO) {
            val wait = backoffMs
            backoffMs = (backoffMs * 2).coerceAtMost(30_000L)
            delay(wait)
            if (isActive && started.get()) connect()
        }
    }
}
