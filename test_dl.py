import sys
import os
sys.path.append('backend')
from downloader import download_video

out_dir = os.path.abspath('test_dl_out')
os.makedirs(out_dir, exist_ok=True)
try:
    print("Starting download...")
    f = download_video('ytsearch1:Topic & Sofiya Nzau - Away HQ audio', out_dir, format_type='audio')
    print("Success! Returned filename:", f)
    print("Files in out_dir:", os.listdir(out_dir))
except Exception as e:
    print("Error:", e)
