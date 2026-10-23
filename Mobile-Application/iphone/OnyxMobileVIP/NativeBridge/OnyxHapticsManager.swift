import CoreHaptics
import Foundation
import UIKit

/**
 * Onyx DJ™ Haptic Bass Subwoofer Engine
 * Apple CoreHaptics low-frequency vibration.
 */
public final class OnyxHapticsManager {
    public static let shared = OnyxHapticsManager()
    private var engine: CHHapticEngine?

    private init() {
        setupEngine()
    }

    private func setupEngine() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        do {
            engine = try CHHapticEngine()
            try engine?.start()
            engine?.resetHandler = { [weak self] in
                do {
                    try self?.engine?.start()
                } catch {
                    print("[OnyxHaptics] Engine restart error: \(error)")
                }
            }
        } catch {
            print("[OnyxHaptics] Init error: \(error)")
        }
    }

    /**
     * Plays a deep sub-bass kick vibration
     */
    public func playBassKickHaptic() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics, let engine = engine else {
            DispatchQueue.main.async {
                let generator = UIImpactFeedbackGenerator(style: .heavy)
                generator.prepare()
                generator.impactOccurred()
            }
            return
        }

        // Deep bass haptic curve
        let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0)
        let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2) // Low sharpness = deep subwoofer bass
        let event = CHHapticEvent(eventType: .hapticTransient, parameters: [intensity, sharpness], relativeTime: 0)

        do {
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: 0)
        } catch {
            print("[OnyxHaptics] Failed to play kick: \(error)")
        }
    }
}
