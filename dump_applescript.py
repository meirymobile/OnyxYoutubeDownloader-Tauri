import subprocess

script = """
tell application "System Events"
    tell process "djay Pro"
        set dump to ""
        try
            set dump to dump & (name of every UI element of front window)
        end try
        return dump
    end tell
end tell
"""

res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
print(res.stdout)
