package com.onyx.dj.companion

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Onyx DJ™ Camera Torch Manager
 * Direct hardware LED control for high-precision beat strobes.
 */
class OnyxTorchManager(private val context: Context) {

    private val tag = "OnyxTorch"
    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private val flashCameraId: String? by lazy {
        try {
            cameraManager?.cameraIdList?.firstOrNull { id ->
                val chars = cameraManager.getCameraCharacteristics(id)
                val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                val facing = chars.get(CameraCharacteristics.LENS_FACING)
                hasFlash && facing == CameraCharacteristics.LENS_FACING_BACK
            } ?: cameraManager?.cameraIdList?.firstOrNull { id ->
                cameraManager.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }
        } catch (e: Exception) {
            Log.e(tag, "Failed to inspect camera characteristics", e)
            null
        }
    }

    private var isTorchOn = false
    private var isStrobeRunning = false
    private var strobeRunnable: Runnable? = null

    fun setTorch(enabled: Boolean) {
        val id = flashCameraId ?: return
        try {
            cameraManager?.setTorchMode(id, enabled)
            isTorchOn = enabled
        } catch (e: Exception) {
            Log.w(tag, "Failed to set torch mode to $enabled: ${e.message}")
        }
    }

    fun pulseStrobe(onDurationMs: Long = 45) {
        setTorch(true)
        mainHandler.postDelayed({
            if (!isStrobeRunning) {
                setTorch(false)
            }
        }, onDurationMs)
    }

    /**
     * High-Precision Native Hardware Strobe
     * Executes entirely on Android Main Looper / Handler thread.
     * Synchronized to epoch time and immune to WebView background timer throttling.
     */
    fun startNativeStrobe(bpm: Int) {
        stopNativeStrobe()
        if (flashCameraId == null) return

        isStrobeRunning = true
        val validBpm = if (bpm in 40..240) bpm else 128
        val beatMs = (60000L / validBpm).coerceAtLeast(60L)
        val flashDurationMs = (beatMs * 0.30).toLong().coerceIn(25L, 50L)

        strobeRunnable = object : Runnable {
            override fun run() {
                if (!isStrobeRunning) return

                // Pulse Flash On
                setTorch(true)

                // Schedule Turn Off
                mainHandler.postDelayed({
                    if (isStrobeRunning) {
                        setTorch(false)
                    }
                }, flashDurationMs)

                // Sync to epoch millisecond for multi-device sync
                val now = System.currentTimeMillis()
                val phase = now % beatMs
                val timeToNext = beatMs - phase
                val nextDelay = if (timeToNext < 15L) beatMs else timeToNext

                mainHandler.postDelayed(this, nextDelay)
            }
        }

        mainHandler.post(strobeRunnable!!)
        Log.i(tag, "Native hardware strobe started at $validBpm BPM (interval: ${beatMs}ms)")
    }

    fun stopNativeStrobe() {
        isStrobeRunning = false
        strobeRunnable?.let {
            mainHandler.removeCallbacks(it)
            strobeRunnable = null
        }
        setTorch(false)
        Log.i(tag, "Native hardware strobe stopped")
    }

    fun isFlashAvailable(): Boolean = flashCameraId != null
}
