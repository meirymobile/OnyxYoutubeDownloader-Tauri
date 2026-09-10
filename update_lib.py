import re

with open("src-tauri/src/lib.rs", "r") as f:
    code = f.read()

# Add get_djay_tracks_native command
new_cmd = """
use libloading::{Library, Symbol};
use std::ffi::CStr;
use std::os::raw::c_char;

#[tauri::command]
fn get_djay_tracks_native(app: tauri::AppHandle) -> Result<String, String> {
    unsafe {
        let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
        let dylib_path = resource_dir.join("djay_reader.dylib");
        
        let lib = Library::new(dylib_path).map_err(|e| e.to_string())?;
        let func: Symbol<unsafe extern "C" fn() -> *mut c_char> = lib.get(b"get_djay_tracks_json").map_err(|e| e.to_string())?;
        
        let ptr = func();
        if ptr.is_null() {
            return Err("Failed to get tracks".to_string());
        }
        let c_str = CStr::from_ptr(ptr);
        let s = c_str.to_string_lossy().into_owned();
        libc::free(ptr as *mut libc::c_void);
        Ok(s)
    }
}
"""

if "fn get_djay_tracks_native" not in code:
    code = code.replace("pub fn run() {", new_cmd + "\n#[cfg_attr(mobile, tauri::mobile_entry_point)]\npub fn run() {")
    code = code.replace("invoke_handler(tauri::generate_handler![", "invoke_handler(tauri::generate_handler![\n            get_djay_tracks_native,")
    
    with open("src-tauri/src/lib.rs", "w") as f:
        f.write(code)
    print("lib.rs updated")
else:
    print("Already updated")
