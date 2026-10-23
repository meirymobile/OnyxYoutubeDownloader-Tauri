import ActivityKit
import SwiftUI
import WidgetKit

/**
 * Onyx DJ™ Dynamic Island & Lock Screen Live Activity Widget
 */
struct OnyxDynamicIslandWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OnyxPartyAttributes.self) { context in
            // Lock Screen Banner UI
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    ZStack {
                        Circle()
                            .fill(Color(red: 0.1, green: 0.05, blue: 0.15))
                            .frame(width: 32, height: 32)
                        Circle()
                            .fill(Color(red: 0.96, green: 0.62, blue: 0.04))
                            .frame(width: 12, height: 12)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.djNames)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                        Text(context.attributes.eventName)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Color.gray)
                    }
                    Spacer()
                    if context.state.isStrobeActive {
                        HStack(spacing: 4) {
                            Circle().fill(Color.yellow).frame(width: 6, height: 6)
                            Text("מופע סטרוב ⚡")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.yellow)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.yellow.opacity(0.15))
                        .cornerRadius(12)
                    } else {
                        Text("\(context.state.bpm) BPM")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
                    }
                }

                Divider().background(Color.white.opacity(0.15))

                HStack {
                    Image(systemName: "music.note")
                        .foregroundColor(Color(red: 0.92, green: 0.28, blue: 0.6))
                    Text(context.state.currentTrackTitle)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }

                if !context.state.stageMessage.isEmpty {
                    Text(context.state.stageMessage)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Color(red: 0.02, green: 0.71, blue: 0.83))
                }
            }
            .padding(14)
            .background(Color(red: 0.04, green: 0.01, blue: 0.07))
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded View
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "opticaldisc.fill")
                            .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
                        Text(context.attributes.djNames)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.bpm) BPM")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: "music.note")
                                .foregroundColor(Color(red: 0.92, green: 0.28, blue: 0.6))
                            Text(context.state.currentTrackTitle)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                                .lineLimit(1)
                        }
                        if context.state.isUserSongNext {
                            Text("השיר שלך עולה מיד לרחבה! 👑")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(Color(red: 0.06, green: 0.72, blue: 0.51))
                        }
                    }
                }
            } compactLeading: {
                // Compact Leading: Mini Vinyl Icon
                Image(systemName: "opticaldisc.fill")
                    .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
            } compactTrailing: {
                // Compact Trailing: BPM Counter
                Text("\(context.state.bpm)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: "opticaldisc.fill")
                    .foregroundColor(Color(red: 0.96, green: 0.62, blue: 0.04))
            }
        }
    }
}
