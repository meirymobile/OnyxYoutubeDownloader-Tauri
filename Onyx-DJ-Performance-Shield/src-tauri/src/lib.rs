use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::Mutex;
use lazy_static::lazy_static;

lazy_static! {
    static ref CAFFEINATE_CHILD: Mutex<Option<Child>> = Mutex::new(None);
    static ref SHIELD_ACTIVE: Mutex<bool> = Mutex::new(false);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub pid: u32,
    pub name: String,
    pub bundle_id: String,
    pub mem_mb: f64,
    pub is_dj_app: bool,
    pub is_protected: bool,
    pub category: String, // "dj", "browser", "chat", "media", "system", "other"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminateResult {
    pub closed_count: usize,
    pub freed_mem_mb: f64,
    pub closed_names: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMemoryInfo {
    pub total_gb: f64,
    pub used_gb: f64,
    pub free_gb: f64,
}

// Check if an app is recognized DJ / Music Production software
fn is_known_dj_app(name: &str, bundle_id: &str) -> bool {
    let n = name.to_lowercase();
    let b = bundle_id.to_lowercase();

    let dj_names = [
        "serato", "rekordbox", "traktor", "virtualdj", "djay", "onyx",
        "mixed in key", "ableton", "logic pro", "cubase", "fl studio",
        "pro tools", "studio one", "audacity", "maschine", "engine prime",
        "engine dj", "apple music", "music", "spotify"
    ];

    for term in dj_names {
        if n.contains(term) || b.contains(term) {
            return true;
        }
    }
    false
}

// Categorize app for quick filters
fn categorize_app(name: &str, bundle_id: &str, is_dj: bool) -> String {
    if is_dj {
        return "dj".to_string();
    }
    let n = name.to_lowercase();
    let b = bundle_id.to_lowercase();

    if n.contains("chrome") || n.contains("safari") || n.contains("firefox") || n.contains("brave") || n.contains("edge") || n.contains("arc") || n.contains("opera") {
        return "browser".to_string();
    }
    if n.contains("whatsapp") || n.contains("telegram") || n.contains("signal") || n.contains("messages") || n.contains("slack") || n.contains("discord") || n.contains("zoom") || n.contains("teams") || n.contains("skype") {
        return "chat".to_string();
    }
    if n.contains("finder") || n.contains("activity monitor") || n.contains("terminal") || n.contains("settings") {
        return "system".to_string();
    }
    if b.contains("media") || n.contains("vlc") || n.contains("quicktime") || n.contains("iina") {
        return "media".to_string();
    }
    "other".to_string()
}

// Determine if app is protected from being terminated
fn is_protected_app(name: &str, bundle_id: &str, current_pid: u32, target_pid: u32) -> bool {
    if target_pid == current_pid {
        return true;
    }
    let n = name.to_lowercase();
    let b = bundle_id.to_lowercase();

    if n == "finder" || b == "com.apple.finder" {
        return true;
    }
    if n.contains("onyx") || b.contains("onyx") || n.contains("performance shield") {
        return true;
    }
    false
}

#[tauri::command]
fn get_running_gui_apps() -> Result<Vec<AppInfo>, String> {
    let current_pid = std::process::id();

    // 1. Fetch RSS memory for all processes in KB using `ps -eo pid,rss`
    let mut mem_map: HashMap<u32, f64> = HashMap::new();
    if let Ok(ps_out) = Command::new("ps").args(&["-eo", "pid,rss"]).output() {
        if let Ok(s) = String::from_utf8(ps_out.stdout) {
            for line in s.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    if let (Ok(pid), Ok(rss)) = (parts[0].parse::<u32>(), parts[1].parse::<f64>()) {
                        mem_map.insert(pid, rss / 1024.0); // Convert KB to MB
                    }
                }
            }
        }
    }

    // 2. Fetch GUI Apps (background only is false) via AppleScript System Events
    let script = r#"
tell application "System Events"
    set res to {}
    repeat with p in (every process whose background only is false)
        try
            set bId to bundle identifier of p
        on error
            set bId to ""
        end try
        set end of res to (name of p & ":::" & unix id of p & ":::" & bId)
    end repeat
    return res
end tell
"#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to run AppleScript: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let mut apps: Vec<AppInfo> = Vec::new();

    // AppleScript returns comma-separated strings
    for item in raw.split(", ") {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split(":::").collect();
        if parts.len() >= 2 {
            let name = parts[0].trim().to_string();
            let pid = parts[1].trim().parse::<u32>().unwrap_or(0);
            let bundle_id = if parts.len() >= 3 { parts[2].trim().to_string() } else { "".to_string() };

            if pid == 0 {
                continue;
            }

            let mem_mb = *mem_map.get(&pid).unwrap_or(&0.0);
            let is_dj = is_known_dj_app(&name, &bundle_id);
            let is_protected = is_protected_app(&name, &bundle_id, current_pid, pid);
            let category = categorize_app(&name, &bundle_id, is_dj);

            apps.push(AppInfo {
                pid,
                name,
                bundle_id,
                mem_mb,
                is_dj_app: is_dj,
                is_protected,
                category,
            });
        }
    }

    // Sort: DJ apps first, then by memory descending
    apps.sort_by(|a, b| {
        if a.is_dj_app != b.is_dj_app {
            b.is_dj_app.cmp(&a.is_dj_app)
        } else {
            b.mem_mb.partial_cmp(&a.mem_mb).unwrap_or(std::cmp::Ordering::Equal)
        }
    });

    Ok(apps)
}

#[tauri::command]
fn terminate_apps(pids: Vec<u32>, force: bool) -> Result<TerminateResult, String> {
    let current_pid = std::process::id();
    let mut closed_count = 0;
    let mut freed_mem_mb = 0.0;
    let mut closed_names = Vec::new();
    let mut errors = Vec::new();

    // Fetch memory map again for accuracy
    let mut mem_map: HashMap<u32, f64> = HashMap::new();
    if let Ok(ps_out) = Command::new("ps").args(&["-eo", "pid,rss,comm"]).output() {
        if let Ok(s) = String::from_utf8(ps_out.stdout) {
            for line in s.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    if let (Ok(pid), Ok(rss)) = (parts[0].parse::<u32>(), parts[1].parse::<f64>()) {
                        mem_map.insert(pid, rss / 1024.0);
                    }
                }
            }
        }
    }

    for pid in pids {
        // Protect current app and PID 0/1
        if pid <= 1 || pid == current_pid {
            continue;
        }

        let mem = *mem_map.get(&pid).unwrap_or(&0.0);

        // Try graceful SIGTERM (15) first, then SIGKILL (9) if requested
        let sig = if force { "-9" } else { "-15" };
        let kill_res = Command::new("kill").args(&[sig, &pid.to_string()]).output();

        match kill_res {
            Ok(output) if output.status.success() => {
                closed_count += 1;
                freed_mem_mb += mem;
                closed_names.push(format!("PID {}", pid));
            }
            Ok(output) => {
                let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
                if !err_msg.trim().is_empty() {
                    errors.push(format!("PID {}: {}", pid, err_msg.trim()));
                }
            }
            Err(e) => {
                errors.push(format!("PID {}: {}", pid, e));
            }
        }
    }

    Ok(TerminateResult {
        closed_count,
        freed_mem_mb,
        closed_names,
        errors,
    })
}

#[tauri::command]
fn set_caffeinate(enable: bool) -> Result<bool, String> {
    let mut guard = CAFFEINATE_CHILD.lock().unwrap();

    if enable {
        if guard.is_none() {
            match Command::new("caffeinate")
                .args(&["-d", "-i", "-m", "-u"])
                .spawn() 
            {
                Ok(child) => {
                    *guard = Some(child);
                    println!("[Onyx Shield] Caffeinate process started (sleep prevention active)");
                }
                Err(e) => return Err(format!("Failed to start caffeinate: {}", e)),
            }
        }
    } else {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            println!("[Onyx Shield] Caffeinate process stopped (sleep restored)");
        }
    }

    Ok(enable)
}

#[tauri::command]
fn set_focus_mode(enable: bool) -> Result<bool, String> {
    // Attempt Focus shortcut or ControlCenter toggle
    if enable {
        let _ = Command::new("shortcuts").args(&["run", "Focus"]).spawn();
    }
    Ok(enable)
}

#[tauri::command]
fn get_system_memory() -> Result<SystemMemoryInfo, String> {
    // 1. Total RAM via sysctl hw.memsize
    let mut total_gb = 16.0;
    if let Ok(out) = Command::new("sysctl").args(&["-n", "hw.memsize"]).output() {
        if let Ok(s) = String::from_utf8(out.stdout) {
            if let Ok(bytes) = s.trim().parse::<f64>() {
                total_gb = bytes / (1024.0 * 1024.0 * 1024.0);
            }
        }
    }

    // 2. Used / Free RAM approximation via vm_stat
    let mut free_pages: f64 = 0.0;
    let mut page_size: f64 = 4096.0;

    if let Ok(out) = Command::new("vm_stat").output() {
        if let Ok(s) = String::from_utf8(out.stdout) {
            for line in s.lines() {
                if line.starts_with("page size of") {
                    if let Some(sz) = line.split_whitespace().nth(3) {
                        if let Ok(p) = sz.trim_end_matches('.').parse::<f64>() {
                            page_size = p;
                        }
                    }
                } else if line.starts_with("Pages free:") {
                    if let Some(cnt) = line.split_whitespace().nth(2) {
                        if let Ok(p) = cnt.trim_end_matches('.').parse::<f64>() {
                            free_pages += p;
                        }
                    }
                } else if line.starts_with("Pages speculative:") {
                    if let Some(cnt) = line.split_whitespace().nth(2) {
                        if let Ok(p) = cnt.trim_end_matches('.').parse::<f64>() {
                            free_pages += p;
                        }
                    }
                }
            }
        }
    }

    let free_gb = (free_pages * page_size) / (1024.0 * 1024.0 * 1024.0);
    let used_gb = (total_gb - free_gb).max(0.0);

    Ok(SystemMemoryInfo {
        total_gb: (total_gb * 10.0).round() / 10.0,
        used_gb: (used_gb * 10.0).round() / 10.0,
        free_gb: (free_gb * 10.0).round() / 10.0,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_running_gui_apps,
            terminate_apps,
            set_caffeinate,
            set_focus_mode,
            get_system_memory
        ])
        .run(tauri::generate_context!())
        .expect("error while running Onyx DJ Performance Shield");
}
