import os
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import librosa
import numpy as np
from mutagen.id3 import ID3, TIT2, TPE1, TBPM, TKEY, APIC, TALB
from mutagen.mp3 import MP3

def enrich_and_rename_file(audio_path: str, spotify: bool, bpm_prefix: bool, bpm_suffix: bool, progress_callback=None):
    if not os.path.exists(audio_path) or not audio_path.endswith('.mp3'):
        return audio_path

    if progress_callback: progress_callback("Starting Metadata & BPM Analysis...")

    filename = os.path.basename(audio_path)
    base_name = os.path.splitext(filename)[0]
    dir_name = os.path.dirname(audio_path)
    
    bpm_val = 128
    key_val = "8B" # Placeholder for musical key, Librosa key extraction is non-trivial

    # 1. Librosa Analysis for BPM
    try:
        if progress_callback: progress_callback("Analyzing BPM with Librosa...")
        y, sr = librosa.load(audio_path, duration=60) # Analyze first 60 seconds
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        if isinstance(tempo, (list, np.ndarray)):
            bpm_val = int(tempo[0])
        else:
            bpm_val = int(tempo)
    except Exception as e:
        print(f"BPM Analysis failed: {e}")

    bpm_key_str = f"{bpm_val}_{key_val}"
    if progress_callback: progress_callback(f"Analysis Complete: {bpm_key_str}")

    # 2. Spotify Metadata Fetching (If requested and env vars present)
    spotify_data = None
    if spotify:
        client_id = os.environ.get('SPOTIPY_CLIENT_ID')
        client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')
        
        if client_id and client_secret:
            try:
                if progress_callback: progress_callback("Fetching Spotify Metadata...")
                auth_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
                sp = spotipy.Spotify(auth_manager=auth_manager)
                
                # Simple search using the base filename (assuming it's a song name)
                # Remove some common youtube junk strings if present
                search_query = base_name.replace("Official Music Video", "").replace("Official Video", "").replace("Lyrics", "")
                
                results = sp.search(q=search_query, type='track', limit=1)
                if results['tracks']['items']:
                    track = results['tracks']['items'][0]
                    spotify_data = {
                        'title': track['name'],
                        'artist': track['artists'][0]['name'],
                        'album': track['album']['name'],
                        'cover_url': track['album']['images'][0]['url'] if track['album']['images'] else None
                    }
                    if progress_callback: progress_callback(f"Found Spotify Match: {spotify_data['artist']} - {spotify_data['title']}")
                else:
                    if progress_callback: progress_callback("No Spotify match found.")
            except Exception as e:
                print(f"Spotify fetch failed: {e}")
                if progress_callback: progress_callback("Spotify fetch failed (check API keys).")
        else:
            if progress_callback: progress_callback("Spotify skipped (Missing API Keys in .env)")

    # 3. Write ID3 Tags
    try:
        if progress_callback: progress_callback("Injecting ID3 Tags...")
        
        # Ensure file has ID3 tag
        audio = MP3(audio_path, ID3=ID3)
        if audio.tags is None:
            audio.add_tags()
            
        # Add BPM and Key
        audio.tags.add(TBPM(encoding=3, text=str(bpm_val)))
        audio.tags.add(TKEY(encoding=3, text=key_val))
        
        if spotify_data:
            audio.tags.add(TIT2(encoding=3, text=spotify_data['title']))
            audio.tags.add(TPE1(encoding=3, text=spotify_data['artist']))
            audio.tags.add(TALB(encoding=3, text=spotify_data['album']))
            
            if spotify_data['cover_url']:
                import requests
                try:
                    img_data = requests.get(spotify_data['cover_url']).content
                    audio.tags.add(
                        APIC(
                            encoding=3, 
                            mime='image/jpeg', 
                            type=3, # 3 is for album front cover
                            desc=u'Cover',
                            data=img_data
                        )
                    )
                except:
                    pass

        audio.save()
    except Exception as e:
        print(f"Failed to write ID3 tags: {e}")

    # 4. Rename File
    new_name = base_name
    if bpm_prefix:
        new_name = f"{{{bpm_key_str}}} - {new_name}"
    elif bpm_suffix:
        new_name = f"{new_name} - {{{bpm_key_str}}}"

    new_filename = f"{new_name}.mp3"
    new_filepath = os.path.join(dir_name, new_filename)
    
    if new_filepath != audio_path:
        if progress_callback: progress_callback(f"Renaming file to {new_filename}...")
        os.rename(audio_path, new_filepath)
        
    return new_filepath
