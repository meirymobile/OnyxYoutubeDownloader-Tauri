import SwiftUI

/**
 * Onyx DJ™ Companion iOS App Entry Point
 */
@main
struct OnyxMobileVIPApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
    }
}
