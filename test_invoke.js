const { invoke } = require('@tauri-apps/api/core');
invoke('get_djay_tracks_native').then(console.log).catch(console.error);
