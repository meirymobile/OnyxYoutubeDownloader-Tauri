import Cocoa
import ApplicationServices
import Foundation

// Helper to request accessibility if not trusted
func ensureAccessibility() -> Bool {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true]
    return AXIsProcessTrustedWithOptions(options as CFDictionary)
}

func getAttr(_ element: AXUIElement, _ attr: String) -> AnyObject? {
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, attr as CFString, &value)
    return result == .success ? value : nil
}

func getChildren(_ element: AXUIElement) -> [AXUIElement] {
    guard let children = getAttr(element, kAXChildrenAttribute as String) as? [AXUIElement] else { return [] }
    return children
}

func getLabel(_ element: AXUIElement) -> String? {
    return getAttr(element, kAXDescriptionAttribute as String) as? String
}

func getValue(_ element: AXUIElement) -> String? {
    let raw = getAttr(element, kAXValueAttribute as String)
    if let str = raw as? String {
        return str
    }
    if let num = raw as? NSNumber {
        return num.stringValue
    }
    return nil
}

func getTitle(_ element: AXUIElement) -> String? {
    return getAttr(element, kAXTitleAttribute as String) as? String
}

func getRole(_ element: AXUIElement) -> String {
    return (getAttr(element, kAXRoleAttribute as String) as? String) ?? ""
}

func findDecksGroup(_ element: AXUIElement, depth: Int = 0) -> AXUIElement? {
    if depth > 3 { return nil }
    for child in getChildren(element) {
        let label = getLabel(child) ?? ""
        if label == "Decks" || label.contains("Decks") {
            return child
        }
        if let found = findDecksGroup(child, depth: depth + 1) {
            return found
        }
    }
    return nil
}

func findLabeledElements(_ element: AXUIElement, depth: Int = 0) -> [String: String] {
    var results: [String: String] = [:]
    let role = getRole(element)
    if role == "AXTable" || role == "AXOutline" || role == "AXList" || role == "AXScrollArea" {
        let label = getLabel(element) ?? ""
        if !label.contains("Deck") && !label.contains("Mixer") {
            return results
        }
    }
    let label = getLabel(element) ?? ""
    let value = getValue(element) ?? getTitle(element) ?? ""
    
    if !label.isEmpty && !value.isEmpty {
        results[label] = value
    }
    
    if depth < 4 {
        for child in getChildren(element) {
            let childResults = findLabeledElements(child, depth: depth + 1)
            results.merge(childResults) { _, new in new }
        }
    }
    return results
}

func main() {
    if !ensureAccessibility() {
        print("{\"error\": \"Accessibility permission not granted. A prompt has been shown. Please grant permission in System Settings.\"}")
        exit(1)
    }
    
    let apps = NSWorkspace.shared.runningApplications
    guard let djay = apps.first(where: {
        $0.bundleIdentifier?.contains("algoriddim") == true ||
        $0.localizedName?.contains("djay") == true
    }) else {
        print("{\"error\": \"djay Pro is not running\"}")
        exit(1)
    }
    
    let pid = djay.processIdentifier
    let app = AXUIElementCreateApplication(pid)
    
    // Check if permission actually works
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(app, kAXChildrenAttribute as CFString, &value)
    if result == .cannotComplete || result == .apiDisabled {
        print("{\"error\": \"Accessibility API disabled for this process\"}")
        exit(1)
    }
    
    let target = findDecksGroup(app) ?? app
    let elements = findLabeledElements(target, depth: 0)
    
    var decksOut: [[String: String]] = []
    
    for deckNumber in 1...2 {
        let prefix = "Deck \(deckNumber)"
        var trackInfo: [String: String] = ["deck": "\(deckNumber)"]
        var lineVolumeFound: String? = nil
        var fallbackVolume: String? = nil
        
        for (label, val) in elements where label.contains(prefix) {
            let lower = label.lowercased()
            if lower.starts(with: "title,") { 
                trackInfo["title"] = val 
            } else if lower.starts(with: "artist,") { 
                trackInfo["artist"] = val 
            } else if lower.starts(with: "play /") { 
                trackInfo["is_playing"] = (val == "Active") ? "true" : "false" 
            } else if lower.contains("line volume") {
                lineVolumeFound = val
            } else if (lower.contains("volume") || lower.contains("fader")) &&
                      !lower.contains("neural mix") &&
                      !lower.contains("crossfader") &&
                      !lower.contains("meter") &&
                      !lower.contains("level") &&
                      !lower.contains("headphone") &&
                      !lower.contains("cue") &&
                      !lower.contains("gain") {
                fallbackVolume = val
            }
        }
        
        if let lineVol = lineVolumeFound {
            trackInfo["volume"] = lineVol
        } else if let fbVol = fallbackVolume {
            trackInfo["volume"] = fbVol
        }
        
        if trackInfo["title"] != nil {
            decksOut.append(trackInfo)
        }
    }
    
    let output: [String: Any] = ["decks": decksOut]
    
    if let jsonData = try? JSONSerialization.data(withJSONObject: output, options: []),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
}

main()
