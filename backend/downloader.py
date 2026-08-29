import yt_dlp
import os
from yt_dlp.utils import download_range_func

def parse_time_str(time_str: str) -> float:
    if not time_str:
        return 0.0
    parts = time_str.split(':')
    seconds = 0.0
    for p in parts:
        seconds = seconds * 60 + float(p)
    return seconds

def get_video_info(url: str):
    ydl_opts = {
        'quiet': True,
        'extract_flat': True,
        'skip_download': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return info

def download_video(url: str, output_dir: str, format_type: str = "video", progress_callback=None, trim_start=None, trim_end=None):
    # format_type can be 'video' or 'audio'
    
    ydl_opts = {}
    
    if progress_callback:
        ydl_opts['progress_hooks'] = [progress_callback]

    if trim_start or trim_end:
        start_sec = parse_time_str(trim_start) if trim_start else 0.0
        end_sec = parse_time_str(trim_end) if trim_end else float('inf')
        if end_sec > start_sec:
            ydl_opts['download_ranges'] = download_range_func(None, [(start_sec, end_sec)])
            # yt-dlp section downloader requires ffmpeg logic
            ydl_opts['force_keyframes_at_cuts'] = True

    if format_type == "audio":
        ydl_opts.update({
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': False
        })
    else:
        # Highest quality video + audio
        ydl_opts.update({
            'format': 'bestvideo+bestaudio/best',
            'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
            'merge_output_format': 'mp4',
            'quiet': False
        })

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        # Returns the path to the downloaded file
        # Note: if postprocessing happens, the extension might change.
        # We can predict the final filename using ydl.prepare_filename
        filename = ydl.prepare_filename(info)
        if format_type == "audio":
            filename = os.path.splitext(filename)[0] + ".mp3"
        elif format_type == "video" and not filename.endswith(".mp4"):
            filename = os.path.splitext(filename)[0] + ".mp4"
            
        return filename
