import urllib.request
import json
import time
import subprocess
import os
import sys

# 1. Parse Playlist
print("Fetching playlist tracks...")
url = "http://127.0.0.1:8000/api/playlist/parse"
req_data = {"url": "https://music.apple.com/il/playlist/pl.u-GgA5eY6toa5b2l2?a=join&it=No36qZJiE2893q3Ugq2wK"}
req = urllib.request.Request(url, method='POST', headers={'Content-Type': 'application/json'}, data=json.dumps(req_data).encode())

try:
    with urllib.request.urlopen(req) as res:
        resp = json.loads(res.read().decode())
        tracks = resp.get("tracks", [])[:3]
        print(f"Got 3 tracks: {tracks}")
except Exception as e:
    print(f"Error parsing playlist: {e}")
    # Fallback tracks if backend is down or parsing fails
    tracks = ["Meir Ye - קרחנה", "Pacs - Omnia", "Artbat - Return to Oz"]

# 2. Trigger Downloads
jobs = []
download_url = "http://127.0.0.1:8000/api/download"
for track in tracks:
    print(f"Triggering download for: {track}")
    req_data = {
        "url": track,
        "formats": ["mp3"],
        "audio_dir": "/tmp/OnyxTestDownloads",
        "video_dir": "/tmp/OnyxTestDownloads",
        "onyx_dir": "/tmp/OnyxTestDownloads"
    }
    req = urllib.request.Request(download_url, method='POST', headers={'Content-Type': 'application/json'}, data=json.dumps(req_data).encode())
    try:
        with urllib.request.urlopen(req) as res:
            resp = json.loads(res.read().decode())
            jobs.append({"id": resp.get("job_id"), "track": track, "status": "processing"})
    except Exception as e:
        print(f"Failed to start download for {track}: {e}")

# 3. Poll Status
print("Polling status for jobs...")
all_done = False
while not all_done:
    all_done = True
    for job in jobs:
        if job["status"] in ["completed", "error", "cancelled"]:
            continue
        all_done = False
        
        status_url = f"http://127.0.0.1:8000/api/download/{job['id']}"
        try:
            with urllib.request.urlopen(status_url) as res:
                status = json.loads(res.read().decode())
                print(f"[{job['track']}] Status: {status.get('status')} | Progress: {status.get('progress')}")
                if status.get("status") in ["completed", "error", "cancelled"]:
                    job["status"] = status.get("status")
        except Exception as e:
            print(f"Error checking status for {job['track']}: {e}")
    
    if not all_done:
        time.sleep(3)

print("All downloads finished!")
for job in jobs:
    print(f"Track: {job['track']} -> FINAL STATUS: {job['status']}")
