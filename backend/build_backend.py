import subprocess
import os
import sys

def build():
    print("🚀 Compiling Python Backend into standalone executable...")
    
    output_dir = os.path.abspath("src-tauri/bin")
    os.makedirs(output_dir, exist_ok=True)
    
    target_name = "backend_server-aarch64-apple-darwin"
    
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--name", target_name,
        "--distpath", output_dir,
        "--paths", os.path.abspath("backend"),
        "--collect-all", "torch",
        "--collect-all", "torchaudio",
        "--collect-all", "demucs",
        "--hidden-import=pyaudioop",
        "--hidden-import=djay_monitor",
        "--hidden-import=shazam_extractor",
        "--hidden-import=downloader",
        "--hidden-import=metadata_enricher",
        "--hidden-import=playlist_generator",
                "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "backend/main.py"
    ]
    
    res = subprocess.run(cmd)
    if res.returncode == 0:
        print(f"✅ Backend successfully compiled to: {os.path.join(output_dir, target_name)}")
    else:
        print("❌ PyInstaller build failed!")
        sys.exit(1)

if __name__ == "__main__":
    build()
