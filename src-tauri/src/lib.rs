use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use rustypipe::client::RustyPipe;
use std::path::PathBuf;
use reqwest;

mod audio_engine;
mod link_sync;
#[derive(Serialize)]
struct SearchResult {
    id: String,
    title: String,
    url: String,
    thumbnails: Vec<Thumbnail>,
}

#[derive(Serialize)]
struct Thumbnail {
    url: String,
}

#[derive(Serialize)]
struct VideoInfo {
    title: String,
    uploader: String,
    thumbnail: String,
    original_url: String,
}

#[tauri::command]
async fn search_youtube(q: String) -> Result<Vec<SearchResult>, String> {
    let rp = RustyPipe::new();
    let res = rp.query().search(q).await.map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for item in res.items.items {
        if let rustypipe::model::YouTubeItem::Video(v) = item {
            let thumbs = v.thumbnail.into_iter().map(|t| Thumbnail { url: t.url }).collect();
            results.push(SearchResult {
                id: v.id.clone(),
                title: v.name,
                url: format!("https://youtube.com/watch?v={}", v.id),
                thumbnails: thumbs,
            });
        }
    }
    Ok(results)
}

fn extract_video_id(url: &str) -> String {
    if url.contains("v=") {
        url.split("v=").nth(1).unwrap_or("").split('&').next().unwrap_or("").to_string()
    } else if url.contains("youtu.be/") {
        url.split("youtu.be/").nth(1).unwrap_or("").split('?').next().unwrap_or("").to_string()
    } else {
        url.to_string()
    }
}

#[tauri::command]
async fn get_info(url: String) -> Result<VideoInfo, String> {
    let rp = RustyPipe::new();
    let video_id = extract_video_id(&url);
    
    let info = rp.query().video_details(&video_id).await.map_err(|e| e.to_string())?;
    let thumb = format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", video_id);
    
    Ok(VideoInfo {
        title: info.name,
        uploader: info.channel.name,
        thumbnail: thumb,
        original_url: url,
    })
}

#[derive(Deserialize)]
struct DownloadReq {
    url: String,
    formats: Vec<String>,
    audio_dir: Option<String>,
    video_dir: Option<String>,
    onyx_dir: Option<String>,
    spotify: Option<bool>,
    bpm_prefix: Option<bool>,
    bpm_suffix: Option<bool>,
    auto_split: Option<bool>,
    playlist: Option<bool>,
    shazam_extract: Option<bool>,
    shazam_sample_duration: Option<u32>,
    shazam_sample_interval: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct ITunesTrackInfo {
    artist_name: String,
    track_name: String,
    collection_name: String,
    artwork_url_600: String,
}

async fn fetch_itunes_metadata(query: &str) -> Option<ITunesTrackInfo> {
    let client = reqwest::Client::new();
    let url = format!("https://itunes.apple.com/search?term={}&entity=song&limit=1", urlencoding::encode(query));
    if let Ok(res) = client.get(&url).send().await {
        if let Ok(json) = res.json::<serde_json::Value>().await {
            if let Some(results) = json.get("results").and_then(|r| r.as_array()) {
                if let Some(first) = results.first() {
                    let artist = first.get("artistName").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let track = first.get("trackName").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let collection = first.get("collectionName").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let art_raw = first.get("artworkUrl100").and_then(|v| v.as_str()).unwrap_or("");
                    let art_600 = art_raw.replace("100x100bb", "600x600bb");
                    return Some(ITunesTrackInfo {
                        artist_name: artist,
                        track_name: track,
                        collection_name: collection,
                        artwork_url_600: art_600,
                    });
                }
            }
        }
    }
    None
}

fn create_dj_playlist_pack(folder_path: &PathBuf, set_title: &str, track_files: &[String]) {
    use std::io::Write;
    
    // 1. Generate .m3u8
    let m3u8_path = folder_path.join(format!("{}.m3u8", set_title));
    if let Ok(mut f) = std::fs::File::create(&m3u8_path) {
        let _ = writeln!(f, "#EXTM3U");
        for file in track_files {
            let _ = writeln!(f, "#EXTINF:-1,{}", file);
            let _ = writeln!(f, "{}", file);
        }
    }

    // 2. Generate .cue
    let cue_path = folder_path.join(format!("{}.cue", set_title));
    if let Ok(mut f) = std::fs::File::create(&cue_path) {
        let _ = writeln!(f, "TITLE \"{}\"", set_title);
        let _ = writeln!(f, "FILE \"Tracklist\" MP3");
        for (i, file) in track_files.iter().enumerate() {
            let _ = writeln!(f, "  TRACK {:02} AUDIO", i + 1);
            let _ = writeln!(f, "    TITLE \"{}\"", file);
            let _ = writeln!(f, "    INDEX 01 00:00:00");
        }
    }

    // 3. Generate Tracklist.txt
    let txt_path = folder_path.join(format!("{}-Tracklist.txt", set_title));
    if let Ok(mut f) = std::fs::File::create(&txt_path) {
        let _ = writeln!(f, "=== {} - Official DJ Tracklist ===", set_title);
        for (i, file) in track_files.iter().enumerate() {
            let _ = writeln!(f, "{:02}. {}", i + 1, file);
        }
    }
}


#[derive(Serialize, Clone)]
struct LogPayload {
    job_id: String,
    msg: String,
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    job_id: String,
    status: String,
    progress: String,
}

use tauri_plugin_shell::ShellExt;

#[tauri::command]
async fn start_download(app: AppHandle, req: DownloadReq) -> Result<String, String> {
    Err("Not using native download anymore. Using Python backend.".to_string())
}

#[tauri::command]
fn check_updates() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "update_available": false }))
}

#[tauri::command]
fn update_plugins() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        let path = std::path::Path::new(&path);
        if let Some(parent) = path.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn check_shared_intent(app: AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;
    let cache_dir = app.path().cache_dir().map_err(|e| e.to_string())?;
    let files_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    
    let path1 = cache_dir.join("shared_intent.txt");
    let path2 = files_dir.join("shared_intent.txt");
    
    if path1.exists() {
        let content = std::fs::read_to_string(&path1).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(path1);
        return Ok(Some(content));
    }
    
    if path2.exists() {
        let content = std::fs::read_to_string(&path2).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(path2);
        return Ok(Some(content));
    }
    
    Ok(None)
}

#[tauri::command]
fn read_log(log_dir: String) -> Result<String, String> {
    use std::path::PathBuf;
    
    let dir = if log_dir.is_empty() {
        "/storage/emulated/0/Download".to_string()
    } else {
        log_dir.replace("~", "/storage/emulated/0")
    };
    
    let path = PathBuf::from(dir).join("onyx_debug.log");
    if path.exists() {
        std::fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok("Log file does not exist yet.".to_string())
    }
}

#[tauri::command]
fn print_log(msg: String) {
    println!("[Frontend] {}", msg);
}

#[tauri::command]
fn open_mixer_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if app.get_webview_window("mixer").is_none() {
        tauri::WebviewWindowBuilder::new(&app, "mixer", tauri::WebviewUrl::App("index.html?mixer=true".into()))
            .title("Onyx Live Mixer")
            .inner_size(1000.0, 800.0)
            .build()
            .map_err(|e| e.to_string())?;
    } else {
        let window = app.get_webview_window("mixer").unwrap();
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_mixer_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("mixer") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn write_log(message: String, log_dir: String, max_size_mb: u64) -> Result<(), String> {
    use std::fs::{OpenOptions, metadata};
    use std::io::Write;
    use std::path::PathBuf;
    
    // Default to a fallback if empty
    let dir = if log_dir.is_empty() {
        "/storage/emulated/0/Download".to_string()
    } else {
        log_dir.replace("~", "/storage/emulated/0")
    };
    
    let path = PathBuf::from(dir).join("onyx_debug.log");
    
    // Check file size and truncate if larger than max_size_mb
    if let Ok(meta) = metadata(&path) {
        let size_mb = meta.len() / (1024 * 1024);
        if size_mb >= max_size_mb {
            let _ = std::fs::remove_file(&path);
        }
    }
    
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
        
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
        
    writeln!(file, "[{}] {}", timestamp, message).map_err(|e| e.to_string())?;
    
    Ok(())
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Ensure no leftover zombie Python servers are running from previous crashes
            std::process::Command::new("pkill").arg("-f").arg("backend_server").output().ok();
            
            if let Ok(cmd) = app.shell().sidecar("backend_server") {
                if let Ok((_rx, child)) = cmd.spawn() {
                    println!("🚀 Python Backend Sidecar spawned with PID {}", child.pid());
                } else {
                    println!("❌ Failed to spawn Python Backend Sidecar");
                }
            }
            Ok(())
        })


        .invoke_handler(tauri::generate_handler![
            search_youtube, get_info, start_download, check_updates, update_plugins, open_path, check_shared_intent, write_log, print_log, read_log, open_mixer_window, close_mixer_window,
            audio_engine::get_audio_devices, audio_engine::start_audio_routing, audio_engine::install_blackhole,
            link_sync::toggle_link, link_sync::get_link_status, link_sync::get_link_phase
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

