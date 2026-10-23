import ActivityKit
import Foundation

/**
 * Onyx DJ™ Party Attributes for iOS Live Activities & Dynamic Island
 */
public struct OnyxPartyAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var currentTrackTitle: String
        public var bpm: Int
        public var isStrobeActive: Bool
        public var stageMessage: String
        public var isUserSongNext: Bool

        public init(
            currentTrackTitle: String,
            bpm: Int = 128,
            isStrobeActive: Bool = false,
            stageMessage: String = "",
            isUserSongNext: Bool = false
        ) {
            self.currentTrackTitle = currentTrackTitle
            self.bpm = bpm
            self.isStrobeActive = isStrobeActive
            self.stageMessage = stageMessage
            self.isUserSongNext = isUserSongNext
        }
    }

    public var eventName: String
    public var djNames: String

    public init(eventName: String = "Onyx Live Party", djNames: String = "DJ Shazz & DJ Sonic") {
        self.eventName = eventName
        self.djNames = djNames
    }
}
