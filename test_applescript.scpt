tell application "System Events"
    set djay to first application process whose name is "djay Pro"
    return name of djay
end tell
