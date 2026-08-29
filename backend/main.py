from fastapi import FastAPI, BackgroundTasks, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import argparse
import os
import uuid
import threading
import subprocess
import json
from pydantic import BaseModel
from typing import List, Optional

from downloader import get_video_info, download_video
from onyx_generator import generate_onyx_project
from metadata_enricher import enrich_and_rename_file
from splitter import split_album
from playlist_generator import create_dj_playlist_pack, extract_track_info_from_file

app = FastAPI(title="OnyxYouTubeDownloader Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import queue

# In-memory status store and managed Demucs Queue
DOWNLOAD_JOBS = {}
DEMUCS_QUEUE = queue.Queue()

def demucs_worker_loop():
    """Background worker thread that processes Demucs AI separation sequentially from queue."""
    while True:
        try:
            task = DEMUCS_QUEUE.get()
            if task is None:
                break
            
            job_id, track_paths, onyx_dir, keep_mp3 = task
            os.makedirs(onyx_dir, exist_ok=True)
            
            def on_progress(d):
                if isinstance(d, str) and job_id in DOWNLOAD_JOBS:
                    DOWNLOAD_JOBS[job_id]["demucs_progress"] = d
                    DOWNLOAD_JOBS[job_id]["progress"] = f"ONYX AI: {d}"

            for i, track in enumerate(track_paths):
                if job_id in DOWNLOAD_JOBS:
                    DOWNLOAD_JOBS[job_id]["progress"] = f"Running Demucs AI separation ({i+1}/{len(track_paths)})..."
                
                generate_onyx_project(track, onyx_dir, progress_callback=on_progress)
                
                if not keep_mp3 and os.path.exists(track):
                    try:
                        os.remove(track)
                    except:
                        pass
                        
            if job_id in DOWNLOAD_JOBS:
                DOWNLOAD_JOBS[job_id]["onyx_completed"] = True
                DOWNLOAD_JOBS[job_id]["onyx_dir"] = onyx_dir
                DOWNLOAD_JOBS[job_id]["progress"] = "Done! (MP3 & ONYX Stems ready)"
                
        except Exception as e:
            print(f"Demucs worker error: {e}")
        finally:
            DEMUCS_QUEUE.task_done()

# Start background worker thread for Demucs AI queue
threading.Thread(target=demucs_worker_loop, daemon=True).start()


class DownloadRequest(BaseModel):
    url: str
    formats: List[str] # e.g. ["mp3", "video", "onyx", "playlist"]
    audio_dir: Optional[str] = os.path.expanduser("~/Downloads/OnyxAudio")
    video_dir: Optional[str] = os.path.expanduser("~/Downloads/OnyxVideo")
    onyx_dir: Optional[str] = os.path.expanduser("~/Downloads/OnyxProjects")
    spotify: Optional[bool] = False
    bpm_prefix: Optional[bool] = False
    bpm_suffix: Optional[bool] = False
    trim_start: Optional[str] = None
    trim_end: Optional[str] = None
    auto_split: Optional[bool] = False
    playlist: Optional[bool] = False


def process_download(job_id: str, req: DownloadRequest):
    DOWNLOAD_JOBS[job_id] = {"status": "processing", "progress": "Starting download..."}
    
    # Expand ~ to actual home directory
    req.audio_dir = os.path.expanduser(req.audio_dir)
    req.video_dir = os.path.expanduser(req.video_dir)
    req.onyx_dir = os.path.expanduser(req.onyx_dir)
    
    def on_progress(d):
        if isinstance(d, dict) and d.get('status') == 'downloading':
            p = d.get('_percent_str', '').strip()
            if p:
                DOWNLOAD_JOBS[job_id]["progress"] = f"Downloading: {p}"
        elif isinstance(d, str):
            DOWNLOAD_JOBS[job_id]["progress"] = d

    try:
        video_downloaded_file = None
        if "video" in req.formats:
            os.makedirs(req.video_dir, exist_ok=True)
            DOWNLOAD_JOBS[job_id]["progress"] = "Starting High Quality Video download..."
            video_downloaded_file = download_video(req.url, req.video_dir, format_type="video", progress_callback=on_progress, trim_start=req.trim_start, trim_end=req.trim_end)
            
        is_playlist_requested = "playlist" in req.formats or req.playlist
        track_paths = []
        playlist_m3u8_file = None

        if "mp3" in req.formats or "onyx" in req.formats or is_playlist_requested:
            base_audio_dir = req.audio_dir if ("mp3" in req.formats or is_playlist_requested) else req.onyx_dir
            os.makedirs(base_audio_dir, exist_ok=True)
            DOWNLOAD_JOBS[job_id]["progress"] = "Starting Audio download..."
            audio_path = download_video(req.url, base_audio_dir, format_type="audio", progress_callback=on_progress, trim_start=req.trim_start, trim_end=req.trim_end)
            
            # Handle Auto-Split
            track_paths = [audio_path]
            if req.auto_split:
                DOWNLOAD_JOBS[job_id]["progress"] = "Fetching video info for chapters..."
                info_dict = get_video_info(req.url)
                track_paths = split_album(audio_path, info_dict, base_audio_dir, progress_callback=on_progress)
            
            # Enrich and rename if requested
            if "mp3" in req.formats or is_playlist_requested or (req.bpm_prefix or req.bpm_suffix or req.spotify):
                enriched_paths = []
                for track in track_paths:
                    enriched = enrich_and_rename_file(
                        track, 
                        spotify=req.spotify, 
                        bpm_prefix=req.bpm_prefix, 
                        bpm_suffix=req.bpm_suffix, 
                        progress_callback=on_progress
                    )
                    enriched_paths.append(enriched)
                track_paths = enriched_paths
            
            # Generate DJ Playlist Pack if requested
            if is_playlist_requested and track_paths:
                DOWNLOAD_JOBS[job_id]["progress"] = "Generating DJ Playlist Pack (.m3u8, .cue, .txt)..."
                target_dir = os.path.dirname(track_paths[0])
                album_name = os.path.basename(target_dir) if target_dir != base_audio_dir else os.path.splitext(os.path.basename(track_paths[0]))[0]
                
                tracks_info = []
                current_time = 0.0
                for track in track_paths:
                    t_info = extract_track_info_from_file(track, start_time=current_time)
                    tracks_info.append(t_info)
                    current_time += t_info.get("duration", 0.0)
                    
                pack_files = create_dj_playlist_pack(target_dir, album_name, tracks_info)
                playlist_m3u8_file = pack_files["m3u8"]
            
        # Complete primary download phase (Audio / Video / Playlist) immediately
        DOWNLOAD_JOBS[job_id]["status"] = "completed"
        
        # Track where primary file(s) ended up
        if playlist_m3u8_file:
            DOWNLOAD_JOBS[job_id]["result_dir"] = os.path.dirname(playlist_m3u8_file)
            DOWNLOAD_JOBS[job_id]["result_file"] = playlist_m3u8_file
        elif track_paths:
            DOWNLOAD_JOBS[job_id]["result_dir"] = os.path.dirname(track_paths[0])
            DOWNLOAD_JOBS[job_id]["result_file"] = track_paths[0]
        elif video_downloaded_file:
            DOWNLOAD_JOBS[job_id]["result_dir"] = req.video_dir
            DOWNLOAD_JOBS[job_id]["result_file"] = video_downloaded_file

        # Enqueue Demucs AI Stem Separation into managed background worker queue
        if "onyx" in req.formats and track_paths:
            keep_mp3 = ("mp3" in req.formats or is_playlist_requested)
            DEMUCS_QUEUE.put((job_id, track_paths, req.onyx_dir, keep_mp3))
            DOWNLOAD_JOBS[job_id]["progress"] = "Done! (Queued for ONYX Stems AI...)"
        else:
            DOWNLOAD_JOBS[job_id]["progress"] = "Done!"

    except Exception as e:
        DOWNLOAD_JOBS[job_id]["status"] = "error"
        DOWNLOAD_JOBS[job_id]["progress"] = str(e)



    except Exception as e:
        DOWNLOAD_JOBS[job_id]["status"] = "error"
        DOWNLOAD_JOBS[job_id]["progress"] = str(e)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running!"}

class OpenPathReq(BaseModel):
    path: str

@app.post("/api/open-path")
def open_path(req: OpenPathReq):
    try:
        import platform
        if platform.system() == "Darwin":
            subprocess.run(["open", req.path])
        elif platform.system() == "Windows":
            os.startfile(req.path)
        else:
            subprocess.run(["xdg-open", req.path])
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.get("/api/search")
def search_youtube(q: str):
    # yt-dlp search prefix
    search_url = f"ytsearch10:{q}"
    info = get_video_info(search_url)
    return info.get("entries", [])

@app.get("/api/info")
def get_info(url: str):
    return get_video_info(url)

@app.post("/api/download")
def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    DOWNLOAD_JOBS[job_id] = {"status": "queued", "progress": "Waiting..."}
    # Run in thread so it doesn't block async loop if background task does
    threading.Thread(target=process_download, args=(job_id, req), daemon=True).start()
    return {"job_id": job_id}

@app.get("/api/download/{job_id}")
def get_download_status(job_id: str):
    if job_id not in DOWNLOAD_JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return DOWNLOAD_JOBS[job_id]

@app.get("/api/check-updates")
def check_updates():
    try:
        import sys
        # Run pip list --outdated in json format using the exact python executable running the backend
        result = subprocess.run(
            [sys.executable, "-m", "pip", "list", "--outdated", "--format=json"], 
            capture_output=True, text=True, check=True
        )
        outdated_packages = json.loads(result.stdout)
        
        # Check if yt-dlp or demucs are in the list
        core_plugins = ["yt-dlp", "demucs"]
        updates_found = [pkg for pkg in outdated_packages if pkg["name"].lower() in core_plugins]
        
        return {
            "update_available": len(updates_found) > 0,
            "packages": updates_found
        }
    except Exception as e:
        print(f"Failed to check updates: {e}")
        return {"update_available": False, "packages": []}

@app.post("/api/update-plugins")
def update_plugins():
    try:
        import sys, importlib
        # Run pip upgrade synchronously in backend environment
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp", "demucs"],
            capture_output=True, text=True, check=True
        )
        # Reload yt_dlp module dynamically in memory so changes take effect immediately without restarting
        if "yt_dlp" in sys.modules:
            import yt_dlp
            importlib.reload(yt_dlp)
        return {"status": "success", "message": "Plugins updated and reloaded in memory successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # Mount React frontend if dist exists
    dist_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
    if os.path.exists(dist_dir):
        app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")
        
        @app.get("/")
        def serve_index():
            return FileResponse(os.path.join(dist_dir, "index.html"))
        
        @app.get("/{catchall:path}")
        def serve_catchall(catchall: str):
            # If not an API route, serve index.html for React Router compatibility
            if not catchall.startswith("api/"):
                filepath = os.path.join(dist_dir, catchall)
                if os.path.exists(filepath):
                    return FileResponse(filepath)
                return FileResponse(os.path.join(dist_dir, "index.html"))
            raise HTTPException(status_code=404)

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    
    # Auto-open browser when running standalone
    import threading
    import webbrowser
    import time
    def open_browser():
        time.sleep(1.5)
        webbrowser.open(f"http://127.0.0.1:{args.port}")
    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(app, host="127.0.0.1", port=args.port)
