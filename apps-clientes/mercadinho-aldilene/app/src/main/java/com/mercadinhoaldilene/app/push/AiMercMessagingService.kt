package com.mercadinhoaldilene.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class AiMercMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        PushNotifications.updateToken(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title
            ?: message.data["title"]
            ?: "Mercadinho Aldilene"
        val body = message.notification?.body
            ?: message.data["body"]
            ?: return
        val notificationId = message.data["campaignId"]?.hashCode()
            ?: message.messageId?.hashCode()
            ?: System.currentTimeMillis().toInt()
        PushNotifications.show(this, title, body, notificationId)
    }
}
