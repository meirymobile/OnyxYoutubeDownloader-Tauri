import ActivityKit
import Foundation

/**
 * Onyx DJ™ ActivityKit Manager
 * Manages Dynamic Island & Lock Screen Live Activities during party.
 */
@available(iOS 16.2, *)
public final class OnyxLiveActivityManager {
    public static let shared = OnyxLiveActivityManager()

    private var currentActivity: Activity<OnyxPartyAttributes>?

    private init() {}

    public func startActivity(eventName: String, djNames: String, initialTrack: String, bpm: Int) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("[OnyxLiveActivity] Live Activities not authorized")
            return
        }

        let attributes = OnyxPartyAttributes(eventName: eventName, djNames: djNames)
        let initialContentState = OnyxPartyAttributes.ContentState(
            currentTrackTitle: initialTrack,
            bpm: bpm,
            isStrobeActive: false,
            stageMessage: "ברוכים הבאים לרחבה!",
            isUserSongNext: false
        )

        do {
            let activity = try Activity<OnyxPartyAttributes>.request(
                attributes: attributes,
                content: .init(state: initialContentState, staleDate: nil)
            )
            self.currentActivity = activity
            print("[OnyxLiveActivity] Started Activity ID: \(activity.id)")
        } catch {
            print("[OnyxLiveActivity] Failed to start activity: \(error)")
        }
    }

    public func updateActivity(
        trackTitle: String,
        bpm: Int,
        isStrobeActive: Bool,
        stageMessage: String,
        isUserSongNext: Bool = false
    ) {
        guard let activity = currentActivity else {
            startActivity(
                eventName: "Onyx Live Party",
                djNames: "DJ Shazz & DJ Sonic",
                initialTrack: trackTitle,
                bpm: bpm
            )
            return
        }

        let updatedContentState = OnyxPartyAttributes.ContentState(
            currentTrackTitle: trackTitle,
            bpm: bpm,
            isStrobeActive: isStrobeActive,
            stageMessage: stageMessage,
            isUserSongNext: isUserSongNext
        )

        Task {
            await activity.update(.init(state: updatedContentState, staleDate: nil))
        }
    }

    public func endActivity() {
        guard let activity = currentActivity else { return }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            self.currentActivity = nil
        }
    }
}
