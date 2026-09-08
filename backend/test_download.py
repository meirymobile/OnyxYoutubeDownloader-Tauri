import urllib.request
import json
import time

url = "http://localhost:8000/api/download"
req_data = {
    "url": "Meir Ye - קרחנה",
    "formats": ["mp3"],
    "audio_dir": "/tmp",
    "video_dir": "/tmp",
    "onyx_dir": "/tmp"
}

req = urllib.request.Request(url, method='POST', headers={'Content-Type': 'application/json'}, data=json.dumps(req_data).encode())
with urllib.request.urlopen(req) as res:
    resp = json.loads(res.read().decode())
    job_id = resp.get("job_id")
    print(f"Job ID: {job_id}")

while True:
    time.sleep(1)
    status_url = f"http://localhost:8000/api/download/{job_id}"
    try:
        with urllib.request.urlopen(status_url) as res:
            status = json.loads(res.read().decode())
            print(status)
            if status.get("status") in ["completed", "error"]:
                break
    except Exception as e:
        print(f"Error checking status: {e}")
        break
