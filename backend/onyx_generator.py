import os
import json
import datetime
import librosa
import numpy as np
import subprocess
import shutil

def generate_onyx_project(audio_file: str, output_root: str, progress_callback=None):
    """
    Takes an input audio file (usually downloaded mp3/wav), 
    runs AI stem separation using demucs, extracts BPM/Key with librosa, 
    and packages it into an .onyx directory format.
    """
    file_basename = os.path.splitext(os.path.basename(audio_file))[0]
    
    # 1. Librosa Analysis for BPM and KEY
    if progress_callback: progress_callback("Analyzing BPM and Key with Librosa...")
    bpm_val, key_val = 128, "8B"
    try:
        y, sr = librosa.load(audio_file, duration=60) # Analyze first 60 seconds for speed
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr, start_bpm=128)
        bpm_val = int(round(float(tempo[0] if isinstance(tempo, (list, np.ndarray)) else tempo)))
        if bpm_val < 90: bpm_val *= 2
        if bpm_val > 180: bpm_val //= 2
        
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        key_idx = np.argmax(np.mean(chroma, axis=1))
        camelot_wheel = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"]
        key_val = camelot_wheel[key_idx % 12]
    except Exception as e:
        print(f"Librosa analysis failed: {e}")

    project_dir_name = f"{bpm_val} {key_val} {file_basename}.onyx"
    project_dir = os.path.join(output_root, project_dir_name)
    os.makedirs(project_dir, exist_ok=True)

    # 2. Demucs Stem Separation
    temp_demucs = os.path.join(output_root, "temp_demucs")
    os.makedirs(temp_demucs, exist_ok=True)
    
    # Using htdemucs for fast separation
    print(f"Starting Demucs separation for {audio_file}...")
    if progress_callback: progress_callback("Starting Demucs AI Separation...")
    
    process = subprocess.Popen(
        ["demucs", "-n", "htdemucs", "--out", temp_demucs, audio_file],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    
    for line in iter(process.stdout.readline, ""):
        line = line.strip()
        if line and progress_callback:
            if "%" in line:
                progress_callback(f"Demucs: {line}")
                
    process.stdout.close()
    process.wait()

    # 3. Move Stems to Project Directory
    if progress_callback: progress_callback("Packaging ONYX project...")
    demucs_out_dir = os.path.join(temp_demucs, "htdemucs", file_basename)
    stems = ["vocals", "drums", "bass", "other"]
    processed_stems = {}
    
    if os.path.exists(demucs_out_dir):
        for stem in stems:
            src = os.path.join(demucs_out_dir, f"{stem}.wav")
            dest = os.path.join(project_dir, f"{stem}.wav")
            if os.path.exists(src):
                shutil.copy2(src, dest)
                processed_stems[stem] = f"{stem}.wav"
                
    # Cleanup temp
    try:
        shutil.rmtree(temp_demucs)
    except: pass

    # 4. Generate lyrics.json (Mocked for now, as full whisper extraction is heavy)
    lyrics_file = os.path.join(project_dir, "lyrics.json")
    with open(lyrics_file, "w") as f:
        json.dump({"lyrics": [], "note": "Lyrics extraction not fully implemented in this module"}, f)
    
    # 5. Create .onyx manifest
    project_data = {
        "version": "1.0",
        "song": file_basename,
        "bpm": bpm_val,
        "key": key_val,
        "format": "wav",
        "stems": processed_stems,
        "karaoke": {
            "available": True,
            "file": "lyrics.json"
        },
        "timestamp": datetime.datetime.now().isoformat()
    }
    
    manifest_path = os.path.join(project_dir, f"{bpm_val} {key_val} {file_basename}.onyx")
    with open(manifest_path, "w") as f:
        json.dump(project_data, f, indent=4)
        
    return project_dir
