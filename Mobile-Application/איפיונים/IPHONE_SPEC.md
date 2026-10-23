# אפיון טכני ייעודי: אפליקציית iPhone / iOS (Onyx Mobile)

> **פלטפורמה:** iOS 16.0+ (מותאם ל-iOS 17 ו-iOS 18)  
> **שפת פיתוח מרכזית:** Swift 5.10+ / SwiftUI / ActivityKit  
> **מיקום קבצי קוד מיועד:** `Mobile-Application/iphone/`

---

## 1. רכיבי הליבה של iOS (Apple Native Architecture)

### 1.1 אי דינמי ופעילות חיה במסך הנעילה (Dynamic Island & Live Activities)
אחד הפיצ'רים המרשימים ביותר באייפון – המאפשר נוכחות חיה מתמדת של ה-DJ במסך הנעילה ובאי הדינמי:

* **הגדרת ActivityAttributes (ActivityKit):**
  ```swift
  import ActivityKit
  import WidgetKit
  import SwiftUI

  struct OnyxPartyAttributes: ActivityAttributes {
      public struct ContentState: Codable, Hashable {
          var currentTrackTitle: String
          var bpm: Int
          var isStrobeActive: Bool
          var stageMessage: String
          var isUserSongNext: Bool
      }
      var eventName: String
      var djNames: String
  }
  ```

* **תצוגת האי הדינמי (Dynamic Island Layout):**
  * **במצב מכווץ (Compact):**
    * צד שמאל: אייקון פטיפון ויניל מסתובב בזמן אמת.
    * צד ימין: ה-BPM הנוכחי (`128 BPM`) עם גל קול פועם.
  * **במצב מורחב (Expanded):**
    * מציג את שם השיר הנוכחי, ההקדשה החמה, וספירה לאחור לקראת הדרופ.
  * **במסך הנעילה (Lock Screen Banner):**
    * מציג באנר ניאון מרהיב: *"השיר שלך עולה בעוד 2 שירים! 🎵"* או *"מופע סטרוב פעיל כעת ברחבה"*.

---

### 1.2 שליטה חומרתית בפנס ה-LED של האייפון (Hardware Torch Control)
שימוש ב-`AVCaptureDevice` לקבלת פולסי סטרוב חדים ומדויקים של נורת הפלאש האחורית:

```swift
import AVFoundation

final class OnyxIosTorchController {
    static let shared = OnyxIosTorchController()
    private let device = AVCaptureDevice.default(for: .video)

    func setTorchLevel(_ level: Float) {
        guard let device = device, device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            if level > 0 {
                // תמיכה בהארה בעוצמה מקסימלית (1.0)
                try device.setTorchModeOn(level: min(max(level, 0.01), 1.0))
            } else {
                device.torchMode = .off
            }
            device.unlockForConfiguration()
        } catch {
            print("[OnyxTorch] Failed to set torch mode: \(error)")
        }
    }

    // פולס סטרוב סופר-חד עבור ביט
    func triggerStrobeFlash(durationMs: Double) {
        setTorchLevel(1.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + (durationMs / 1000.0)) {
            self.setTorchLevel(0.0)
        }
    }
}
```

---

### 1.3 מנוע רטט באסים מתקדם (Apple CoreHaptics)
ה-Taptic Engine של אפל מאפשר להשמיע "תדרי באס מורגשים" ישירות לכף היד:

```swift
import CoreHaptics

final class OnyxHapticsManager {
    static let shared = OnyxHapticsManager()
    private var engine: CHHapticEngine?

    init() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        do {
            engine = try CHHapticEngine()
            try engine?.start()
        } catch {
            print("[OnyxHaptics] Engine init error: \(error)")
        }
    }

    // רטט עמוק המדמה מכת קיק סאב-באס
    func playBassKickHaptic() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            return
        }

        let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0)
        let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2) // חדות נמוכה = תחושת באס עמוק
        let event = CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0)

        do {
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine?.makePlayer(with: pattern)
            try player?.start(atTime: 0)
        } catch {
            print("[OnyxHaptics] Failed to play kick: \(error)")
        }
    }
}
```

---

### 1.4 שמירת מסך דולק ב-100% (Zero Sleep On Stage)
ב-iOS קיימת שורת מערכת ישירה המבטיחה שהמסך לא ייכבה לעולם:
```swift
UIApplication.shared.isIdleTimerDisabled = true
```

---

### 1.5 הרחבה לשעוני Apple Watch (WatchKit Companion)
הרחבת אפליקציה קלה לשעוני אפל:
* השעון רוטט בפרק כף היד על כל פעימת קיק או לקראת דרופ.
* מסך השעון הופך למסך אור בצבע השיר שמתנגן ברחבה.
* האורח יכול להרים ידיים לרחבה כשהשעון מאיר ומסונכרן עם שאר האולם!

---

## 2. הגדרות הרשאות ו-Capabilities (`Info.plist`)

```xml
<key>NSCameraUsageDescription</key>
<string>האפליקציה זקוקה לגישה לפלאש המצלמה כדי להפעיל את מופע הסטרוב המסונכרן ברחבה.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>האפליקציה מאפשרת לך לבחור תמונה מהגלריה להקרנה על מסך הבמה יחד עם בקשת השיר שלך.</string>

<key>NSSupportsLiveActivities</key>
<true/>

<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
    <string>audio</string>
</array>
```
