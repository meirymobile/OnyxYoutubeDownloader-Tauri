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

func findElements(element: AXUIElement, depth: Int = 0) {
    if depth > 15 { return }
    let label = getLabel(element) ?? ""
    if label.contains("Deck") || label.contains("Title") || label.contains("Artist") {
        let val = getValue(element) ?? getTitle(element) ?? ""
        print("Depth \(depth): [\(label)] = \(val)")
    }
    
    for child in getChildren(element) {
        findElements(element: child, depth: depth + 1)
    }
}

let apps = NSWorkspace.shared.runningApplications
guard let djay = apps.first(where: {
    $0.bundleIdentifier?.contains("algoriddim") == true ||
    $0.localizedName?.contains("djay") == true
}) else {
    print("djay Pro not running")
    exit(1)
}

let pid = djay.processIdentifier
let app = AXUIElementCreateApplication(pid)

print("Starting dump...")
findElements(element: app)
print("Done.")

