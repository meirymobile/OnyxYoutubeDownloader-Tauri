import os
import time
import subprocess
import asyncio
import tempfile
import re
from typing import List, Dict, Any, Callable, Optional

from downloader import download_video, get_video_info
from metadata_enricher import enrich_and_rename_file
from playlist_generator import create_dj_playlist_pack, extract_track_info_from_file

def get_audio_duration(audio_path: str) -> float:
    try:
        res = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True, check=True
        )
        return float(res.stdout.strip())
    except:
        return 0.0

async def recognize_snippet_async(shazam, snippet_path: str) -> Optional[Dict[str, str]]:
    try:
        out = await shazam.recognize(snippet_path)
        track = out.get('track')
        if track:
            title = track.get('title', '')
            artist = track.get('subtitle', '')
            shazam_id = track.get('key', '')
            if title and artist:
                return {
                    'title': title,
                    'artist': artist,
                    'shazam_id': shazam_id
                }
    except Exception as e:
        print(f"Shazam snippet recognition error: {e}")
    return None

async def recognize_snippet_batch_async(shazam, batch: List[tuple]) -> List[Optional[Dict[str, Any]]]:
    """Recognize a small batch of audio snippets concurrently."""
    async def _rec(snippet_path, ts):
        try:
            out = await shazam.recognize(snippet_path)
            track = out.get('track')
            if track:
                title = track.get('title', '')
                artist = track.get('subtitle', '')
                shazam_id = track.get('key', '')
                if title and artist:
                    return {
                        'title': title,
                        'artist': artist,
                        'shazam_id': shazam_id,
                        'timestamp': ts
                    }
        except Exception as e:
            print(f"Shazam snippet recognition error at {ts}s: {e}")
        return None
    tasks = [_rec(path, ts) for path, ts in batch]
    return await asyncio.gather(*tasks)

def scan_audio_with_shazam(
    audio_path: str, 
    sample_duration: int = 12, 
    sample_interval: int = 90, 
    progress_callback: Optional[Callable[[str], None]] = None
) -> List[Dict[str, Any]]:
    duration = get_audio_duration(audio_path)
    if duration <= 0:
        return []

    async def _run_all_batches(snippets):
        from shazamio import Shazam
        shazam = Shazam()
        recognized_tracks = []
        batch_size = 5
        total_snippets = len(snippets)

        for i in range(0, total_snippets, batch_size):
            batch = snippets[i:i + batch_size]
            completed_count = min(i + batch_size, total_snippets)
            pct = 50 + int((completed_count / total_snippets) * 50)
            
            if progress_callback:
                progress_callback(f"Shazam AI scanning: {completed_count}/{total_snippets} snippets ({pct}%) | Identified: {len(recognized_tracks)} tracks")

            tasks = [recognize_snippet_batch_async(shazam, [(p, t)]) for p, t in batch]
            batch_results = await asyncio.gather(*tasks)

            for match_list in batch_results:
                match = match_list[0] if match_list else None
                if match:
                    # Avoid adding identical consecutive track
                    if not recognized_tracks or recognized_tracks[-1]['shazam_id'] != match['shazam_id']:
                        recognized_tracks.append(match)
                        if progress_callback:
                            progress_callback(f"★ Identified Track #{len(recognized_tracks)}: {match['artist']} - {match['title']} (at {match['timestamp']}s)")

            await asyncio.sleep(0.3)
            
        return recognized_tracks
        
    # Timestamps every `sample_interval` seconds
    timestamps = list(range(0, int(duration), max(10, sample_interval)))
    total_samples = len(timestamps)
    
    if progress_callback:
        progress_callback(f"Starting Shazam AI set analysis ({total_samples} timestamps)...")

    snippet_data = []
    with tempfile.TemporaryDirectory() as temp_dir:
        for idx, ts in enumerate(timestamps):
            snippet_path = os.path.join(temp_dir, f"sample_{idx}.mp3")
            pct = int(((idx + 1) / total_samples) * 50)
            if progress_callback and (idx % 5 == 0 or idx == total_samples - 1):
                progress_callback(f"Extracting audio snippets: {idx+1}/{total_samples} ({pct}%)")
            
            cmd = [
                "ffmpeg", "-y", "-ss", str(ts), "-t", str(sample_duration),
                "-i", audio_path, "-ac", "2", "-ar", "44100", snippet_path
            ]
            subprocess.run(cmd, capture_output=True)
            if os.path.exists(snippet_path) and os.path.getsize(snippet_path) > 0:
                snippet_data.append((snippet_path, ts))

        if progress_callback:
            progress_callback(f"Extracted {len(snippet_data)} snippets. Querying Shazam AI engine in batches...")

        recognized_tracks = asyncio.run(_run_all_batches(snippet_data))

    if progress_callback:
        progress_callback(f"Shazam scanning complete: {len(recognized_tracks)} unique tracks identified!")

    return recognized_tracks

def extract_and_download_shazam_set(
    set_audio_path: str,
    output_dir: str,
    set_title: Optional[str] = None,
    sample_duration: int = 12,
    sample_interval: int = 90,
    spotify: bool = True,
    bpm_prefix: bool = False,
    bpm_suffix: bool = False,
    progress_callback: Optional[Callable[[str], None]] = None,
    download_delay: int = 0
) -> Dict[str, Any]:
    # Determine safe subfolder name for set
    raw_name = set_title or os.path.splitext(os.path.basename(set_audio_path))[0]
    safe_name = "".join([c for c in raw_name if c.isalnum() or c in (' ', '_', '-')]).strip()
    if not safe_name:
        safe_name = "Shazam_Liveset"

    set_dir = os.path.join(output_dir, safe_name)
    os.makedirs(set_dir, exist_ok=True)

    # 1. Scan set with Shazam
    matches = scan_audio_with_shazam(set_audio_path, sample_duration, sample_interval, progress_callback)
    
    if not matches:
        if progress_callback:
            progress_callback("Notice: No published Shazam database matches in this mix (likely unreleased/bootleg tracks). Saving full set file.")
        # Move original audio to set_dir
        dest_audio = os.path.join(set_dir, os.path.basename(set_audio_path))
        if set_audio_path != dest_audio and os.path.exists(set_audio_path):
            os.rename(set_audio_path, dest_audio)
        return {"tracks": [dest_audio], "playlist_m3u8": None, "cue": None}

    if progress_callback:
        progress_callback(f"Identified {len(matches)} unique tracks. Fetching full HQ studio versions into folder '{safe_name}'...")

    downloaded_tracks = []
    downloaded_matches = []
    
    # 2. Search & Download full studio HQ versions for each identified track into set_dir
    for idx, match in enumerate(matches):
        query = f"{match['artist']} - {match['title']} HQ audio"
        search_url = f"ytsearch1:{query}"
        
        if progress_callback:
            progress_callback(f"Fetching HQ ({idx+1}/{len(matches)}): {match['artist']} - {match['title']}")
            
        try:
            track_path = download_video(search_url, set_dir, format_type="audio", download_delay=download_delay)
            
            # Enrich ID3 & metadata with known Shazam artist & title
            enriched_path = enrich_and_rename_file(
                track_path,
                spotify=spotify,
                bpm_prefix=bpm_prefix,
                bpm_suffix=bpm_suffix,
                known_artist=match.get('artist'),
                known_title=match.get('title'),
                progress_callback=progress_callback
            )

            downloaded_tracks.append(enriched_path)
            downloaded_matches.append(match)
        except Exception as e:
            print(f"Failed to download HQ track '{query}': {e}")

    # 3. Create DJ Playlist pack inside the dedicated set_dir
    playlist_m3u8 = None
    if downloaded_tracks:
        if progress_callback:
            progress_callback("Generating DJ Playlist Pack (.m3u8, .cue, .txt)...")
        tracks_info = []
        for track, match in zip(downloaded_tracks, downloaded_matches):
            ts = float(match.get('timestamp', 0.0))
            info = extract_track_info_from_file(track, start_time=ts)
            tracks_info.append(info)
            
        pack_files = create_dj_playlist_pack(set_dir, safe_name, tracks_info)
        playlist_m3u8 = pack_files.get("m3u8")

    # Clean up full original set audio file if set_dir contains individual tracks
    if os.path.exists(set_audio_path) and os.path.dirname(set_audio_path) != set_dir:
        try:
            os.remove(set_audio_path)
        except:
            pass

    return {
        "tracks": downloaded_tracks,
        "playlist_m3u8": playlist_m3u8,
        "matches": matches,
        "set_dir": set_dir
    }
