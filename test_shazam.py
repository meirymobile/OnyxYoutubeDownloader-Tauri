import sys
sys.path.append('backend')
from shazam_extractor import scan_audio_with_shazam

def cb(msg):
    print(msg)

file = "/Users/meir/Downloads/נסיון מוזיקה/לייבסט/Afro House Dj Set/Afro House Dj Set.mp3"
scan_audio_with_shazam(file, progress_callback=cb)
