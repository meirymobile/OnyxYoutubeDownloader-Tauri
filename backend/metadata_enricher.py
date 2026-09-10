import os
import requests
import librosa
import numpy as np
from typing import Optional
from mutagen.id3 import ID3, TIT2, TPE1, TBPM, TKEY, APIC, TALB
from mutagen.mp3 import MP3

def fetch_metadata_online(query: str) -> dict:
    """Fetch official track metadata and high-res cover art without requiring API keys."""
    # 1. Try Spotify API if credentials exist
    client_id = os.environ.get('SPOTIPY_CLIENT_ID')
    client_secret = os.environ.get('SPOTIPY_CLIENT_SECRET')
    if client_id and client_secret:
        try:
            import spotipy
            from spotipy.oauth2 import SpotifyClientCredentials
            auth_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
            sp = spotipy.Spotify(auth_manager=auth_manager)
            results = sp.search(q=query, type='track', limit=1)
            if results and results.get('tracks') and results['tracks']['items']:
                track = results['tracks']['items'][0]
                cover_url = track['album']['images'][0]['url'] if track['album']['images'] else None
                return {
                    'title': track['name'],
                    'artist': track['artists'][0]['name'],
                    'album': track['album']['name'],
                    'cover_url': cover_url
                }
        except Exception as e:
            print(f"Spotify credentials search failed: {e}")

    # 2. Fallback: Public iTunes Search API (Zero API Keys required, High Quality 600x600 artwork)
    try:
        url = f"https://itunes.apple.com/search?term={requests.utils.quote(query)}&entity=song&limit=1"
        res = requests.get(url, timeout=5).json()
        if res.get('resultCount', 0) > 0:
            item = res['results'][0]
            cover_url = item.get('artworkUrl100', '').replace('100x100bb', '600x600bb')
            return {
                'title': item.get('trackName', ''),
                'artist': item.get('artistName', ''),
                'album': item.get('collectionName', ''),
                'cover_url': cover_url if cover_url else None
            }
    except Exception as e:
        print(f"iTunes metadata search failed: {e}")

    return {}

def enrich_and_rename_file(
    audio_path: str, 
    spotify: bool, 
    bpm_prefix: bool, 
    bpm_suffix: bool, 
    analyze_bpm: bool = True,
    known_artist: Optional[str] = None,
    known_title: Optional[str] = None,
    progress_callback=None
) -> str:
    if not os.path.exists(audio_path) or not audio_path.endswith('.mp3'):
        print(f"File not found or not mp3: {audio_path}")
        return audio_path

    if progress_callback: 
        progress_callback("Starting Metadata & BPM Analysis...")

    filename = os.path.basename(audio_path)
    base_name = os.path.splitext(filename)[0]
    dir_name = os.path.dirname(audio_path)
    
    bpm_val = 128
    key_val = "8B"

    # 1. Librosa Analysis for BPM (Conditional)
    if analyze_bpm:
        try:
            if progress_callback: 
                progress_callback(f"Analyzing BPM for '{base_name}'...")
            y, sr = librosa.load(audio_path, duration=60)
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            
            if isinstance(tempo, (list, np.ndarray)):
                bpm_val = int(np.round(float(tempo[0])))
            else:
                bpm_val = int(np.round(float(tempo)))
                
            if bpm_val <= 0:
                bpm_val = 128
        except Exception as e:
            print(f"BPM Analysis failed for {filename}: {e}")
            bpm_val = 128
    else:
        if progress_callback:
            progress_callback(f"BPM Analysis skipped.")
        bpm_val = 128


    if progress_callback: 
        progress_callback(f"Detected BPM: {bpm_val}")

    # 2. Fetch Metadata (Spotify / iTunes)
    metadata = {}
    if known_artist and known_title:
        metadata = {'artist': known_artist, 'title': known_title}

    if spotify:
        if progress_callback: 
            progress_callback(f"Fetching metadata for '{base_name}'...")
        search_query = f"{known_artist} - {known_title}" if (known_artist and known_title) else base_name
        search_query = search_query.replace("Official Music Video", "").replace("Official Video", "").replace("Lyrics", "").replace("HQ audio", "").strip()
        online_meta = fetch_metadata_online(search_query)
        if online_meta:
            metadata.update({k: v for k, v in online_meta.items() if v})
            if progress_callback:
                progress_callback(f"Metadata found: {metadata.get('artist')} - {metadata.get('title')}")

    # 3. Write ID3 Tags
    try:
        audio = MP3(audio_path, ID3=ID3)
        if audio.tags is None:
            audio.add_tags()
            
        audio.tags.add(TBPM(encoding=3, text=str(bpm_val)))
        audio.tags.add(TKEY(encoding=3, text=key_val))
        
        if metadata:
            if metadata.get('title'):
                audio.tags.add(TIT2(encoding=3, text=metadata['title']))
            if metadata.get('artist'):
                audio.tags.add(TPE1(encoding=3, text=metadata['artist']))
            if metadata.get('album'):
                audio.tags.add(TALB(encoding=3, text=metadata['album']))
            
            if metadata.get('cover_url'):
                try:
                    img_data = requests.get(metadata['cover_url'], timeout=5).content
                    audio.tags.add(
                        APIC(
                            encoding=3, 
                            mime='image/jpeg', 
                            type=3,
                            desc='Cover',
                            data=img_data
                        )
                    )
                except Exception as img_err:
                    print(f"Failed to fetch cover art: {img_err}")

        audio.save()
    except Exception as e:
        print(f"Failed to write ID3 tags: {e}")

    # 4. Format & Rename File
    if metadata.get('artist') and metadata.get('title'):
        title_part = f"{metadata['artist']} - {metadata['title']}"
    else:
        title_part = base_name

    new_name = title_part

    if bpm_prefix:
        new_name = f"[{bpm_val} BPM] {new_name}"
    if bpm_suffix:
        new_name = f"{new_name} ({bpm_val} BPM)"

    new_filename = f"{new_name}.mp3"
    new_filepath = os.path.join(dir_name, new_filename)
    
    if new_filepath != audio_path:
        if progress_callback: 
            progress_callback(f"Renaming to: {new_filename}")
        if os.path.exists(new_filepath):
            os.remove(new_filepath)
        os.rename(audio_path, new_filepath)
        return new_filepath
        
    return audio_path
