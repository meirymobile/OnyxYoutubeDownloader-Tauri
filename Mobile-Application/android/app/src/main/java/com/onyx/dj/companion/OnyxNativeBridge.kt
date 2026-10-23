package com.onyx.dj.companion

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Onyx DJ™ JavaScript Interface Native Bridge
 */
class OnyxNativeBridge(
    private val activity: Activity,
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
    fun triggerBassKick() {
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
