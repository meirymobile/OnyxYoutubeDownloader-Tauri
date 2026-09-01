import yt_dlp
import os
import time
from yt_dlp.utils import download_range_func, DownloadError

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
        'skip_download': True,
        'retries': 20,
        'fragment_retries': 20,
        'socket_timeout': 30,
        'extractor_args': {'youtube': {'player_client': ['android', 'web', 'tv']}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return info

def download_video(url: str, output_dir: str, format_type: str = "video", progress_callback=None, trim_start=None, trim_end=None):
    # format_type can be 'video' or 'audio'
    
    ydl_opts = {
        'retries': 20,
        'fragment_retries': 20,
        'file_access_retries': 20,
        'socket_timeout': 30,
        'nocheckcertificate': True,
        'continuedl': True, # Resume interrupted downloads automatically
        'http_headers': {'Connection': 'close'}, # Fix for [Errno 32] Broken pipe on macOS
    }
    
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
                'preferredquality': '320',
            }],
            'quiet': True,
            'no_warnings': True
        })
    else:
        # Highest quality video + audio
        ydl_opts.update({
            'format': 'bestvideo+bestaudio/best',
            'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
            'merge_output_format': 'mp4',
            'quiet': True,
            'no_warnings': True
        })

    max_attempts = 3
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                if format_type == "audio":
                    filename = os.path.splitext(filename)[0] + ".mp3"
                elif format_type == "video" and not filename.endswith(".mp4"):
                    filename = os.path.splitext(filename)[0] + ".mp4"
                return filename
        except Exception as e:
            last_err = e
            print(f"Download attempt {attempt}/{max_attempts} failed for '{url}': {e}")
            if attempt < max_attempts:
                time.sleep(2)

    raise last_err
