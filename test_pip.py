import sys
import runpy

print("Before path:", sys.path)
plugin_dir = "/tmp/onyx_plugins"

sys.argv = ["pip", "install", "--target", plugin_dir, "--upgrade", "yt-dlp"]
try:
    runpy.run_module("pip", run_name="__main__")
except SystemExit as e:
    print("Pip exited with code", e.code)

sys.path.insert(0, plugin_dir)
import yt_dlp
print("yt-dlp version:", yt_dlp.version.__version__)
