use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use crossbeam_channel::bounded;
use std::thread;

#[derive(Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub name: String,
    pub is_input: bool,
    pub is_output: bool,
}

#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    let cpal_devices = host.devices().map_err(|e| e.to_string())?;

    for device in cpal_devices {
        if let Ok(name) = device.name() {
            let is_input = device.default_input_config().is_ok();
            let is_output = device.default_output_config().is_ok();
            
            devices.push(AudioDeviceInfo {
                name,
                is_input,
                is_output,
            });
        }
    }

    Ok(devices)
}

#[tauri::command]
pub fn start_audio_routing(input_name: String, output_name: String) -> Result<(), String> {
    println!("Starting audio routing from '{}' to '{}'", input_name, output_name);
    
    thread::spawn(move || {
        let host = cpal::default_host();
        
        let input_device = match host.devices().unwrap().find(|x| x.name().unwrap_or_default() == input_name) {
            Some(dev) => dev,
            None => { eprintln!("Input device not found"); return; }
        };
            
        let output_device = match host.devices().unwrap().find(|x| x.name().unwrap_or_default() == output_name) {
            Some(dev) => dev,
            None => { eprintln!("Output device not found"); return; }
        };

        let input_config = input_device.default_input_config().unwrap();
        let output_config = output_device.default_output_config().unwrap();

        let buffer_size = (input_config.sample_rate().0 as f32 * 0.1) as usize * 2;
        let (tx, rx) = bounded::<f32>(buffer_size);

        let input_stream = match input_config.sample_format() {
            cpal::SampleFormat::F32 => input_device.build_input_stream(
                &input_config.into(),
                move |data: &[f32], _: &_| {
                    for &sample in data {
                        let _ = tx.try_send(sample);
                    }
                },
                |err| eprintln!("input err: {}", err),
                None,
            ).unwrap(),
            _ => { eprintln!("Unsupported input format"); return; }
        };

        let output_stream = match output_config.sample_format() {
            cpal::SampleFormat::F32 => output_device.build_output_stream(
                &output_config.into(),
                move |data: &mut [f32], _: &_| {
                    for sample in data.iter_mut() {
                        *sample = rx.try_recv().unwrap_or(0.0);
                    }
                },
                |err| eprintln!("output err: {}", err),
                None,
            ).unwrap(),
            _ => { eprintln!("Unsupported output format"); return; }
        };

        input_stream.play().unwrap();
        output_stream.play().unwrap();

        // Keep thread alive to keep streams playing
        loop {
            thread::sleep(std::time::Duration::from_secs(1));
        }
    });
    
    println!("Audio routing thread spawned successfully!");

    Ok(())
}

#[tauri::command]
pub fn install_blackhole() -> Result<String, String> {
    use std::process::Command;
    
    let script = r#"
        do shell script "curl -fsSL https://existential.audio/downloads/BlackHole2ch-0.7.1.pkg -o /tmp/BlackHole.pkg && installer -pkg /tmp/BlackHole.pkg -target /" with administrator privileges
    "#;
    
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to run AppleScript: {}", e))?;
        
    if output.status.success() {
        Ok("BlackHole virtual audio cable installed successfully! You may need to restart the app for the new device to appear.".to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("Installation failed: {}", err))
    }
}
