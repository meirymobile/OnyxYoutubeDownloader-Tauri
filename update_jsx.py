import re

with open("src/DjayCompanion.jsx", "r") as f:
    code = f.read()

if "get_djay_tracks_native" not in code:
    code = code.replace("const res = await fetch(`http://127.0.0.1:${port}/api/djay/current-track`);", "const resText = await invoke('get_djay_tracks_native');")
    code = code.replace("if (res.ok) {", "if (resText) {")
    code = code.replace("const data = await res.json();", "const data = JSON.parse(resText);")
    with open("src/DjayCompanion.jsx", "w") as f:
        f.write(code)
    print("jsx updated")
else:
    print("Already updated")
