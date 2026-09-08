import requests
payload = {
    "url": "https://www.youtube.com/watch?v=Fy2H_STZ95k",
    "formats": ["audio"],
    "audio_dir": "/tmp",
    "video_dir": "/tmp",
    "onyx_dir": "/tmp",
    "spotify": False,
    "bpm_prefix": "",
    "bpm_suffix": "",
    "trim_start": None,
    "trim_end": None,
    "auto_split": False,
    "playlist": False,
    "shazam_extract": False,
    "shazam_sample_duration": 10,
    "shazam_sample_interval": 30
}
try:
    res = requests.post("http://127.0.0.1:8000/api/download", json=payload)
    print(res.status_code)
    print(res.text)
except Exception as e:
    print("Error:", e)
