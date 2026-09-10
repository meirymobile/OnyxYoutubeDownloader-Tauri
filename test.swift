import Cocoa
import ApplicationServices
import Foundation

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
    return getAttr(element, kAXValueAttribute as String) as? String
}

func getTitle(_ element: AXUIElement) -> String? {
    return getAttr(element, kAXTitleAttribute as String) as? String
}

func findLabeledElements(_ element: AXUIElement, prefix: String, depth: Int = 0) -> [String: String] {
    var results: [String: String] = [:]
    let label = getLabel(element) ?? ""
    let value = getValue(element) ?? getTitle(element) ?? ""
    
    if !label.isEmpty && label.contains(prefix) && !value.isEmpty {
        results[label] = value
    }
    
    if depth < 6 {
        for child in getChildren(element) {
            let childResults = findLabeledElements(child, prefix: prefix, depth: depth + 1)
            results.merge(childResults) { _, new in new }
        }
    }
    return results
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

var value: AnyObject?
let result = AXUIElementCopyAttributeValue(app, kAXChildrenAttribute as CFString, &value)
if result == .cannotComplete || result == .apiDisabled {
    print("{\"error\": \"Accessibility API disabled for this process\"}")
    exit(1)
}

var decksOut: [[String: String]] = []

for deckNumber in 1...2 {
    let prefix = "Deck \(deckNumber)"
    let elements = findLabeledElements(app, prefix: prefix)
    
    var trackInfo: [String: String] = ["deck": "\(deckNumber)"]
    
    for (label, val) in elements {
        let lower = label.lowercased()
        if lower.starts(with: "title,") { trackInfo["title"] = val }
        else if lower.starts(with: "artist,") { trackInfo["artist"] = val }
        else if lower.starts(with: "play /") { trackInfo["is_playing"] = (val == "Active") ? "true" : "false" }
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

