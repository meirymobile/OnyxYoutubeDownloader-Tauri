import os
import shutil
import subprocess
import re
import librosa
import numpy as np

def get_duration(audio_path: str) -> float:
    try:
        res = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True, check=True
        )
        return float(res.stdout.strip())
    except:
        return 0.0

def parse_ffmpeg_time(time_str: str) -> float:
    # time_str is usually HH:MM:SS.ms
    parts = time_str.split(':')
    if len(parts) == 3:
        h, m, s = parts
        return float(h) * 3600 + float(m) * 60 + float(s)
    return 0.0

def detect_silences(audio_path: str, duration: float, progress_callback=None) -> list:
    silences = []
    
    # Run ffmpeg silence detection
    cmd = [
        "ffmpeg", "-i", audio_path, 
        "-af", "silencedetect=noise=-30dB:d=1.5", 
        "-f", "null", "-"
    ]
    
    process = subprocess.Popen(cmd, stderr=subprocess.PIPE, text=True)
    
    current_start = None
    
    # Regexes for parsing
    start_re = re.compile(r"silence_start: ([\d\.]+)")
    end_re = re.compile(r"silence_end: ([\d\.]+)")
    time_re = re.compile(r"time=(\d{2}:\d{2}:\d{2}\.\d+)")
    
    last_percent = -1
    
    while True:
        line = process.stderr.readline()
        if not line and process.poll() is not None:
            break
            
        # Parse progress
        time_match = time_re.search(line)
        if time_match and duration > 0:
            current_time = parse_ffmpeg_time(time_match.group(1))
            percent = int((current_time / duration) * 100)
            if percent != last_percent and progress_callback and percent <= 100:
                progress_callback(f"Detecting silence boundaries... {percent}%")
                last_percent = percent
                
        # Parse silence
        start_match = start_re.search(line)
        if start_match:
            current_start = float(start_match.group(1))
            
        end_match = end_re.search(line)
        if end_match and current_start is not None:
            current_end = float(end_match.group(1))
            silences.append((current_start, current_end))
            current_start = None

    return silences

def split_album(audio_path: str, video_info: dict, output_dir: str, progress_callback=None) -> list:
    if not os.path.exists(audio_path):
        return [audio_path]
        
    filename = os.path.basename(audio_path)
    base_name = os.path.splitext(filename)[0]
    
    album_dir = os.path.join(output_dir, base_name)
    os.makedirs(album_dir, exist_ok=True)
    
    split_tracks = []
    
    # 1. Check for Chapters
    chapters = video_info.get('chapters') if video_info else None
    
    if chapters and len(chapters) > 1:
        if progress_callback: progress_callback(f"Chapters found! Splitting into {len(chapters)} tracks...")
        try:
            for i, chapter in enumerate(chapters):
                start_time = chapter.get('start_time')
                end_time = chapter.get('end_time')
                title = chapter.get('title', f"Track {i+1}")
                safe_title = "".join([c for c in title if c.isalpha() or c.isdigit() or c==' ']).rstrip()
                
                track_filename = f"{i+1:02d} - {safe_title}.mp3"
                track_path = os.path.join(album_dir, track_filename)
                
                if progress_callback: progress_callback(f"Extracting chapter: {safe_title}")
                # FFmpeg direct copy is instant
                subprocess.run(["ffmpeg", "-y", "-i", audio_path, "-ss", str(start_time), "-to", str(end_time), "-c", "copy", track_path], capture_output=True)
                split_tracks.append(track_path)
                
            if os.path.exists(audio_path):
                os.remove(audio_path)
            return split_tracks
        except Exception as e:
            print(f"Failed to split by chapters: {e}")
            if progress_callback: progress_callback("Chapter splitting failed, falling back to silence detection.")
            
    # 2. Silence Detection (FFmpeg Fast Method)
    duration = video_info.get('duration') if video_info else get_duration(audio_path)
    
    silences = detect_silences(audio_path, duration, progress_callback)
    
    # Create chunks based on silences
    # [ (0, silence_start1), (silence_end1, silence_start2), ... ]
    chunks = []
    last_end = 0.0
    for s_start, s_end in silences:
        # Avoid tiny chunks
        if s_start - last_end > 5.0:
            chunks.append((last_end, s_start))
        last_end = s_end
        
    if duration - last_end > 5.0:
        chunks.append((last_end, duration))
        
    if not chunks:
        if progress_callback: progress_callback("No silence found. Returning original file.")
        shutil.move(audio_path, os.path.join(album_dir, filename))
        return [os.path.join(album_dir, filename)]
        
    if progress_callback: progress_callback(f"Found {len(chunks)} potential tracks. Slicing audio (FFmpeg)...")
    
    temp_tracks = []
    for i, (start, end) in enumerate(chunks):
        temp_path = os.path.join(album_dir, f"temp_{i}.mp3")
        subprocess.run(["ffmpeg", "-y", "-i", audio_path, "-ss", str(start), "-to", str(end), "-c", "copy", temp_path], capture_output=True)
        temp_tracks.append(temp_path)
        
    if progress_callback: progress_callback("Verifying tracks via BPM logic...")
    
    verified_tracks = []
    current_temp = temp_tracks[0]
    last_bpm = None
    
    for i in range(1, len(temp_tracks)):
        chunk = temp_tracks[i]
        
        try:
            # Librosa on first 30s is very fast
            y, sr = librosa.load(chunk, duration=30)
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            bpm = int(tempo[0]) if isinstance(tempo, (list, np.ndarray)) else int(tempo)
        except:
            bpm = last_bpm or 120
            
        if last_bpm is None:
            last_bpm = bpm
            
        if abs(bpm - last_bpm) <= 5:
            # Merge! Since they are mp3s, we use ffmpeg concat demuxer
            merged_filename = f"merged_{i}.mp3"
            merged_path = os.path.join(album_dir, merged_filename)
            list_filename = f"list_{i}.txt"
            list_file = os.path.join(album_dir, list_filename)
            
            # Use relative paths in the text file to avoid escaping issues with complex album dir names
            with open(list_file, 'w', encoding='utf-8') as f:
                # Escape single quotes just in case chunk names have them
                c_temp_name = os.path.basename(current_temp).replace("'", "'\\''")
                c_chunk_name = os.path.basename(chunk).replace("'", "'\\''")
                f.write(f"file '{c_temp_name}'\nfile '{c_chunk_name}'\n")
                
            res = subprocess.run(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_filename, "-c", "copy", merged_filename], 
                cwd=album_dir, capture_output=True, text=True
            )
            
            if res.returncode != 0:
                print(f"Failed to merge tracks: {res.stderr}")
                # Fallback: just append without merging
                verified_tracks.append(current_temp)
                current_temp = chunk
                last_bpm = bpm
            else:
                os.remove(current_temp)
                os.remove(chunk)
                os.remove(list_file)
                current_temp = merged_path
        else:
            verified_tracks.append(current_temp)
            current_temp = chunk
            last_bpm = bpm
            
    verified_tracks.append(current_temp)
    
    # Final Rename
    if progress_callback: progress_callback(f"Finalized {len(verified_tracks)} individual tracks.")
    for i, track in enumerate(verified_tracks):
        track_filename = f"Track {i+1:02d}.mp3"
        track_path = os.path.join(album_dir, track_filename)
        os.rename(track, track_path)
        split_tracks.append(track_path)
        
    if os.path.exists(audio_path):
        os.remove(audio_path)
        
    return split_tracks
