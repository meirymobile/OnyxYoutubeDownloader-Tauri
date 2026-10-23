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
            setTorch(false)
        }, onDurationMs)
    }

    fun isFlashAvailable(): Boolean = flashCameraId != null
}
