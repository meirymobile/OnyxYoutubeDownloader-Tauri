package com.onyx.dj.companion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.PowerManager
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Onyx DJ™ Firebase Cloud Messaging Service
 * Receives remote marketing messages, party announcements, and event invitations
 * even when the app is completely closed or device was rebooted.
 */
class OnyxFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "OnyxFCMService"
        const val FCM_CHANNEL_ID = "onyx_dj_fcm_announcements"

        fun subscribeToTopics(roomCode: String? = null) {
            try {
                FirebaseMessaging.getInstance().subscribeToTopic("all_guests")
                    .addOnCompleteListener { task ->
                        if (task.isSuccessful) {
                            Log.i(TAG, "Subscribed to FCM topic: all_guests")
                        }
                    }

                roomCode?.let { room ->
                    val clean = room.uppercase().trim().replace(Regex("[^A-Z0-9_-]"), "")
                    if (clean.isNotEmpty()) {
                        FirebaseMessaging.getInstance().subscribeToTopic("room_$clean")
                            .addOnCompleteListener { task ->
                                if (task.isSuccessful) {
                                    Log.i(TAG, "Subscribed to FCM room topic: room_$clean")
                                }
                            }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to subscribe to FCM topics: ${e.message}")
            }
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "New FCM Device Token: $token")
        // Save token locally
        val prefs = getSharedPreferences("onyx_fcm_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()
        // Auto subscribe to general audience topic
        subscribeToTopics()
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.i(TAG, "FCM Message received from: ${remoteMessage.from}")

        // 1. Wake screen up
        wakeScreen()

        // 2. Extract Data or Notification payload
        val data = remoteMessage.data
        val notification = remoteMessage.notification

        val title = data["title"] ?: notification?.title ?: "📢 הודעה מיוחדת מה-DJ!"
        val message = data["message"] ?: data["body"] ?: notification?.body ?: ""
        val imageUrl = data["image"] ?: notification?.imageUrl?.toString()
        val eventDate = data["eventDate"]
        val eventTime = data["eventTime"]
        val location = data["location"]
        val email = data["contactEmail"] ?: data["email"]

        // Build comprehensive JSON payload for the WebView
        val payloadObj = JSONObject().apply {
            put("type", "dj_announcement")
            put("title", title)
            put("message", message)
            if (!imageUrl.isNullOrEmpty()) put("image", imageUrl)
            if (!eventDate.isNullOrEmpty()) put("eventDate", eventDate)
            if (!eventTime.isNullOrEmpty()) put("eventTime", eventTime)
            if (!location.isNullOrEmpty()) put("location", location)
            if (!email.isNullOrEmpty()) put("contactEmail", email)
            put("timestamp", System.currentTimeMillis())
        }

        // Post high-priority notification to tray
        postFcmNotification(title, message, imageUrl, payloadObj.toString())
    }

    private fun wakeScreen() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
            val wl = pm?.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "onyx:fcm_wake"
            )
            wl?.acquire(10000L)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to wake screen via FCM: ${e.message}")
        }
    }

    private fun postFcmNotification(
        title: String,
        message: String,
        imageUrl: String?,
        payloadStr: String
    ) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                FCM_CHANNEL_ID,
                "הודעות והזמנות לאירועים - Onyx DJ",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "הודעות חשובות, הזמנות למסיבות ועדכונים מהדיג'יי"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 150, 300)
            }
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("announcement_payload", payloadStr)
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            (System.currentTimeMillis() % 100000).toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, FCM_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_vinyl_logo)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        // If an image flyer exists (URL or base64), download / decode it for BigPictureStyle
        val bitmap = loadFlyerBitmap(imageUrl)
        if (bitmap != null) {
            builder.setStyle(
                NotificationCompat.BigPictureStyle()
                    .bigPicture(bitmap)
                    .setBigContentTitle(title)
                    .setSummaryText(message)
            )
            builder.setLargeIcon(bitmap)
        } else {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(message))
        }

        manager.notify((System.currentTimeMillis() % 100000).toInt(), builder.build())
    }

    private fun loadFlyerBitmap(urlOrBase64: String?): Bitmap? {
        if (urlOrBase64.isNullOrEmpty()) return null
        return try {
            if (urlOrBase64.startsWith("data:image")) {
                val base64Data = urlOrBase64.substringAfter("base64,")
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            } else if (urlOrBase64.startsWith("http://") || urlOrBase64.startsWith("https://")) {
                val conn = URL(urlOrBase64).openConnection() as HttpURLConnection
                conn.doInput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.connect()
                BitmapFactory.decodeStream(conn.inputStream)
            } else null
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load flyer image for FCM notification: ${e.message}")
            null
        }
    }
}
