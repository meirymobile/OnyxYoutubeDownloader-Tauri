import Foundation
import Photos
import UIKit
import WebKit

/**
 * Onyx DJ™ WebKit Script Message Handler
 * Receives JavaScript messages and routes to native iOS APIs.
 */
public final class OnyxScriptMessageHandler: NSObject, WKScriptMessageHandler {
    public weak var viewController: UIViewController?

    public func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "onyxNative", let dict = message.body as? [String: Any] else { return }
        guard let action = dict["action"] as? String else { return }

        switch action {
        case "setTorch":
            let level = (dict["level"] as? NSNumber)?.floatValue ?? 0.0
            OnyxIosTorchController.shared.setTorchLevel(level)

        case "triggerStrobe":
            let duration = (dict["durationMs"] as? NSNumber)?.doubleValue ?? 45.0
            OnyxIosTorchController.shared.triggerStrobeFlash(durationMs: duration)

        case "triggerBassHaptic":
            OnyxHapticsManager.shared.playBassKickHaptic()

        case "setIdleTimerDisabled":
            let disabled = dict["disabled"] as? Bool ?? false
            DispatchQueue.main.async {
                UIApplication.shared.isIdleTimerDisabled = disabled
            }

        case "updateLiveActivity":
            if let data = dict["data"] as? [String: Any] {
                let track = data["currentTrackTitle"] as? String ?? "Onyx Live Dance Floor"
                let bpm = (data["bpm"] as? NSNumber)?.intValue ?? 128
                let isStrobe = data["isStrobeActive"] as? Bool ?? false
                let stageMsg = data["stageMessage"] as? String ?? ""
                let isNext = data["isUserSongNext"] as? Bool ?? false

                OnyxLiveActivityManager.shared.updateActivity(
                    trackTitle: track,
                    bpm: bpm,
                    isStrobeActive: isStrobe,
                    stageMessage: stageMsg,
                    isUserSongNext: isNext
                )
            }

        case "shareImage":
            if let base64 = dict["base64Data"] as? String {
                let target = dict["target"] as? String ?? "system"
                handleShareImage(base64: base64, target: target)
            }

        case "saveImageToGallery":
            if let base64 = dict["base64Data"] as? String {
                saveImageToPhotos(base64: base64)
            }

        default:
            print("[OnyxScriptHandler] Unknown action: \(action)")
        }
    }

    private func handleShareImage(base64: String, target: String) {
        guard let image = decodeBase64Image(base64) else { return }

        DispatchQueue.main.async { [weak self] in
            guard let vc = self?.viewController else { return }

            if target == "whatsapp", let whatsappURL = URL(string: "whatsapp://app"), UIApplication.shared.canOpenURL(whatsappURL) {
                let activityVC = UIActivityViewController(activityItems: [image, "השיר וההקדשה שלי על הבמה של Onyx DJ! 🎵"], applicationActivities: nil)
                vc.present(activityVC, animated: true)
            } else {
                let activityVC = UIActivityViewController(activityItems: [image, "השיר שלי על הבמה של Onyx DJ! 🎵"], applicationActivities: nil)
                vc.present(activityVC, animated: true)
            }
        }
    }

    private func saveImageToPhotos(base64: String) {
        guard let image = decodeBase64Image(base64) else { return }
        UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
    }

    private func decodeBase64Image(_ base64String: String) -> UIImage? {
        let clean = base64String.components(separatedBy: ",").last ?? base64String
        guard let data = Data(base64Encoded: clean, options: .ignoreUnknownCharacters) else { return nil }
        return UIImage(data: data)
    }
}
