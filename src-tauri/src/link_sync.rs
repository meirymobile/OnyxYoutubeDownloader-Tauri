use rusty_link::{AblLink, SessionState};
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;

lazy_static! {
    static ref LINK_STATE: Arc<Mutex<Option<AblLink>>> = Arc::new(Mutex::new(None));
}

#[tauri::command]
pub fn toggle_link(enabled: bool) -> Result<String, String> {
    let mut state = LINK_STATE.lock().unwrap();
    
    if enabled {
        if state.is_none() {
            let mut link = AblLink::new(120.0);
            link.enable(true);
            *state = Some(link);
            println!("Ableton Link Enabled!");
        }
    } else {
        *state = None;
        println!("Ableton Link Disabled!");
    }
    
    Ok("Success".to_string())
}

#[tauri::command]
pub fn get_link_status() -> Result<(bool, f64, i32), String> {
    let state = LINK_STATE.lock().unwrap();
    if let Some(link) = state.as_ref() {
        let mut session_state = SessionState::new();
        link.capture_app_session_state(&mut session_state);
        let tempo = session_state.tempo();
        let peers = link.num_peers();
        Ok((true, tempo, peers as i32))
    } else {
        Ok((false, 0.0, 0))
    }
}

#[tauri::command]
pub fn get_link_phase() -> Result<(f64, f64), String> {
    let state = LINK_STATE.lock().unwrap();
    if let Some(link) = state.as_ref() {
        let mut session_state = SessionState::new();
        link.capture_app_session_state(&mut session_state);
        let time = link.clock_micros();
        let phase = session_state.phase_at_time(time, 4.0);
        let tempo = session_state.tempo();
        Ok((phase, tempo))
    } else {
        Ok((0.0, 120.0))
    }
}
