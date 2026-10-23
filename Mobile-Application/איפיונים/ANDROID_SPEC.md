# אפיון טכני ייעודי: אפליקציית Android (Onyx Mobile)

> **פלטפורמה:** Android 9.0+ (API Level 28 עד API Level 35)  
> **שפת פיתוח מרכזית:** Kotlin / Java Native Bridge  
> **מיקום קבצי קוד מיועד:** `Mobile-Application/android/`

---

## 1. רכיבי הליבה של אנדרואיד (Android Core Architecture)

### 1.1 מנגנון הדלקת המסך מתוך נעילה (Keyguard & Screen Turn-On)
באנדרואיד קיימת תמיכה מלאה בהדלקת מסך פיזית גם כשהטלפון בכיס ונמצא במצב שינה (Doze Mode):

* **שימוש ב-Window Flags:**
  ```kotlin
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      keyguardManager.requestDismissKeyguard(this, null)
  } else {
      window.addFlags(
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
  }
  ```
* **הפעלת התראת FullScreen Intent בזמן הדרופ או קריאת ה-DJ:**
  הגדרת `NotificationCompat.Builder` עם ערוץ התראות ברמת עדיפות עליונה (`NotificationManager.IMPORTANCE_HIGH`):
  ```kotlin
  val fullScreenIntent = Intent(context, PartyFxActivity::class.java)
  val fullScreenPendingIntent = PendingIntent.getActivity(context, 0, fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  val notificationBuilder = NotificationCompat.Builder(context, CHANNEL_ID_STAGE_DROP)
      .setSmallIcon(R.drawable.ic_vinyl_logo)
      .setContentTitle("ה-DJ מתחיל מופע אורות ברחבה! ⚡")
      .setContentText("הטלפון שלך משתלב במופע הסטרוב!")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setFullScreenIntent(fullScreenPendingIntent, true)
  ```

---

### 1.2 שליטה חומרתית בפנס ה-LED האחורי (Hardware Camera Torch)
שימוש ב-`CameraManager` ללא פתיחת ממשק מצלמה מלא (Zero-Overhead):

```kotlin
class OnyxTorchManager(private val context: Context) {
    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private val cameraId: String? = cameraManager.cameraIdList.firstOrNull { id ->
        cameraManager.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
    }

    fun setTorch(enabled: Boolean) {
        cameraId?.let { id ->
            try {
                cameraManager.setTorchMode(id, enabled)
            } catch (e: Exception) {
                Log.w("OnyxTorch", "Failed to toggle torch: ${e.message}")
            }
        }
    }

    // מופע סטרוב מהיר מסונכרן לביט
    fun pulseStrobe(onDurationMs: Long) {
        setTorch(true)
        Handler(Looper.getMainLooper()).postDelayed({
            setTorch(false)
        }, onDurationMs)
    }
}
```

---

### 1.3 מנוע רטט באסים (Haptic Bass Engine)
שימוש במנוע ה-Vibrator המודרני של אנדרואיד (`VibrationEffect`):

```kotlin
fun triggerBassKickHaptic(context: Context) {
    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
        vibratorManager.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        // פולס רטט חד ועוצמתי של 45ms המדמה מכת קיק/באס
        val effect = VibrationEffect.createOneShot(45, VibrationEffect.DEFAULT_AMPLITUDE)
        vibrator.vibrate(effect)
    } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(45)
    }
}
```

---

### 1.4 שמירת שירות פעיל ברקע במהלך האירוע (Foreground Service)
כדי שהטלפון ימשיך להאזין לפקודות ה-DJ גם כשהמסך נכבה או כשהמשתמש שם את הטלפון בכיס, האפליקציה תפעיל **Foreground Service קל משקל**:

* **הודעת הסטטוס בשורת המשימות:**
  *"🎧 מחובר לרחבת Onyx DJ • מוכן להפעלת תאורה ובקשות שירים"*
* **אינו גוזל סוללה:** השירות רק מחזיק את חיבור ה-MQTT / WebSocket פתוח (מעביר פחות מ-1KB לדקה במצב המתנה).

---

## 2. הגדרות הרשאות נדרשות (`AndroidManifest.xml`)

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.onyx.dj.companion">

    <!-- הרשאות תקשורת (מאושרות אוטומטית בהתקנה) -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- הרשאות לשמירת מסך דולק והערה מנעילה -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />

    <!-- הרשאה להפעלת פנס ה-LED האחורי (סטרוב אמיתי) -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera.flash" android:required="false" />

    <!-- הרשאה לרטט באסים -->
    <uses-permission android:name="android.permission.VIBRATE" />

    <!-- הרשאת התראות (אנדרואיד 13+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

</manifest>
```
