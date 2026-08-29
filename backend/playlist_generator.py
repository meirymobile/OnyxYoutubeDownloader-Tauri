import os

def format_cue_time(seconds: float) -> str:
    """Format seconds into CUE time format mm:ss:ff (75 frames/sec)"""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    frames = int((seconds % 1) * 75)
    return f"{minutes:02d}:{secs:02d}:{frames:02d}"

def format_timestamp(seconds: float) -> str:
    """Format seconds into HH:MM:SS or MM:SS"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

def extract_track_info_from_file(file_path: str, start_time: float = 0.0) -> dict:
    """
    Extracts title, artist, duration, BPM, and Key from an MP3 file using mutagen.
    """
    filename = os.path.basename(file_path)
    base_title = os.path.splitext(filename)[0]
    
    info = {
        "path": file_path,
        "title": base_title,
        "artist": "Unknown Artist",
        "duration": 0.0,
        "bpm": None,
        "key": None,
        "start_time": start_time
    }
    
    try:
        from mutagen.mp3 import MP3
        from mutagen.id3 import ID3
        audio = MP3(file_path, ID3=ID3)
        if audio.info:
            info["duration"] = audio.info.length
        if audio.tags:
            if "TIT2" in audio.tags:
                info["title"] = str(audio.tags["TIT2"])
            if "TPE1" in audio.tags:
                info["artist"] = str(audio.tags["TPE1"])
            if "TBPM" in audio.tags:
                info["bpm"] = str(audio.tags["TBPM"])
            if "TKEY" in audio.tags:
                info["key"] = str(audio.tags["TKEY"])
    except Exception as e:
        print(f"Error reading ID3 tags from {file_path}: {e}")
        
    return info


def generate_m3u8(output_dir: str, playlist_name: str, tracks_info: list) -> str:
    """
    Generates a UTF-8 encoded M3U8 playlist file compatible with 
    Algoriddim djay, Rekordbox, Serato, Traktor, and VirtualDJ.
    """
    m3u8_filename = f"{playlist_name}.m3u8"
    m3u8_filepath = os.path.join(output_dir, m3u8_filename)
    
    with open(m3u8_filepath, "w", encoding="utf-8") as f:
        f.write("#EXTM3U\n")
        f.write(f"#EXTENC:UTF-8\n")
        f.write(f"#PLAYLIST:{playlist_name}\n\n")
        
        for track in tracks_info:
            duration = int(track.get("duration", 0))
            title = track.get("title", "Unknown Track")
            artist = track.get("artist", "Unknown Artist")
            filename = os.path.basename(track.get("path", ""))
            
            display_name = f"{artist} - {title}" if artist != "Unknown Artist" else title
            f.write(f"#EXTINF:{duration},{display_name}\n")
            f.write(f"{filename}\n\n")
            
    return m3u8_filepath

def generate_cue(output_dir: str, album_name: str, tracks_info: list, audio_filename: str = None) -> str:
    """
    Generates a CUE Sheet (.cue) file mapping tracks and timestamps for DJ software.
    """
    cue_filename = f"{album_name}.cue"
    cue_filepath = os.path.join(output_dir, cue_filename)
    
    target_file = audio_filename or f"{album_name}.mp3"
    
    with open(cue_filepath, "w", encoding="utf-8") as f:
        f.write(f'TITLE "{album_name}"\n')
        f.write('PERFORMER "Various Artists"\n')
        f.write(f'FILE "{target_file}" MP3\n')
        
        for idx, track in enumerate(tracks_info, start=1):
            title = track.get("title", f"Track {idx:02d}")
            artist = track.get("artist", "Unknown Artist")
            start_time = track.get("start_time", 0.0)
            cue_time = format_cue_time(start_time)
            
            f.write(f'  TRACK {idx:02d} AUDIO\n')
            f.write(f'    TITLE "{title}"\n')
            f.write(f'    PERFORMER "{artist}"\n')
            f.write(f'    INDEX 01 {cue_time}\n')
            
    return cue_filepath

def generate_tracklist_txt(output_dir: str, album_name: str, tracks_info: list) -> str:
    """
    Generates a clean, human-readable text tracklist summary file.
    """
    txt_filename = f"{album_name} - Tracklist.txt"
    txt_filepath = os.path.join(output_dir, txt_filename)
    
    with open(txt_filepath, "w", encoding="utf-8") as f:
        f.write("=" * 60 + "\n")
        f.write(f"  ONYX DOWNLOADER - DJ TRACKLIST\n")
        f.write(f"  Album / Mix: {album_name}\n")
        f.write(f"  Total Tracks: {len(tracks_info)}\n")
        f.write("=" * 60 + "\n\n")
        
        for idx, track in enumerate(tracks_info, start=1):
            start_str = format_timestamp(track.get("start_time", 0.0))
            title = track.get("title", f"Track {idx:02d}")
            artist = track.get("artist", "Unknown Artist")
            bpm = track.get("bpm", None)
            key = track.get("key", None)
            
            bpm_key_info = ""
            if bpm or key:
                parts = []
                if bpm: parts.append(f"{bpm} BPM")
                if key: parts.append(f"Key: {key}")
                bpm_key_info = f" [{', '.join(parts)}]"
                
            display = f"{artist} - {title}" if artist != "Unknown Artist" else title
            f.write(f"{idx:02d}. [{start_str}] {display}{bpm_key_info}\n")
            
    return txt_filepath

def create_dj_playlist_pack(output_dir: str, album_name: str, tracks_info: list, audio_filename: str = None) -> dict:
    """
    Creates a full DJ Playlist Pack containing .m3u8, .cue, and Tracklist.txt files.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    m3u8_file = generate_m3u8(output_dir, album_name, tracks_info)
    cue_file = generate_cue(output_dir, album_name, tracks_info, audio_filename)
    txt_file = generate_tracklist_txt(output_dir, album_name, tracks_info)
    
    return {
        "m3u8": m3u8_file,
        "cue": cue_file,
        "txt": txt_file
    }
