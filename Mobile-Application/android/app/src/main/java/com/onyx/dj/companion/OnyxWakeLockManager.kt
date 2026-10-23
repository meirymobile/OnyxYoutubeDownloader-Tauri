package com.onyx.dj.companion

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.view.WindowManager
import java.lang.ref.WeakReference

/**
 * Onyx DJ™ Wake Lock & Screen State Manager
 */
class OnyxWakeLockManager(private val context: Context) {

    private var wakeLock: PowerManager.WakeLock? = null
    private var activityRef: WeakReference<Activity>? = null

    fun attachActivity(activity: Activity) {
        activityRef = WeakReference(activity)
    }

    /**
     * Prevents screen from dimming/sleeping while on the dancefloor
     */
    fun setKeepScreenOn(enabled: Boolean) {
        activityRef?.get()?.runOnUiThread {
            val window = activityRef?.get()?.window ?: return@runOnUiThread
            if (enabled) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    /**
     * Acquires high-priority wake lock to wake up phone on song drop
     */
    fun turnScreenOn() {
        activityRef?.get()?.runOnUiThread {
            val activity = activityRef?.get() ?: return@runOnUiThread
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.setShowWhenLocked(true)
                activity.setTurnScreenOn(true)
            } else {
                @Suppress("DEPRECATION")
                activity.window.addFlags(
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                )
            }
        }

        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            @Suppress("DEPRECATION")
            val wl = pm?.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "onyx:StageWakeLock"
            )
            wl?.acquire(10000) // 10 seconds auto-release safety
        } catch (_: Exception) {}
    }
}
