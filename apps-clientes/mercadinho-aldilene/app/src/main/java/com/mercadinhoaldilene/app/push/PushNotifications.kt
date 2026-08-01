package com.mercadinhoaldilene.app.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.mercadinhoaldilene.app.MainActivity
import com.mercadinhoaldilene.app.R
import com.mercadinhoaldilene.app.data.AiMercApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

object PushNotifications {
    const val CHANNEL_ID = "aimerc_offers"

    private const val PREFS_NAME = "aimerc_push"
    private const val TOKEN_KEY = "fcm_token"
    private const val CUSTOMER_PHONE_KEY = "customer_phone"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun initialize(context: Context) {
        createChannel(context)
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            updateToken(context, token)
        }
    }

    fun updateToken(context: Context, token: String) {
        if (token.isBlank()) return
        val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        preferences.edit().putString(TOKEN_KEY, token).apply()
        registerSilently(token, preferences.getString(CUSTOMER_PHONE_KEY, "").orEmpty())
    }

    fun associateCustomer(context: Context, phone: String) {
        val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        preferences.edit().putString(CUSTOMER_PHONE_KEY, phone).apply()
        val token = preferences.getString(TOKEN_KEY, "").orEmpty()
        if (token.isNotBlank()) registerSilently(token, phone)
    }

    fun show(context: Context, title: String, body: String, notificationId: Int) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        createChannel(context)
        val openAppIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        NotificationManagerCompat.from(context).notify(notificationId, notification)
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Ofertas e novidades",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Ofertas, novidades e avisos do Mercadinho Aldilene"
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun registerSilently(token: String, phone: String) {
        scope.launch {
            runCatching { AiMercApi.registerPushDevice(token, phone) }
        }
    }
}
