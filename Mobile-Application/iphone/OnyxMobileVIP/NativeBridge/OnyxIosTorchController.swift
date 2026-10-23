import AVFoundation
import Foundation

/**
 * Onyx DJ™ iOS Hardware Torch Controller
 * Direct hardware LED control using AVCaptureDevice for strobe sync.
 */
public final class OnyxIosTorchController {
    public static let shared = OnyxIosTorchController()

    private let device: AVCaptureDevice? = {
        if #available(iOS 10.0, *) {
            return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
        } else {
            return AVCaptureDevice.default(for: .video)
        }
    }()

    private init() {}

    public func setTorchLevel(_ level: Float) {
        guard let device = device, device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            if level > 0 {
                let clampedLevel = min(max(level, 0.01), 1.0)
                try device.setTorchModeOn(level: clampedLevel)
            } else {
                device.torchMode = .off
            }
            device.unlockForConfiguration()
        } catch {
            print("[OnyxTorch] Failed to set torch mode: \(error)")
        }
    }

    public func triggerStrobeFlash(durationMs: Double) {
        setTorchLevel(1.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + (durationMs / 1000.0)) {
            self.setTorchLevel(0.0)
        }
    }
}
