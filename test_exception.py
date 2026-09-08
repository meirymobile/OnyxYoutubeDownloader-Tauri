import sys
sys.path.append("/Users/meir/Documents/Projects/OnyxYoutubeDownloader-Tauri/backend")
from main import process_download, DownloadRequest

req = DownloadRequest(
    url="Meir Ye - קרחנה",
    formats=["mp3"],
    audio_dir="/tmp",
    video_dir="/tmp",
    onyx_dir="/tmp"
)

try:
    process_download("test_job", req)
except Exception as e:
    import traceback
    traceback.print_exc()
