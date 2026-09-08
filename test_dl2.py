import yt_dlp
import os
import sys

out_dir = os.path.abspath('test_dl_out2')
os.makedirs(out_dir, exist_ok=True)
ydl_opts = {
    'format': 'bestaudio/best',
    'outtmpl': os.path.join(out_dir, '%(title)s.%(ext)s'),
    'quiet': True,
    'no_warnings': True
}
with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info = ydl.extract_info("ytsearch1:Topic Away", download=True)
    try:
        filename = ydl.prepare_filename(info)
        print("prepare_filename returned:", filename)
    except Exception as e:
        print("prepare_filename error:", e)
    print("Files in out_dir:", os.listdir(out_dir))
