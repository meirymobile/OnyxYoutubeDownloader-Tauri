import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, X, RotateCcw, FolderOpen } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open, ask } from '@tauri-apps/plugin-dialog';

const STEMS = ['vocals', 'drums', 'bass', 'melody'];
const STEM_COLORS = {
  vocals: 'cyan-400',
  drums: 'pink-500',
  bass: 'purple-500',
  melody: 'emerald-400'
};
const STEM_HEX = {
  vocals: '#22d3ee',
  drums: '#ec4899',
  bass: '#a855f7',
  melody: '#34d399'
};

const OnyxPlayer = ({ stemsPath: initialStemsPath, onClose }) => {
  const [stemsPath, setStemsPath] = useState(initialStemsPath);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [isFileMode, setIsFileMode] = useState(false);
  
  const [volumes, setVolumes] = useState({ vocals: 0.8, drums: 0.8, bass: 0.8, melody: 0.8 });
  const [mutes, setMutes] = useState({ vocals: false, drums: false, bass: false, melody: false });
  const [solos, setSolos] = useState({ vocals: false, drums: false, bass: false, melody: false });

  const audioCtxRef = useRef(null);
  const buffersRef = useRef({});
  const sourcesRef = useRef({});
  const gainsRef = useRef({});
  const analysersRef = useRef({});
  const masterGainRef = useRef(null);
  
  const startTimeRef = useRef(0);
  const offsetTimeRef = useRef(0);
  const animationRef = useRef(null);
  const canvasesRef = useRef({});
  const centralWaveformRef = useRef(null);

  const trackName = (stemsPath || "Unknown").split(/[\/\\]/).pop().replace('.onyx', '').replace(/\.(mp3|wav|m4a|flac)$/i, '');

  const loadMediaDialog = async () => {
    try {
      const isProject = await ask('What do you want to load?', {
        title: 'Load Media',
        kind: 'info',
        okLabel: 'Onyx Project (Folder)',
        cancelLabel: 'Single Song (File)'
      });

      const selected = await open({
        directory: isProject,
        multiple: false,
        title: isProject ? 'Select .onyx Project Folder' : 'Select Audio File',
        filters: isProject ? [] : [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'flac'] }]
      });
      
      if (selected) {
        setStemsPath(selected);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!stemsPath || stemsPath === 'SELECT_FOLDER') {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const initAudio = async () => {
      setIsLoading(true);
      setLoadError(null);
      setLoadingProgress(0);

      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        
        masterGainRef.current = ctx.createGain();
        masterGainRef.current.connect(ctx.destination);

        let maxDuration = 0;
        let loadedStemsCount = 0;
        
        const isSingleFile = stemsPath.match(/\.(mp3|wav|m4a|flac)$/i);
        setIsFileMode(!!isSingleFile);

        for (let i = 0; i < STEMS.length; i++) {
          const stem = STEMS[i];
          const legacyStem = stem === 'melody' ? 'other' : stem;
          
          setLoadingProgress(Math.round(((i) / 4) * 100));
          
          // Setup nodes even if empty for visualization to not crash
          const gainNode = ctx.createGain();
          gainNode.gain.value = 0.8;
          const analyserNode = ctx.createAnalyser();
          analyserNode.fftSize = 128;
          analyserNode.smoothingTimeConstant = 0.8;
          
          gainNode.connect(analyserNode);
          analyserNode.connect(masterGainRef.current);
          
          gainsRef.current[stem] = gainNode;
          analysersRef.current[stem] = analyserNode;

          let filePaths = [];
          if (isSingleFile) {
            // If it's a single file, only load it into the 'vocals' (master) track
            if (stem === 'vocals') {
              filePaths = [stemsPath];
            } else {
              continue; // Skip loading other stems
            }
          } else {
            const sep = stemsPath.includes('\\') ? '\\' : '/';
            filePaths = [
              `${stemsPath}${sep}${legacyStem}.wav`,
              `${stemsPath}${sep}${legacyStem}.mp3`,
              `${stemsPath}${sep}temp_demucs${sep}htdemucs${sep}${trackName}${sep}${legacyStem}.wav`
            ];
          }

          let arrayBuffer = null;
          for (const path of filePaths) {
            try {
              const assetUrl = convertFileSrc(path);
              const response = await fetch(assetUrl);
              if (response.ok) {
                arrayBuffer = await response.arrayBuffer();
                break;
              }
            } catch(e) {}
          }

          if (!arrayBuffer) {
             if (!isSingleFile) console.warn(`Could not find audio for stem: ${stem}`);
             continue;
          }

          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          
          if (isCancelled) return;

          buffersRef.current[stem] = audioBuffer;
          if (audioBuffer.duration > maxDuration) {
            maxDuration = audioBuffer.duration;
          }
          loadedStemsCount++;
        }

        if (loadedStemsCount === 0) {
          throw new Error("No compatible audio found. Ensure it's a valid Onyx project or audio file.");
        }
        
        setDuration(maxDuration);
        setLoadingProgress(100);
        setIsLoading(false);
        
        updateProgress();

      } catch (err) {
        console.error("Failed to load stems into Onyx Player", err);
        if (!isCancelled) {
          setIsLoading(false);
          setLoadError(err.message || "Failed to load audio files.");
        }
      }
    };
    
    initAudio();
    
    return () => {
      isCancelled = true;
      stopPlayback();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, [stemsPath]);

  useEffect(() => {
    if (!audioCtxRef.current) return;
    const isAnySolo = Object.values(solos).some(v => v);
    
    STEMS.forEach(stem => {
      if (gainsRef.current[stem]) {
        if (mutes[stem]) {
          gainsRef.current[stem].gain.value = 0;
        } else if (isAnySolo && !solos[stem]) {
          gainsRef.current[stem].gain.value = 0;
        } else {
          gainsRef.current[stem].gain.value = volumes[stem];
        }
      }
    });
  }, [volumes, mutes, solos]);

  const startPlayback = (offset = 0) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    
    stopPlayback();
    
    STEMS.forEach(stem => {
      if (!buffersRef.current[stem]) return;
      const source = ctx.createBufferSource();
      source.buffer = buffersRef.current[stem];
      source.connect(gainsRef.current[stem]);
      source.start(0, offset);
      sourcesRef.current[stem] = source;
      
      if (stem === 'vocals' || stem === 'melody') {
        source.onended = () => setIsPlaying(false);
      }
    });
    
    startTimeRef.current = ctx.currentTime - offset;
    offsetTimeRef.current = offset;
    setIsPlaying(true);
  };

  const stopPlayback = () => {
    STEMS.forEach(stem => {
      if (sourcesRef.current[stem]) {
        try { sourcesRef.current[stem].stop(); } catch (e) {}
        sourcesRef.current[stem].disconnect();
        sourcesRef.current[stem] = null;
      }
    });
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
      if (audioCtxRef.current) {
        offsetTimeRef.current = audioCtxRef.current.currentTime - startTimeRef.current;
      }
    } else {
      startPlayback(offsetTimeRef.current);
    }
  };
  
  const resetPlayback = () => {
    stopPlayback();
    offsetTimeRef.current = 0;
    setCurrentTime(0);
    startPlayback(0);
  };

  const updateProgress = () => {
    if (audioCtxRef.current) {
      if (isPlaying) {
        const current = audioCtxRef.current.currentTime - startTimeRef.current;
        setCurrentTime(current);
      }
      drawMeters();
      drawCentralWaveform();
    }
    animationRef.current = requestAnimationFrame(updateProgress);
  };

  const drawMeters = () => {
    STEMS.forEach(stem => {
      const canvas = canvasesRef.current[stem];
      const analyser = analysersRef.current[stem];
      if (!canvas || !analyser) return;
      
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
      const average = sum / dataArray.length;
      const volumeRatio = Math.min(1, Math.pow(average / 100, 1.5)); 
      
      ctx.clearRect(0, 0, width, height);
      
      const numLeds = 18;
      const ledHeight = (height / numLeds) - 2;
      const activeLeds = Math.floor(volumeRatio * numLeds);
      
      for (let ch = 0; ch < 2; ch++) {
        const xOffset = ch * (width / 2 + 1);
        const ledWidth = (width / 2) - 2;
        
        for (let i = 0; i < numLeds; i++) {
          const y = height - (i * (ledHeight + 2)) - ledHeight;
          
          ctx.fillStyle = '#0f172a';
          
          const flutter = (isPlaying && i === activeLeds && Math.random() > 0.5) ? 1 : 0;
          const isActive = i < (activeLeds + flutter);

          if (isActive) {
            if (i > numLeds - 4) ctx.fillStyle = '#ef4444'; 
            else if (i > numLeds - 8) ctx.fillStyle = '#f59e0b'; 
            else ctx.fillStyle = '#10b981'; 
            
            ctx.shadowBlur = 6;
            ctx.shadowColor = ctx.fillStyle;
          } else {
            ctx.shadowBlur = 0;
          }
          
          ctx.fillRect(xOffset, y, ledWidth, ledHeight);
        }
      }
    });
  };

  const drawCentralWaveform = () => {
    const canvas = centralWaveformRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += 40) {
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    ctx.stroke();

    if (!buffersRef.current['vocals'] && !buffersRef.current['drums']) return;
    
    let globalAvg = 0;
    STEMS.forEach(stem => {
      const analyser = analysersRef.current[stem];
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        globalAvg += (data[10] / 255);
      }
    });

    const midY = height / 2;
    
    const drawWave = (color, offset, amplitudeMult) => {
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      
      const time = Date.now() / 1000;
      
      for (let x = 0; x < width; x += 5) {
        const freq = Math.sin(x * 0.05 + time * 5 + offset) * Math.cos(x * 0.01 - time);
        const noise = Math.random() * 0.5 * (isPlaying ? globalAvg : 0.1);
        const yOffset = (freq + noise) * (40 * amplitudeMult) * (isPlaying ? (globalAvg + 0.5) : 0.2);
        
        ctx.lineTo(x, midY - Math.abs(yOffset));
      }
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, midY);
      for (let x = 0; x < width; x += 5) {
        const freq = Math.sin(x * 0.05 + time * 5 + offset) * Math.cos(x * 0.01 - time);
        const noise = Math.random() * 0.5 * (isPlaying ? globalAvg : 0.1);
        const yOffset = (freq + noise) * (40 * amplitudeMult) * (isPlaying ? (globalAvg + 0.5) : 0.2);
        ctx.lineTo(x, midY + Math.abs(yOffset));
      }
      ctx.stroke();
    };

    drawWave('#22d3ee', 0, 1.2); 
    drawWave('#d946ef', Math.PI, 1.5); 

    const progressX = (currentTime / duration) * width || 0;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(progressX, 0, 2, height);
    
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ffffff';
    ctx.beginPath();
    ctx.arc(progressX + 1, midY, 4, 0, Math.PI * 2);
    ctx.fill();
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMute = (stem) => setMutes(prev => ({ ...prev, [stem]: !prev[stem] }));
  const toggleSolo = (stem) => setSolos(prev => ({ ...prev, [stem]: !prev[stem] }));
  const handleVolume = (stem, val) => setVolumes(prev => ({ ...prev, [stem]: parseFloat(val) }));

  const hasAudio = Object.keys(buffersRef.current).length > 0;

  return (
    <div className="fixed inset-0 z-[100] bg-[#030712] flex items-center justify-center p-4 lg:p-8 font-sans">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#020617] to-[#1e1b4b] opacity-80 pointer-events-none"></div>
      
      {isLoading && (
        <div className="absolute inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center flex-col text-center">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(168,85,247,0.5)]"></div>
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 uppercase tracking-widest mb-2">
            Loading Audio
          </h2>
          <p className="text-slate-400 font-mono">Loading... {loadingProgress}%</p>
        </div>
      )}

      <div className="absolute top-6 right-6 flex gap-4 z-[110]">
        <button onClick={loadMediaDialog} className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700 rounded-full text-slate-300 font-mono text-xs border border-slate-600 transition-all shadow-lg">
          <FolderOpen className="w-4 h-4 text-cyan-400" />
          Load Media
        </button>
        <button onClick={onClose} className="p-2 bg-slate-800/80 hover:bg-rose-500/80 rounded-full text-slate-300 transition-all border border-slate-600 shadow-lg group">
          <X className="w-5 h-5 group-hover:text-white" />
        </button>
      </div>

      <div className="w-full max-w-[1400px] h-full max-h-[850px] bg-[#0f1423] border border-slate-700/50 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden relative flex flex-col md:flex-row z-10">
        
        <div className="flex-1 p-6 flex flex-col h-full overflow-hidden">
          
          <div className="mb-6 pl-2">
             <h1 className="text-4xl font-black tracking-widest text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)] uppercase">
              ONYX PLAYER
            </h1>
          </div>

          <div className="h-64 bg-[#0a0f1c] rounded-2xl border border-slate-800 relative overflow-hidden mb-6 shadow-inner flex flex-col">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0f1c]/80 z-10 pointer-events-none"></div>
            
            <div className="flex justify-between items-center p-4 z-20 absolute top-0 left-0 right-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 shadow-[0_0_15px_rgba(168,85,247,0.5)] flex items-center justify-center">
                  <Play className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-cyan-400 text-xs font-bold tracking-widest uppercase">TRACK: {hasAudio ? trackName : 'NONE'}</div>
                  <div className="text-slate-400 text-[10px] tracking-widest">ARTIST: {hasAudio ? 'UNKNOWN' : 'NONE'}</div>
                </div>
              </div>
              <div className="text-right bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-700 backdrop-blur">
                <div className="text-cyan-400 text-sm font-bold">BPM 128.00</div>
              </div>
            </div>

            <canvas 
              ref={centralWaveformRef}
              width={1000}
              height={200}
              className="w-full h-full object-fill absolute inset-0 z-0"
            />
            
            <input 
              type="range" 
              min={0} max={duration} step={0.01}
              value={currentTime} 
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                stopPlayback();
                offsetTimeRef.current = newTime;
                setCurrentTime(newTime);
                if (isPlaying) startPlayback(newTime);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
            />

            <div className="absolute bottom-2 left-4 right-4 flex justify-between z-20 text-[10px] font-mono text-slate-500">
              <span>BEAT GRIDS</span>
              <span>TIME: <span className="text-cyan-400 font-bold">{formatTime(currentTime)}</span> / {formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-4 gap-4 pb-2">
            {STEMS.map(stem => {
              const isDisabled = isFileMode && stem !== 'vocals';
              return (
              <div key={stem} className={`bg-[#121929] border border-[#1e293b] rounded-2xl p-4 flex flex-col items-center shadow-lg relative ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
                
                <div className={`text-center w-full pb-2 mb-4 border-b border-slate-800/80`}>
                  <div className={`text-xs font-black uppercase tracking-widest text-${STEM_COLORS[stem]} drop-shadow-[0_0_8px_${STEM_HEX[stem]}] border border-${STEM_COLORS[stem]}/30 rounded px-2 py-1 inline-block`}>
                    {isFileMode && stem === 'vocals' ? 'MASTER' : stem}
                  </div>
                </div>
                
                <div className="flex gap-2 mb-6 w-full justify-center">
                  <button 
                    onClick={() => toggleSolo(stem)}
                    className={`onyx-btn w-10 h-9 rounded text-xs font-black transition-all ${solos[stem] ? 'active-solo' : 'bg-[#1e293b] text-slate-400'}`}
                  >
                    S
                  </button>
                  <button 
                    onClick={() => toggleMute(stem)}
                    className={`onyx-btn w-10 h-9 rounded text-xs font-black transition-all ${mutes[stem] ? 'active-mute' : 'bg-[#1e293b] text-slate-400'}`}
                  >
                    M
                  </button>
                </div>

                <div className="flex gap-4 h-full min-h-[180px] w-full justify-center items-end pb-4 relative">
                  
                  <div className="relative h-full flex flex-col items-center group flex-1 ml-4">
                     <input 
                      type="range"
                      min="0" max="1.2" step="0.01"
                      value={volumes[stem]}
                      onChange={(e) => handleVolume(stem, e.target.value)}
                      className="onyx-fader absolute h-full z-10"
                      style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
                    />
                    <div 
                      className="absolute w-6 h-1 bg-cyan-400 shadow-[0_0_8px_#22d3ee] rounded-full z-20 pointer-events-none"
                      style={{ bottom: `calc(${(volumes[stem] / 1.2) * 100}% - 0.5px)` }}
                    ></div>
                  </div>
                  
                  <div className="h-full w-8 bg-[#030712] rounded border border-slate-800 p-1 flex-shrink-0 relative">
                    <canvas 
                      ref={el => canvasesRef.current[stem] = el} 
                      width={24} 
                      height={200} 
                      className="w-full h-full object-fill"
                    />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-400">
                      {(volumes[stem] * 100).toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>
            )})}
          </div>
        </div>

        <div className="w-full md:w-80 bg-[#0c111d] border-l border-slate-800 p-6 flex flex-col relative">
          
          <div className="flex gap-6 justify-center mb-10 pt-4">
             <div className="flex flex-col items-center gap-2">
                <div className="text-[9px] text-slate-500 font-mono tracking-widest">NOSIM</div>
                <div className="w-16 h-16 rounded-full onyx-knob relative flex items-center justify-center">
                  <div className="absolute w-full h-full rounded-full border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.3)]"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full absolute top-2 onyx-knob-indicator"></div>
                </div>
             </div>
             <div className="flex flex-col items-center gap-2">
                <div className="text-[9px] text-slate-500 font-mono tracking-widest">GLOW</div>
                <div className="w-20 h-20 rounded-full onyx-knob relative flex items-center justify-center">
                  <div className="absolute w-full h-full rounded-full border-2 border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.5)] border-r-transparent border-b-transparent transform rotate-45"></div>
                  <div className="w-2 h-2 bg-cyan-400 rounded-full absolute top-2 right-4 onyx-knob-indicator"></div>
                </div>
             </div>
          </div>

          <div className="bg-[#121929] rounded-xl border border-slate-800 p-5 mb-6">
            <div className="text-xs text-slate-500 tracking-widest mb-1">ARTIST</div>
            <div className="text-xl font-medium text-white mb-4 line-clamp-1 truncate">{hasAudio ? trackName : 'No Track Loaded'}</div>
            
            <div className="flex items-end justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="text-3xl font-mono text-cyan-400 font-light">
                {formatTime(currentTime)}
                <span className="text-sm text-slate-500 ml-1">/ {formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs text-slate-500">KEY: </span>
                <span className="text-cyan-400 font-bold">Am</span>
              </div>
              <div className="flex gap-1 items-end">
                <div className="w-1 h-3 bg-purple-500"></div>
                <div className="w-1 h-4 bg-purple-500"></div>
                <div className="w-1 h-2 bg-purple-500"></div>
                <div className="w-1 h-5 bg-cyan-400"></div>
                <div className="w-1 h-3 bg-cyan-400"></div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 mb-8">
            <button disabled={!hasAudio} onClick={resetPlayback} className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-colors shadow-lg disabled:opacity-50">
              <RotateCcw className="w-5 h-5 text-slate-300" />
            </button>
            <button disabled={!hasAudio} onClick={togglePlay} className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center hover:scale-105 transition-transform shadow-[0_0_25px_rgba(34,211,238,0.5)] disabled:opacity-50">
              {isPlaying ? <Pause className="w-8 h-8 text-white" fill="currentColor" /> : <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />}
            </button>
          </div>

          <div className="flex-1 bg-[#121929] rounded-xl border border-slate-800 overflow-hidden flex flex-col">
            <div className="flex border-b border-slate-800">
              <button className="flex-1 py-2 text-xs font-bold text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50">Visualizer</button>
              <button className="flex-1 py-2 text-xs font-bold text-slate-500 hover:text-slate-300">Mod</button>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-3">
              <div className="text-xs text-slate-500 tracking-widest flex items-center gap-2 mb-2">
                <FolderOpen className="w-3 h-3" /> Playlists
              </div>
              <div className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-lg border border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-500 rounded flex items-center justify-center">
                  <Play className="w-4 h-4 text-white" fill="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-300 truncate">Deep House Mix</div>
                  <div className="text-[10px] text-slate-500 truncate">Various Artists</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default OnyxPlayer;
