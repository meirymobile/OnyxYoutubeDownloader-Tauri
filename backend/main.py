print("Hello from main.py")
import os
import sys

# Fix for PyInstaller on macOS breaking system ffmpeg with dyld errors
if getattr(sys, 'frozen', False) and 'DYLD_LIBRARY_PATH' in os.environ:
    del os.environ['DYLD_LIBRARY_PATH']

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Setup global logger
log_dir = Path.home() / "Documents" / "OnyxYoutubeDownloader" / "Logs"
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / "onyx.log"

logger = logging.getLogger("onyx")
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(log_file, maxBytes=1024*1024, backupCount=1)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - [BACKEND] - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

logger.info("Python Backend Server initializing...")

def ensure_ffmpeg():
    """Automatically installs ffmpeg and ffprobe if missing, placing them in ~/.onyx/bin"""
    import urllib.request
    import zipfile
    from pathlib import Path
    import stat

    bin_dir = Path.home() / ".onyx" / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    
    ffmpeg_path = bin_dir / "ffmpeg"
    ffprobe_path = bin_dir / "ffprobe"
    
    # Add to PATH so yt-dlp and demucs can find them
    os.environ["PATH"] += os.pathsep + str(bin_dir)
    
    if ffmpeg_path.exists() and ffprobe_path.exists():
        return
        
    print("Installing FFmpeg dependencies...")
    try:
        req_headers = {'User-Agent': 'Mozilla/5.0'}
        
        if not ffmpeg_path.exists():
            print("Downloading FFmpeg...")
            zip_path = bin_dir / "ffmpeg.zip"
            req = urllib.request.Request("https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip", headers=req_headers)
            with urllib.request.urlopen(req) as response, open(zip_path, 'wb') as out_file:
                out_file.write(response.read())
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(bin_dir)
            ffmpeg_path.chmod(ffmpeg_path.stat().st_mode | stat.S_IEXEC)
            zip_path.unlink()
            
        if not ffprobe_path.exists():
            print("Downloading FFprobe...")
            zip_path = bin_dir / "ffprobe.zip"
            req = urllib.request.Request("https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip", headers=req_headers)
            with urllib.request.urlopen(req) as response, open(zip_path, 'wb') as out_file:
                out_file.write(response.read())
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(bin_dir)
            ffprobe_path.chmod(ffprobe_path.stat().st_mode | stat.S_IEXEC)
            zip_path.unlink()
            
        print("FFmpeg and FFprobe installed successfully!")
    except Exception as e:
        print(f"Error downloading FFmpeg: {e}")

ensure_ffmpeg()


from fastapi import FastAPI, BackgroundTasks, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import argparse
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
from shazam_extractor import extract_and_download_shazam_set

import sys
import os
print("SYS.PATH:", sys.path)
if hasattr(sys, "_MEIPASS"):
    print("MEIPASS CONTENTS:", os.listdir(sys._MEIPASS))
    if "backend" in os.listdir(sys._MEIPASS):
        print("BACKEND CONTENTS:", os.listdir(os.path.join(sys._MEIPASS, "backend")))

from djay_monitor import djay_monitor_instance

app = FastAPI(title="OnyxYouTubeDownloader Backend")

@app.on_event("startup")
def startup_event():
    djay_monitor_instance.start()
    threading.Thread(target=demucs_worker_loop, daemon=True).start()

@app.on_event("shutdown")
def shutdown_event():
    djay_monitor_instance.stop()


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
                
                project_dir = generate_onyx_project(track, onyx_dir, progress_callback=on_progress)
                
                if not keep_mp3 and os.path.exists(track):
                    try:
                        os.remove(track)
                    except:
                        pass
                        
            if job_id in DOWNLOAD_JOBS:
                DOWNLOAD_JOBS[job_id]["onyx_completed"] = True
                DOWNLOAD_JOBS[job_id]["status"] = "completed"
                DOWNLOAD_JOBS[job_id]["result_dir"] = project_dir if 'project_dir' in locals() and project_dir else onyx_dir
                DOWNLOAD_JOBS[job_id]["onyx_dir"] = project_dir if 'project_dir' in locals() and project_dir else onyx_dir
                DOWNLOAD_JOBS[job_id]["progress"] = "Done! (MP3 & ONYX Stems ready)"
                
        except Exception as e:
            print(f"Demucs worker error: {e}")
            if 'job_id' in locals() and job_id in DOWNLOAD_JOBS:
                DOWNLOAD_JOBS[job_id]["status"] = "error"
                DOWNLOAD_JOBS[job_id]["progress"] = f"Error: {e}"
        finally:
            DEMUCS_QUEUE.task_done()

# Start background worker thread for Demucs AI queue



class DownloadRequest(BaseModel):
    url: str
    formats: List[str]
    artist: Optional[str] = None
    title: Optional[str] = None
    bpm_prefix: Optional[bool] = False
    bpm_suffix: Optional[bool] = False
    video_dir: Optional[str] = None
    audio_dir: Optional[str] = None
    onyx_dir: Optional[str] = None
    spotify: Optional[bool] = False
    auto_split: Optional[bool] = False
    playlist: Optional[bool] = False
    djay_mode: Optional[bool] = False
    analyze_bpm: Optional[bool] = False
    shazam_extract: Optional[bool] = False
    trim_start: Optional[str] = None
    trim_end: Optional[str] = None
    shazam_sample_duration: Optional[int] = 10
    shazam_sample_interval: Optional[int] = 30
    download_delay: Optional[int] = 0

class PlaylistParseReq(BaseModel):
    url: str
    shazam_sample_interval: Optional[int] = 90


from datetime import datetime

def process_download(job_id: str, req: DownloadRequest):
    logger.info(f"[{job_id}] Started download job: {req.url}")
    DOWNLOAD_JOBS[job_id] = {
        "status": "processing", 
        "progress": "Starting download...",
        "logs": [f"[{datetime.now().strftime('%H:%M:%S')}] Job initialized."]
    }
    
    try:
        # Expand ~ to actual home directory
        req.audio_dir = os.path.expanduser(req.audio_dir) if hasattr(req, 'audio_dir') and req.audio_dir else os.path.expanduser("~/Downloads/OnyxAudio")
        req.video_dir = os.path.expanduser(req.video_dir) if hasattr(req, 'video_dir') and req.video_dir else os.path.expanduser("~/Downloads/OnyxVideo")
        req.onyx_dir = os.path.expanduser(req.onyx_dir) if hasattr(req, 'onyx_dir') and req.onyx_dir else os.path.expanduser("~/Downloads/OnyxProjects")
        
        def log_msg(msg: str):
            ts = datetime.now().strftime("%H:%M:%S")
            line = f"[{ts}] {msg}"
            DOWNLOAD_JOBS[job_id]["progress"] = msg
            if "logs" not in DOWNLOAD_JOBS[job_id]:
                DOWNLOAD_JOBS[job_id]["logs"] = []
            # Avoid duplicate consecutive progress lines
            if not DOWNLOAD_JOBS[job_id]["logs"] or DOWNLOAD_JOBS[job_id]["logs"][-1] != line:
                DOWNLOAD_JOBS[job_id]["logs"].append(line)
            if len(DOWNLOAD_JOBS[job_id]["logs"]) > 500:
                DOWNLOAD_JOBS[job_id]["logs"].pop(0)

        def on_progress(d):
            if DOWNLOAD_JOBS.get(job_id, {}).get("cancelled"):
                raise RuntimeError("Job cancelled by user")
            if isinstance(d, dict) and d.get('status') == 'downloading':
                p = d.get('_percent_str', '').strip()
                speed = d.get('_speed_str', '').strip()
                eta = d.get('_eta_str', '').strip()
                if p:
                    text = f"Downloading: {p}"
                    if speed: text += f" ({speed})"
                    if eta: text += f" ETA {eta}"
                    log_msg(text)
            elif isinstance(d, str):
                log_msg(d)

        is_local_file = req.url.startswith('file://')

        video_downloaded_file = None
        if "video" in req.formats and not is_local_file:
            os.makedirs(req.video_dir, exist_ok=True)
            log_msg("Starting High Quality Video download...")
            video_downloaded_file = download_video(req.url, req.video_dir, format_type="video", progress_callback=on_progress, trim_start=req.trim_start if hasattr(req, 'trim_start') else None, trim_end=req.trim_end if hasattr(req, 'trim_end') else None, download_delay=req.download_delay)
            
        is_playlist_requested = "playlist" in req.formats or (hasattr(req, 'playlist') and req.playlist)
        is_shazam_requested = "shazam" in req.formats or (hasattr(req, 'shazam_extract') and req.shazam_extract)
        track_paths = []
        playlist_m3u8_file = None

        if "mp3" in req.formats or "onyx" in req.formats or is_playlist_requested or is_shazam_requested:
            base_audio_dir = req.audio_dir if ("mp3" in req.formats or is_playlist_requested or is_shazam_requested) else req.onyx_dir
            os.makedirs(base_audio_dir, exist_ok=True)
            
            if is_local_file:
                log_msg("Processing local file...")
                import shutil
                local_path = req.url.replace('file://', '')
                filename = os.path.basename(local_path)
                audio_path = os.path.join(base_audio_dir, filename)
                if os.path.abspath(local_path) != os.path.abspath(audio_path):
                    shutil.copy2(local_path, audio_path)
            else:
                log_msg("Starting Audio download...")
                audio_path = download_video(req.url, base_audio_dir, format_type="audio", progress_callback=on_progress, trim_start=req.trim_start if hasattr(req, 'trim_start') else None, trim_end=req.trim_end if hasattr(req, 'trim_end') else None, download_delay=req.download_delay)
            
            # Handle Shazam AI Recognition & Individual Track Extraction if requested
            if is_shazam_requested:
                log_msg("Starting Shazam AI set recognition...")
                shazam_res = extract_and_download_shazam_set(
                    set_audio_path=audio_path,
                    output_dir=base_audio_dir,
                    sample_duration=req.shazam_sample_duration or 10,
                    sample_interval=req.shazam_sample_interval or 90,
                    spotify=req.spotify,
                    bpm_prefix=req.bpm_prefix,
                    bpm_suffix=req.bpm_suffix,
                    progress_callback=on_progress,
                    download_delay=req.download_delay
                )
                track_paths = shazam_res.get("tracks", [])
                playlist_m3u8_file = shazam_res.get("playlist_m3u8")
            else:
                # Handle Auto-Split
                track_paths = [audio_path]
                if req.auto_split:
                    log_msg("Fetching video info for chapters...")
                    info_dict = get_video_info(req.url)
                    track_paths = split_album(audio_path, info_dict, base_audio_dir, progress_callback=on_progress)
                
                # Enrich and rename if requested
                if "mp3" in req.formats or is_playlist_requested or (req.bpm_prefix or req.bpm_suffix or req.spotify or getattr(req, "djay_mode", False)):
                    enriched_paths = []
                    for track in track_paths:
                        enriched = enrich_and_rename_file(
                            track, 
                            spotify=req.spotify, 
                            bpm_prefix=req.bpm_prefix, 
                            bpm_suffix=req.bpm_suffix,
                            analyze_bpm=req.analyze_bpm,
                            progress_callback=on_progress,
                            known_artist=req.artist,
                            known_title=req.title
                        )
                        enriched_paths.append(enriched)
                    track_paths = enriched_paths
                
                # Generate DJ Playlist Pack if requested
                if is_playlist_requested and track_paths:
                    log_msg("Generating DJ Playlist Pack (.m3u8, .cue, .txt)...")
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
            
        if DOWNLOAD_JOBS.get(job_id, {}).get("cancelled"):
            DOWNLOAD_JOBS[job_id]["status"] = "cancelled"
            log_msg("⛔ Job explicitly cancelled by user.")
            return

        if not track_paths and video_downloaded_file:
            DOWNLOAD_JOBS[job_id]["status"] = "completed"
            DOWNLOAD_JOBS[job_id]["progress"] = "Video Download Complete"
            DOWNLOAD_JOBS[job_id]["result_file"] = video_downloaded_file

        # Enqueue Demucs AI Stem Separation into managed background worker queue
        if "onyx" in req.formats and track_paths:
            keep_mp3 = ("mp3" in req.formats or is_playlist_requested)
            DEMUCS_QUEUE.put((job_id, track_paths, req.onyx_dir, keep_mp3))
            log_msg("Done! (Queued for ONYX Stems AI...)")
        else:
            DOWNLOAD_JOBS[job_id]["status"] = "completed"
            if track_paths:
                if getattr(req, "djay_mode", False):
                    import subprocess
                    folder_name = os.path.basename(req.audio_dir.rstrip('/')) if getattr(req, 'audio_dir', None) else 'djay_local_cache'
                    subprocess.run(["osascript", "-e", f"display notification \"Track ready in {folder_name}!\" with title \"Onyx DJ Companion\""])
                if len(track_paths) == 1:
                    DOWNLOAD_JOBS[job_id]["result_file"] = track_paths[0]
                else:
                    DOWNLOAD_JOBS[job_id]["result_dir"] = os.path.dirname(track_paths[0])
            log_msg("Done!")

    except Exception as e:
        if str(e) == "Job cancelled by user":
            DOWNLOAD_JOBS[job_id]["status"] = "cancelled"
            log_msg("⛔ Job explicitly cancelled by user.")
        else:
            logger.error(f"[{job_id}] Critical Error during download: {e}", exc_info=True)
            DOWNLOAD_JOBS[job_id]["status"] = "error"
            DOWNLOAD_JOBS[job_id]["progress"] = f"Critical Error: {e}"
            if "logs" not in DOWNLOAD_JOBS[job_id]:
                DOWNLOAD_JOBS[job_id]["logs"] = []
            DOWNLOAD_JOBS[job_id]["logs"].append(f"CRITICAL ERROR: {e}")
            import traceback
            traceback.print_exc()

@app.post("/api/download/cancel/{job_id}")
def cancel_download_job(job_id: str):
    if job_id in DOWNLOAD_JOBS:
        DOWNLOAD_JOBS[job_id]["cancelled"] = True
        DOWNLOAD_JOBS[job_id]["status"] = "cancelled"
        ts = datetime.now().strftime("%H:%M:%S")
        if "logs" in DOWNLOAD_JOBS[job_id]:
            DOWNLOAD_JOBS[job_id]["logs"].append(f"[{ts}] ⛔ Cancellation requested by user.")
        return {"status": "cancelled", "job_id": job_id}
    raise HTTPException(status_code=404, detail="Job not found")


@app.get("/api/djay/current-track")
def get_djay_track():
    return djay_monitor_instance.get_current_track()

@app.post("/api/djay/download")
def download_djay_track(req: DownloadRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    DOWNLOAD_JOBS[job_id] = {"status": "queued", "progress": "Waiting for DJay Download..."}
    req.djay_mode = True
    
    if not req.audio_dir:
        req.audio_dir = os.path.expanduser("~/Music/djay_local_cache")
        
    req.audio_dir = os.path.expanduser(req.audio_dir)
    if not os.path.exists(req.audio_dir):
        os.makedirs(req.audio_dir, exist_ok=True)
        
    threading.Thread(target=process_download, args=(job_id, req), daemon=True).start()
    return {"job_id": job_id}

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
    info = get_video_info(url)
    return info

@app.post("/api/playlist/parse")
def parse_playlist(req: PlaylistParseReq):
    import urllib.request
    import json
    import re
    url = req.url
    tracks = []

    if "music.apple.com" in url:
        try:
            req_obj = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            html = urllib.request.urlopen(req_obj, timeout=10).read().decode('utf-8')
            match = re.search(r'<script type="application/json" id="serialized-server-data">(.*?)</script>', html, re.S)
            if match:
                data = json.loads(match.group(1))
                def find_tracks(obj):
                    if isinstance(obj, dict):
                        if 'title' in obj and 'subtitleLinks' in obj:
                            title = obj.get('title')
                            artist_links = obj.get('subtitleLinks', [])
                            if title and artist_links and isinstance(artist_links, list) and len(artist_links) > 0:
                                artist = artist_links[0].get('title')
                                if artist and "Apple Music" not in artist:
                                    tracks.append(f"{artist} - {title}")
                        for k, v in obj.items():
                            find_tracks(v)
                    elif isinstance(obj, list):
                        for item in obj:
                            find_tracks(item)
                find_tracks(data)
        except Exception as e:
            print(f"Failed to parse Apple Music playlist: {e}")
            
    elif "spotify.com" in url:
        client_id = os.environ.get('SPOTIPY_CLIENT_ID')
        client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')
        if client_id and client_secret:
            try:
                import spotipy
                from spotipy.oauth2 import SpotifyClientCredentials
                auth_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
                sp = spotipy.Spotify(auth_manager=auth_manager)
                
                if "playlist" in url:
                    playlist_id = url.split("playlist/")[1].split("?")[0]
                    results = sp.playlist_tracks(playlist_id)
                    items = results['items']
                    while results['next']:
                        results = sp.next(results)
                        items.extend(results['items'])
                    for item in items:
                        track = item.get('track')
                        if track and track.get('name') and track.get('artists'):
                            tracks.append(f"{track['artists'][0]['name']} - {track['name']}")
                elif "album" in url:
                    album_id = url.split("album/")[1].split("?")[0]
                    results = sp.album_tracks(album_id)
                    items = results['items']
                    while results['next']:
                        results = sp.next(results)
                        items.extend(results['items'])
                    for track in items:
                        if track and track.get('name') and track.get('artists'):
                            tracks.append(f"{track['artists'][0]['name']} - {track['name']}")
            except Exception as e:
                print(f"Failed to parse Spotify playlist: {e}")
        else:
            print("Spotify credentials not found for playlist parsing")

    # Filter unique while preserving order
    unique_tracks = []
    for t in tracks:
        if t not in unique_tracks:
            unique_tracks.append(t)

    return {"tracks": unique_tracks}

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
        import json
        import subprocess
        # In a frozen app, we cannot easily check pip outdated without spawning a new python or running pip module.
        # But for yt-dlp, we can just check if an update is available via pip index.
        # Wait, runpy.run_module("pip", ...) will print to stdout. 
        # A simpler way is to just allow the user to click update, which always runs pip install --upgrade.
        return {
            "update_available": True, # Always allow attempting update for simplicity in frozen state
            "packages": [{"name": "yt-dlp", "version": "latest"}, {"name": "demucs", "version": "latest"}]
        }
    except Exception as e:
        print(f"Failed to check updates: {e}")
        return {"update_available": False, "packages": []}

@app.post("/api/update-plugins")
def update_plugins():
    try:
        import sys
        import importlib
        
        # Save original argv
        orig_argv = sys.argv.copy()
        
        # Run pip install --target ~/.onyx_plugins --upgrade yt-dlp demucs
        sys.argv = ["pip", "install", "--target", PLUGINS_DIR, "--upgrade", "yt-dlp", "demucs"]
        try:
            runpy.run_module("pip", run_name="__main__")
        except SystemExit as e:
            if e.code != 0:
                raise Exception(f"Pip failed with code {e.code}")
        finally:
            sys.argv = orig_argv
            
        # Reload yt_dlp module dynamically in memory
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
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    
    

    uvicorn.run(app, host="127.0.0.1", port=args.port)
