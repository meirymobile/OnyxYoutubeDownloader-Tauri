package com.onyx.dj.companion

import android.Manifest
import android.annotation.SuppressLint
import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Onyx DJ™ Companion Main Activity
 * Full lifecycle & hardware management for VIP event experience.
 */
class MainActivity : AppCompatActivity() {

    lateinit var webView: WebView
        private set
    lateinit var torchManager: OnyxTorchManager
        private set
    lateinit var hapticManager: OnyxHapticManager
        private set
    lateinit var wakeLockManager: OnyxWakeLockManager
        private set

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
            filePathCallback?.onReceiveValue(uris)
        } else {
            filePathCallback?.onReceiveValue(null)
        }
        filePathCallback = null
    }

    val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val cameraGranted = grants[Manifest.permission.CAMERA] == true
        runOnUiThread {
            pendingWebPermissionRequest?.let {
                if (cameraGranted) it.grant(it.resources) else it.deny()
                pendingWebPermissionRequest = null
            }
            // Notify JavaScript that permissions have been updated
            notifyPermissionsUpdatedToWeb()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Make activity show when locked & turn screen on
        configureWindowAwakeProperties()

        // Initialize Managers
        torchManager = OnyxTorchManager(this)
        hapticManager = OnyxHapticManager(this)
        wakeLockManager = OnyxWakeLockManager(this).apply {
            attachActivity(this@MainActivity)
        }

        // Initialize WebView
        webView = WebView(this)
        setContentView(webView)

        configureWebView()

        // Proactively request all party permissions on launch
        checkAndRequestPartyPermissions(forcePrompt = true)

        // Start Foreground Service to maintain connectivity
        OnyxForegroundService.start(this)

        // Auto-subscribe to Firebase Cloud Messaging announcements
        OnyxFirebaseMessagingService.subscribeToTopics()

        // Load bundled VIP application
        val initialUrl = parseDeepLinkOrLocalAsset(intent)
        webView.loadUrl(initialUrl)
    }

    override fun onResume() {
        super.onResume()
        configureWindowAwakeProperties()
        OnyxFirebaseMessagingService.subscribeToTopics()
        // Re-check permissions and notify WebView on every resume
        notifyPermissionsUpdatedToWeb()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        configureWindowAwakeProperties()
        intent?.getStringExtra("announcement_payload")?.let { payloadJson ->
            runOnUiThread {
                val js = "if (window.handleDjAnnouncement) { window.handleDjAnnouncement($payloadJson); }"
                webView.evaluateJavascript(js, null)
            }
        }
    }

    private fun configureWindowAwakeProperties() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            km?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun configureWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.setGeolocationEnabled(true)

        webView.setBackgroundColor(0xFF07020D.toInt())

        // Register Native JavaScript Bridge
        webView.addJavascriptInterface(
            OnyxNativeBridge(this, torchManager, hapticManager, wakeLockManager),
            "OnyxNativeBridge"
        )

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                notifyPermissionsUpdatedToWeb()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                consoleMessage?.let {
                    android.util.Log.d("OnyxWebView", "${it.message()} -- From line ${it.lineNumber()} of ${it.sourceId()}")
                }
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread {
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                        pendingWebPermissionRequest = request
                        requestPermissionLauncher.launch(arrayOf(Manifest.permission.CAMERA))
                    } else {
                        request?.grant(request.resources)
                    }
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: android.webkit.GeolocationPermissions.Callback?
            ) {
                callback?.invoke(origin, true, false)
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "image/*"
                }
                fileChooserLauncher.launch(intent)
                return true
            }
        }
    }

    private fun parseDeepLinkOrLocalAsset(intent: Intent?): String {
        val data: Uri? = intent?.data
        val query = data?.query
        return if (!query.isNullOrEmpty()) {
            "file:///android_asset/www/index.html?$query"
        } else {
            "file:///android_asset/www/index.html"
        }
    }

    /**
     * List of all required party experience permissions
     */
    fun getMissingPermissions(): List<String> {
        val missing = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.CAMERA)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                missing.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        return missing
    }

    fun checkAndRequestPartyPermissions(forcePrompt: Boolean = false) {
        val missing = getMissingPermissions()
        if (missing.isNotEmpty() && forcePrompt) {
            requestPermissionLauncher.launch(missing.toTypedArray())
        }
    }

    fun notifyPermissionsUpdatedToWeb() {
        val camera = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val location = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val notifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else true
        val allGranted = camera && location && notifications

        val js = "javascript:(function(){ if(window.onNativePermissionsUpdate) window.onNativePermissionsUpdate({camera:$camera, location:$location, notifications:$notifications, allGranted:$allGranted}); })()"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    fun setFullScreen(enabled: Boolean) {
        runOnUiThread {
            WindowCompat.setDecorFitsSystemWindows(window, !enabled)
            val controller = WindowInsetsControllerCompat(window, window.decorView)
            if (enabled) {
                controller.hide(WindowInsetsCompat.Type.systemBars())
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    fun postSystemNotification(title: String, message: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val channelId = "onyx_dj_alerts"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "התראות מסיבה - Onyx DJ",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 150, 300)
                description = "הודעות חשובות מהדיג'יי וסטטוס בקשות שירים"
            }
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            (System.currentTimeMillis() % 100000).toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_vinyl_logo)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify((System.currentTimeMillis() % 100000).toInt(), notif)
    }

    fun bringToFront() {
        runOnUiThread {
            configureWindowAwakeProperties()
            wakeLockManager.turnScreenOn()
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            startActivity(intent)
        }
    }

    fun openAppSettings() {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", packageName, null)
            }
            startActivity(intent)
        } catch (_: Exception) {}
    }

    fun requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                }
            } catch (_: Exception) {}
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        torchManager.stopNativeStrobe()
        torchManager.setTorch(false)
    }
}
