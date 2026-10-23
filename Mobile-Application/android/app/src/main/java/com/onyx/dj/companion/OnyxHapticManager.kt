package com.onyx.dj.companion

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * Onyx DJ™ Haptic Bass Manager
 * Generates low-frequency tactical subwoofer kicks in guest's hand or pocket.
 */
class OnyxHapticManager(private val context: Context) {

    private val tag = "OnyxHaptic"

    private val vibrator: Vibrator? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vibratorManager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    /**
     * Triggers a punchy 45ms sub-bass kick vibration
     */
    fun triggerBassKick() {
        val vib = vibrator ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createOneShot(45, VibrationEffect.DEFAULT_AMPLITUDE)
                vib.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(45)
            }
        } catch (e: Exception) {
            Log.w(tag, "Failed to vibrate: ${e.message}")
        }
    }

    /**
     * Drop countdown double-pulse
     */
    fun triggerDropRumble() {
        val vib = vibrator ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val timings = longArrayOf(0, 60, 40, 80)
                val amplitudes = intArrayOf(0, 200, 0, 255)
                val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
                vib.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(120)
            }
        } catch (e: Exception) {
            Log.w(tag, "Failed to rumble: ${e.message}")
        }
    }
}
