import Foundation
let s = "test"
do {
    try s.write(toFile: "/tmp/djay_dump.txt", atomically: true, encoding: .utf8)
    print("Success")
} catch {
    print("Error: \(error)")
}
