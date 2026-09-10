import json

with open("src-tauri/tauri.conf.json", "r") as f:
    data = json.load(f)

# Remove from resources
if "djay_reader.dylib" in data["bundle"].get("resources", []):
    data["bundle"]["resources"].remove("djay_reader.dylib")

# Add to macOS frameworks
if "macOS" not in data["bundle"]:
    data["bundle"]["macOS"] = {}
data["bundle"]["macOS"]["frameworks"] = ["djay_reader.dylib"]

with open("src-tauri/tauri.conf.json", "w") as f:
    json.dump(data, f, indent=2)

print("Fixed tauri.conf.json")
