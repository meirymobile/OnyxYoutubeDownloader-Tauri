package com.onyx.dj.companion

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity

/**
 * Onyx DJ™ PartyFx Fullscreen Intent Activity
 * Wakes the screen over keyguard when the DJ activates a drop or crowd strobe.
 */
class PartyFxActivity : AppCompatActivity() {

    private lateinit var torchManager: OnyxTorchManager
    private lateinit var hapticManager: OnyxHapticManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Wake screen and show over keyguard
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        torchManager = OnyxTorchManager(this)
        hapticManager = OnyxHapticManager(this)

        // Strobe & rumble on entry
        torchManager.pulseStrobe(100)
        hapticManager.triggerDropRumble()

        // Finish after brief flash or return to MainActivity
        window.decorView.postDelayed({
            finish()
        }, 3000)
    }
}
