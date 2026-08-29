use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use rustypipe::client::RustyPipe;
use std::path::PathBuf;
use reqwest;

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
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    job_id: String,
    status: String,
    progress: String,
}

#[tauri::command]
async fn start_download(app: AppHandle, req: DownloadReq) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let job_id = format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    let job_id_clone = job_id.clone();
    
    // Internal helper for logging
    let app_for_log = app.clone();
    let url_clone = req.url.clone();
    
    tauri::async_runtime::spawn(async move {
        // Logging helper macro-like closure
        let do_log = |msg: String| {
            // Read settings if we had them or just assume true for now, 
            // wait, we can just write log if settings exist, but we will handle this in frontend.
            // Actually, we'll let frontend decide when to call write_log except for internal errors.
            // Let's emit log events so frontend can write them.
            let _ = app_for_log.emit("backend-log", msg);
        };
        
        do_log(format!("Starting download process for URL: {}", url_clone));
        let _ = app.emit("download-progress", ProgressPayload {
            job_id: job_id_clone.clone(),
            status: "downloading".to_string(),
            progress: "10%".to_string(),
        });
        
        let rp = RustyPipe::new();
        let video_id = extract_video_id(&req.url);
        
        let info = match rp.query().video_details(&video_id).await {
            Ok(i) => {
                do_log(format!("Successfully fetched video info: {}", i.name));
                i
            },
            Err(e) => {
                do_log(format!("ERROR: Failed to get video info: {}", e));
                let _ = app.emit("download-progress", ProgressPayload { job_id: job_id_clone.clone(), status: "error".to_string(), progress: e.to_string() });
                return;
            }
        };

        let player = match rp.query().player(&video_id).await {
            Ok(p) => p,
            Err(e) => {
                do_log(format!("ERROR: Failed to get player streams: {}", e));
                let _ = app.emit("download-progress", ProgressPayload { job_id: job_id_clone.clone(), status: "error".to_string(), progress: e.to_string() });
                return;
            }
        };

        let base_dir = req.audio_dir.unwrap_or_else(|| "/storage/emulated/0/Download".to_string());
        let base_dir = base_dir.replace("~", "/storage/emulated/0");
        let safe_title = info.name.replace("/", "_").replace("\\", "_");

        let mut success = true;
        let mut last_err = String::new();

        let client = reqwest::Client::new();

        for format in req.formats {
            let _ = app.emit("download-progress", ProgressPayload {
                job_id: job_id_clone.clone(),
                status: "downloading".to_string(),
                progress: format!("Downloading {}...", format.to_uppercase()),
            });

            let is_audio = format == "mp3";
            do_log(format!("Preparing to download format: {}", format));
            
            let stream_url = if is_audio {
                player.audio_streams.first().map(|s| s.url.clone())
            } else {
                player.video_streams.first().map(|s| s.url.clone())
            };
            
            let Some(stream_url) = stream_url else {
                let err_msg = "Video source empty: No stream found";
                do_log(format!("ERROR: {}", err_msg));
                success = false;
                last_err = err_msg.to_string();
                continue;
            };

            let ext = if is_audio { "mp3" } else { "mp4" };
            let path = PathBuf::from(&base_dir).join(format!("{}.{}", safe_title, ext));
            do_log(format!("Starting download to path: {:?}", path));

            match client.get(&stream_url).send().await {
                Ok(mut response) => {
                    if response.status().is_success() {
                        use tokio::io::AsyncWriteExt;
                        match tokio::fs::File::create(&path).await {
                            Ok(mut file) => {
                                let mut file_success = true;
                                while let Ok(Some(chunk)) = response.chunk().await {
                                    if let Err(e) = file.write_all(&chunk).await {
                                        do_log(format!("ERROR writing to file: {}", e));
                                        file_success = false;
                                        break;
                                    }
                                }
                                if file_success {
                                    do_log(format!("SUCCESS: Download completed for format {}", format));
                                } else {
                                    success = false;
                                    last_err = "Error writing file chunk".to_string();
                                }
                            },
                            Err(e) => {
                                do_log(format!("ERROR: Failed to create file {:?}: {}", path, e));
                                success = false;
                                last_err = e.to_string();
                            }
                        }
                    } else {
                        do_log(format!("ERROR: Request failed with status {}", response.status()));
                        success = false;
                        last_err = format!("HTTP error {}", response.status());
                    }
                },
                Err(e) => {
                    do_log(format!("ERROR: Download request failed: {}", e));
                    success = false;
                    last_err = e.to_string();
                }
            }
        }

        if success {
            let _ = app.emit("download-progress", ProgressPayload {
                job_id: job_id_clone.clone(),
                status: "completed".to_string(),
                progress: "Done".to_string(),
            });
        } else {
            let _ = app.emit("download-progress", ProgressPayload {
                job_id: job_id_clone.clone(),
                status: "error".to_string(),
                progress: last_err,
            });
        }
    });
    
    Ok(job_id)
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
fn open_path(_path: String) -> Result<(), String> {
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
        .invoke_handler(tauri::generate_handler![
            search_youtube, get_info, start_download, check_updates, update_plugins, open_path, check_shared_intent, write_log, read_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
