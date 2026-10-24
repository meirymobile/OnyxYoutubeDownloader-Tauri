package com.onyx.dj.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Onyx Foreground Service
 * Keeps connection active in background and listens to SSE broadcasts
 * to wake screen and trigger Crowd FX & announcements even when phone is idle/asleep.
 */
class OnyxForegroundService : Service() {

    companion object {
        private const val TAG = "OnyxForegroundService"
        const val CHANNEL_ID = "onyx_party_live"
        const val ALERTS_CHANNEL_ID = "onyx_dj_alerts"
        const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            val intent = Intent(context, OnyxForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, OnyxForegroundService::class.java)
            context.stopService(intent)
        }
    }

    private var isRunning = false
    private var sseThread: Thread? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        val notification = buildNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        startBackgroundSseListener()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        sseThread?.interrupt()
        sseThread = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

            val liveChannel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.channel_name_party),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.channel_desc_party)
                setShowBadge(false)
            }
            manager.createNotificationChannel(liveChannel)

            val alertChannel = NotificationChannel(
                ALERTS_CHANNEL_ID,
                "התראות מסיבה - Onyx DJ",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "הודעות חשובות מהדיג'יי וסטטוס בקשות שירים"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 150, 300)
            }
            manager.createNotificationChannel(alertChannel)
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_vinyl_logo)
            .setContentTitle(getString(R.string.service_title))
            .setContentText(getString(R.string.service_desc))
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun startBackgroundSseListener() {
        if (isRunning) return
        isRunning = true

        sseThread = thread(isDaemon = true, name = "OnyxSseBackgroundListener") {
            while (isRunning) {
                try {
                    val url = URL("https://ntfy.sh/onyx_broadcast_all/sse")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.setRequestProperty("Accept", "text/event-stream")
                    conn.connectTimeout = 15000
                    conn.readTimeout = 0 // Keep stream open

                    if (conn.responseCode == 200) {
                        val reader = BufferedReader(InputStreamReader(conn.inputStream))
                        var line: String? = null
                        while (isRunning && reader.readLine().also { line = it } != null) {
                            val cur = line?.trim() ?: continue
                            if (cur.startsWith("data:")) {
                                val jsonStr = cur.removePrefix("data:").trim()
                                handleIncomingSseMessage(jsonStr)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "SSE reconnect loop: ${e.message}")
                }

                try {
                    Thread.sleep(5000)
                } catch (_: InterruptedException) {
                    break
                }
            }
        }
    }

    private fun handleIncomingSseMessage(jsonStr: String) {
        try {
            val sseData = JSONObject(jsonStr)
            val eventType = sseData.optString("event")
            if (eventType == "message") {
                val rawMsg = sseData.optString("message")
                val payload = if (rawMsg.startsWith("{")) JSONObject(rawMsg) else JSONObject().apply {
                    put("message", rawMsg)
                }

                // Check if Crowd FX
                val mode = payload.optString("mode")
                if (mode.isNotEmpty()) {
                    handleBackgroundFx(payload)
                    return
                }

                // Check if DJ Announcement
                val title = payload.optString("title").ifEmpty { "📢 הודעה מיוחדת מה-DJ!" }
                val msg = payload.optString("message").ifEmpty { payload.optString("text") }
                if (msg.isNotEmpty()) {
                    postAnnouncementNotification(title, msg, rawMsg)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling incoming SSE data", e)
        }
    }

    private fun handleBackgroundFx(payload: JSONObject) {
        val mode = payload.optString("mode")
        if (mode != "off") {
            wakeScreen()
            launchMainActivity(payload.toString())
        }
    }

    private fun wakeScreen() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
            val wl = pm?.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "onyx:background_wake"
            )
            wl?.acquire(15000L)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to wake screen: ${e.message}")
        }
    }

    private fun launchMainActivity(payloadStr: String) {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("announcement_payload", payloadStr)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to launch MainActivity: ${e.message}")
        }
    }

    private fun postAnnouncementNotification(title: String, message: String, payloadStr: String) {
        wakeScreen()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

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

        val notif = NotificationCompat.Builder(this, ALERTS_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_vinyl_logo)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, false)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), notif)
    }
}
