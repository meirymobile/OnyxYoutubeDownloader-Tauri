package com.onyx.dj.companion

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.CalendarContract
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Onyx DJ™ JavaScript Interface Native Bridge
 */
class OnyxNativeBridge(
    private val activity: MainActivity,
    private val torchManager: OnyxTorchManager,
    private val hapticManager: OnyxHapticManager,
    private val wakeLockManager: OnyxWakeLockManager
) {
    private val tag = "OnyxNativeBridge"

    @JavascriptInterface
    fun setTorch(enabled: Boolean) {
        torchManager.setTorch(enabled)
    }

    @JavascriptInterface
    fun pulseStrobe(durationMs: Long) {
        torchManager.pulseStrobe(durationMs)
    }

    @JavascriptInterface
    fun startNativeStrobe(bpm: Int) {
        torchManager.startNativeStrobe(bpm)
    }

    @JavascriptInterface
    fun stopNativeStrobe() {
        torchManager.stopNativeStrobe()
    }

    @JavascriptInterface
    fun bringToFront() {
        activity.bringToFront()
    }

    @JavascriptInterface
    fun triggerBassKick() {
        hapticManager.triggerBassKick()
    }

    @JavascriptInterface
    fun triggerBassHaptic() {
        hapticManager.triggerBassKick()
    }

    @JavascriptInterface
    fun turnScreenOn() {
        wakeLockManager.turnScreenOn()
    }

    @JavascriptInterface
    fun setKeepScreenOn(enabled: Boolean) {
        wakeLockManager.setKeepScreenOn(enabled)
    }

    @JavascriptInterface
    fun enterFullScreen() {
        activity.setFullScreen(true)
    }

    @JavascriptInterface
    fun exitFullScreen() {
        activity.setFullScreen(false)
    }

    @JavascriptInterface
    fun showNotification(title: String, message: String) {
        activity.postSystemNotification(title, message)
    }

    @JavascriptInterface
    fun addToCalendar(title: String, description: String, location: String, startTimestamp: Long, endTimestamp: Long) {
        activity.runOnUiThread {
            try {
                val intent = Intent(Intent.ACTION_INSERT).apply {
                    data = CalendarContract.Events.CONTENT_URI
                    putExtra(CalendarContract.Events.TITLE, title)
                    putExtra(CalendarContract.Events.DESCRIPTION, description)
                    putExtra(CalendarContract.Events.EVENT_LOCATION, location)
                    if (startTimestamp > 0) putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startTimestamp)
                    if (endTimestamp > 0) putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endTimestamp)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                Log.e(tag, "Failed to launch calendar intent: ${e.message}")
            }
        }
    }

    @JavascriptInterface
    fun openEmailClient(email: String, subject: String, body: String) {
        activity.runOnUiThread {
            try {
                val intent = Intent(Intent.ACTION_SENDTO).apply {
                    data = Uri.parse("mailto:" + Uri.encode(email))
                    putExtra(Intent.EXTRA_SUBJECT, subject)
                    putExtra(Intent.EXTRA_TEXT, body)
                }
                activity.startActivity(intent)
            } catch (e: Exception) {
                Log.e(tag, "Failed to launch email client: ${e.message}")
            }
        }
    }

    @JavascriptInterface
    fun checkPermissionsStatus(): String {
        val camera = ContextCompat.checkSelfPermission(activity, android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val location = ContextCompat.checkSelfPermission(activity, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val notifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(activity, android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED
        } else true
        val allGranted = camera && location && notifications
        return """{"camera":$camera,"location":$location,"notifications":$notifications,"allGranted":$allGranted}"""
    }

    @JavascriptInterface
    fun checkCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            activity,
            android.Manifest.permission.CAMERA
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    @JavascriptInterface
    fun requestAllPermissions() {
        activity.runOnUiThread {
            activity.checkAndRequestPartyPermissions(forcePrompt = true)
        }
    }

    @JavascriptInterface
    fun requestCameraPermission() {
        activity.runOnUiThread {
            activity.checkAndRequestPartyPermissions(forcePrompt = true)
        }
    }

    @JavascriptInterface
    fun openAppSettings() {
        activity.runOnUiThread {
            activity.openAppSettings()
        }
    }

    @JavascriptInterface
    fun requestIgnoreBatteryOptimizations() {
        activity.runOnUiThread {
            activity.requestIgnoreBatteryOptimizations()
        }
    }

    @JavascriptInterface
    fun shareImage(base64Data: String, target: String) {
        try {
            val bitmap = decodeBase64(base64Data) ?: return
            val cacheFile = File(activity.cacheDir, "onyx_story_${System.currentTimeMillis()}.png")
            FileOutputStream(cacheFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }

            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                cacheFile
            )

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TEXT, "השיר וההקדשה שלי על הבמה של Onyx DJ! 🎵🔥")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            if (target == "whatsapp") {
                shareIntent.`package` = "com.whatsapp"
            }

            activity.startActivity(Intent.createChooser(shareIntent, "שתף כרטיס סטורי"))
        } catch (e: Exception) {
            Log.e(tag, "Failed to share image", e)
        }
    }

    @JavascriptInterface
    fun saveImageToGallery(base64Data: String): Boolean {
        return try {
            val bitmap = decodeBase64(base64Data) ?: return false
            val filename = "Onyx_VIP_${System.currentTimeMillis()}.png"
            var fos: OutputStream? = null

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/OnyxDJ")
                }
                val imageUri = activity.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                if (imageUri != null) {
                    fos = activity.contentResolver.openOutputStream(imageUri)
                }
            } else {
                val imagesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES).toString() + "/OnyxDJ"
                val file = File(imagesDir)
                if (!file.exists()) file.mkdirs()
                val image = File(file, filename)
                fos = FileOutputStream(image)
            }

            fos?.use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            true
        } catch (e: Exception) {
            Log.e(tag, "Failed to save image to gallery", e)
            false
        }
    }

    @JavascriptInterface
    fun getPlatformInfo(): String {
        return """{"platform":"android","sdk":${Build.VERSION.SDK_INT},"device":"${Build.MODEL}"}"""
    }

    private fun decodeBase64(data: String): Bitmap? {
        val cleanData = if (data.contains(",")) data.substringAfter(",") else data
        val decodedBytes = Base64.decode(cleanData, Base64.DEFAULT)
        return BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
    }
}
