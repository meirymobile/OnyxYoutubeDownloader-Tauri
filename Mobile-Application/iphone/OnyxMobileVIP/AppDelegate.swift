import AVFoundation
import UIKit

/**
 * Onyx DJ™ iOS App Delegate
 */
class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Keep screen awake while app is open
        UIApplication.shared.isIdleTimerDisabled = true

        // Configure audio session for background sync
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[OnyxAppDelegate] AudioSession setup error: \(error)")
        }

        return true
    }

    func applicationWillTerminate(_ application: UIApplication) {
        OnyxLiveActivityManager.shared.endActivity()
    }
}
