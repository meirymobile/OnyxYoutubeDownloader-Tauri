import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Download, Music, RefreshCw, X, HardDrive, AlertTriangle, ChevronUp, FolderOpen, Activity } from "lucide-react"

const DjayCompanion = () => {
  const [decks, setDecks] = useState([])
  const [errorMsg, setErrorMsg] = useState(null)
  const [dlStates, setDlStates] = useState({})
  const [bpmToggles, setBpmToggles] = useState({})
  
  // Fetch current tracks from backend API
  useEffect(() => {
    const fetchTrack = async () => {
      try {
        const port = localStorage.getItem("onyx_server_port") || 8001;
        const resText = await invoke('get_djay_tracks_native');
        if (resText) {
          const data = JSON.parse(resText);
          if (data.error) {
            setErrorMsg(data.error);
            setDecks([]);
          } else if (data.decks) {
            setErrorMsg(null);
            setDecks(data.decks);
          }
        }
      } catch (err) {
        setErrorMsg(String(err));
        setDecks([]);
        console.warn("Djay API not ready", err);
      }
    };
    
    fetchTrack();
    const interval = setInterval(fetchTrack, 2500);
    return () => clearInterval(interval);
  }, []);
  
  const handleDownload = async (track, deckId) => {
    if (!track.title) return;
    try {
      setDlStates(prev => ({ ...prev, [deckId]: { status: "Downloading", progress: "Initializing..." } }));
      
      const port = localStorage.getItem("onyx_server_port") || 8001;
      
      const savedDirs = localStorage.getItem('onyx_dirs');
      let audioDir = '~/Music/djay_local_cache';
      if (savedDirs) {
        try {
          const parsed = JSON.parse(savedDirs);
          if (parsed.audio_dir && parsed.audio_dir.trim() !== "") {
            audioDir = parsed.audio_dir;
          }
        } catch (e) {
          console.error("Failed to parse dirs", e);
        }
      }
      
      const reqPayload = {
        url: `${track.artist || ""} ${track.title} audio`,
        formats: ["mp3"],
        djay_mode: true,
        analyze_bpm: bpmToggles[deckId] || false,
        audio_dir: audioDir,
        artist: track.artist || undefined,
        title: track.title || undefined
      };
      
      const res = await fetch(`http://127.0.0.1:${port}/api/djay/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqPayload)
      });
      
      const data = await res.json();
      if (data && data.job_id) {
        const jobId = data.job_id;
        
        // Poll for progress
        const poll = setInterval(async () => {
          try {
            const statusRes = await fetch(`http://127.0.0.1:${port}/api/download/${jobId}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === "completed") {
                clearInterval(poll);
                setDlStates(prev => ({ 
                  ...prev, 
                  [deckId]: { 
                    status: "Finished", 
                    progress: "Track Ready!", 
                    result_file: statusData.result_file,
                    result_dir: statusData.result_dir
                  } 
                }));
                setTimeout(() => {
                  setDlStates(prev => {
                    const newState = { ...prev };
                    delete newState[deckId];
                    return newState;
                  });
                }, 3000);
              } else if (statusData.status === "error") {
                clearInterval(poll);
                setDlStates(prev => ({ ...prev, [deckId]: { status: "Error", progress: "Failed." } }));
              } else if (statusData.error) {
                // Job not found or server restarted
                clearInterval(poll);
                setDlStates(prev => {
                  const newState = { ...prev };
                  delete newState[deckId];
                  return newState;
                });
              } else {
                setDlStates(prev => ({ ...prev, [deckId]: { status: "Downloading", progress: statusData.progress || "Processing..." } }));
              }
            } else {
              // Handle non-200 responses if necessary
            }
          } catch (e) {
            console.error(e);
          }
        }, 1500);
      }
    } catch (err) {
      setDlStates(prev => ({ ...prev, [deckId]: { status: "Error", progress: String(err) } }));
      invoke("write_log", { message: `[DjayCompanion] handleDownload error: ${String(err)}` }).catch(console.error);
    }
  };
  
  const handleDrag = async (e) => {
    if (e.buttons === 1 || e.type === "touchstart") {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("start_djay_drag");
      } catch (e) {}
    }
  };

  const closeWindow = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_djay_window");
    } catch (e) {}
  };

  const minimizeToTray = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("minimize_djay_to_tray");
    } catch (e) {}
  };

  const handleOpenPath = async (path) => {
    if (!path) return;
    try {
      const port = localStorage.getItem("onyx_server_port") || 8001;
      await fetch(`http://127.0.0.1:${port}/api/open-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
    } catch (err) {
      console.error('Failed to open path', err);
    }
  };

  const handleOpenDownloadsFolder = () => {
    const savedDirs = localStorage.getItem('onyx_dirs');
    let audioDir = '~/Music/djay_local_cache';
    if (savedDirs) {
      try {
        const parsed = JSON.parse(savedDirs);
        if (parsed.audio_dir && parsed.audio_dir.trim() !== "") {
          audioDir = parsed.audio_dir;
        }
      } catch (e) {}
    }
    handleOpenPath(audioDir);
  };

  return (
    <div className="h-screen w-screen bg-slate-950/80 backdrop-blur-md rounded-xl border border-slate-800 text-white p-3 flex flex-col font-sans overflow-y-auto overflow-x-hidden select-none custom-scrollbar">
      <div className="flex justify-between items-center mb-2 cursor-move shrink-0" onPointerDown={handleDrag} onTouchStart={handleDrag}>
        <div className="flex items-center gap-1.5 pointer-events-none">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
            <Music className="w-2 h-2 text-white" />
          </div>
          <span className="font-bold text-xs tracking-tight text-white/90">DJ Companion</span>
        </div>
        <div className="flex gap-1 items-center">
          <button onClick={handleOpenDownloadsFolder} className="hover:bg-slate-800 p-0.5 rounded transition-colors active:scale-95" title="Open Downloads Folder">
            <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
          </button>
          <button onClick={minimizeToTray} className="hover:bg-slate-800 p-0.5 rounded transition-colors active:scale-95" title="Minimize to Tray">
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button onClick={closeWindow} className="hover:bg-slate-800 p-0.5 rounded transition-colors active:scale-95" title="Close">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col gap-2">
        {errorMsg ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-2 bg-red-950/30 rounded-lg border border-red-900/50">
            <AlertTriangle className="w-6 h-6 text-red-500 mb-1" />
            <span className="text-xs text-red-300">{errorMsg}</span>
          </div>
        ) : decks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-2">
            <span className="text-xs text-slate-500 italic">Listening to djay Pro...</span>
          </div>
        ) : (
          decks.map((deck) => {
            const dlState = dlStates[deck.deck] || { status: "Idle", progress: "" };
            const isPlaying = deck.is_playing === "true";
            return (
              <div key={deck.deck} className="bg-slate-900/50 p-2 rounded-lg border border-slate-800 flex flex-col relative overflow-hidden">
                {isPlaying && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 rounded-l-lg shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                
                <div className="flex justify-between items-start mb-1.5 pl-1.5">
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-[10px] text-slate-400 font-medium truncate">{deck.artist || "Unknown Artist"}</span>
                    <span className="text-xs font-bold text-slate-100 truncate">{deck.title || "Unknown Track"}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => setBpmToggles(prev => ({ ...prev, [deck.deck]: !prev[deck.deck] }))}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors border ${
                        bpmToggles[deck.deck] 
                          ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' 
                          : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                      title="Toggle BPM Analysis"
                    >
                      <Activity className="w-2.5 h-2.5" /> BPM
                    </button>
                    <span className="text-[9px] font-mono text-slate-500 bg-slate-950/50 px-1 rounded">D{deck.deck}</span>
                  </div>
                </div>
                
                {dlState.status === "Idle" ? (
                  <button 
                    onClick={() => handleDownload(deck, deck.deck)}
                    className="w-full py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-md font-bold text-[10px] flex items-center justify-center gap-1 transition-all active:scale-95"
                  >
                    <Download className="w-3 h-3" /> Download Track
                  </button>
                ) : (
                  <div className="flex items-center justify-between p-1.5 bg-slate-950/80 rounded-md border border-indigo-500/30">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {dlState.status === "Downloading" && <RefreshCw className="w-3 h-3 text-indigo-400 animate-spin shrink-0" />}
                      {dlState.status === "Finished" && <HardDrive className="w-3 h-3 text-emerald-400 shrink-0" />}
                      {dlState.status === "Error" && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                      <span className="text-[9px] text-slate-300 truncate">{dlState.progress}</span>
                    </div>
                    {dlState.status === "Finished" && (dlState.result_file || dlState.result_dir) && (
                      <button 
                        onClick={() => handleOpenPath(dlState.result_file || dlState.result_dir)}
                        className="text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors shrink-0 border border-slate-700"
                        title="Open Location"
                      >
                        <FolderOpen className="w-2.5 h-2.5" /> Open
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  )
}

export default DjayCompanion
