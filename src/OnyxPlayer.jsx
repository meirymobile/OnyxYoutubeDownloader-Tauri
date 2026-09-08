import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FolderOpen, SkipForward } from 'lucide-react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open, ask } from '@tauri-apps/plugin-dialog';
import { guess } from 'web-audio-beat-detector';

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

const OnyxPlayer = ({ stemsPath: initialStemsPath, onAnalyserReady, onPlayStateChange }) => {
  const [stemsPath, setStemsPath] = useState(initialStemsPath);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [isFileMode, setIsFileMode] = useState(false);
  const [linkInfo, setLinkInfo] = useState({ enabled: false, tempo: 120.0, peers: 0 });
  const [baseBpm, setBaseBpm] = useState(0);
  const [keyLock, setKeyLock] = useState(true);
  const [beatOffset, setBeatOffset] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isQuantizeWaiting, setIsQuantizeWaiting] = useState(false);

  const [volumes, setVolumes] = useState({ vocals: 0.8, drums: 0.8, bass: 0.8, melody: 0.8 });
  const [mutes, setMutes] = useState({ vocals: false, drums: false, bass: false, melody: false });
  const [solos, setSolos] = useState({ vocals: false, drums: false, bass: false, melody: false });

  const audioCtxRef = useRef(null);
  const buffersRef = useRef({});
  const peaksRef = useRef(null);
  const sourcesRef = useRef({});
  const gainsRef = useRef({});
  const analysersRef = useRef({});
  const masterGainRef = useRef(null);
  const isPlayingRef = useRef(isPlaying);
  const bcRef = useRef(null);
  const pitchBendIntervalRef = useRef(null);

  const linkInfoRef = useRef(linkInfo);
  const baseBpmRef = useRef(baseBpm);
  const beatOffsetRef = useRef(beatOffset);
  const zoomLevelRef = useRef(zoomLevel);
  const keyLockRef = useRef(keyLock);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { keyLockRef.current = keyLock; }, [keyLock]);
  useEffect(() => { linkInfoRef.current = linkInfo; }, [linkInfo]);
  useEffect(() => { baseBpmRef.current = baseBpm; }, [baseBpm]);
  useEffect(() => { beatOffsetRef.current = beatOffset; }, [beatOffset]);
  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);

  // BroadcastChannel Sync
  useEffect(() => {
    const bc = new BroadcastChannel('onyx_mixer_sync');
    bcRef.current = bc;
    
    bc.onmessage = (e) => {
        const data = e.data;
        if (data.type === 'VOLUME') {
            const val = parseFloat(data.value);
            if (data.stem === 'master') {
                if (masterGainRef.current) {
                    masterGainRef.current.gain.setTargetAtTime(val, audioCtxRef.current?.currentTime || 0, 0.05);
                }
            } else {
                setVolumes(prev => ({ ...prev, [data.stem]: val }));
            }
        } else if (data.type === 'MUTE') {
            if (data.stem !== 'master' && data.stem !== 'ext1') {
                setMutes(prev => ({ ...prev, [data.stem]: data.isMuted }));
            }
        } else if (data.type === 'REQUEST_STATE') {
            sendStateToMixer();
        }
    };
    
    return () => bc.close();
  }, []);

  const sendStateToMixer = () => {
    if (bcRef.current) {
        bcRef.current.postMessage({
            type: 'SYNC_STATE',
            volumes,
            mutes
        });
    }
  };

  useEffect(() => {
    sendStateToMixer();
  }, [volumes, mutes]);

  const startTimeRef = useRef(0);
  const offsetTimeRef = useRef(0);
  const animationRef = useRef(null);
  const canvasesRef = useRef({});
  const centralWaveformRef = useRef(null);
  const masterAnalyserRef = useRef(null);

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

  // Fetch Link Status
  useEffect(() => {
      const interval = setInterval(async () => {
          try {
              import('@tauri-apps/api/core').then(({ invoke }) => {
                  invoke('get_link_status').then(([enabled, tempo, peers]) => {
                      setLinkInfo({ enabled, tempo, peers });
                  });
              });
          } catch (e) { }
      }, 1000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (initialStemsPath && initialStemsPath !== 'SELECT_FOLDER') {
      setStemsPath(initialStemsPath);
    }
  }, [initialStemsPath]);

  // Sync playback rate continuously
  useEffect(() => {
      const rate = (linkInfo.enabled && linkInfo.tempo > 0 && baseBpm > 0) ? (linkInfo.tempo / baseBpm) : 1.0;
      STEMS.forEach(stem => {
          if (sourcesRef.current[stem] && audioCtxRef.current) {
              try {
                  sourcesRef.current[stem].playbackRate.setTargetAtTime(rate, audioCtxRef.current.currentTime, 0.05);
              } catch(e) {}
          }
      });
  }, [linkInfo.tempo, linkInfo.enabled, baseBpm]);

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

        const masterAnalyser = ctx.createAnalyser();
        masterAnalyser.fftSize = 256;
        masterAnalyser.smoothingTimeConstant = 0.8;
        masterGainRef.current.connect(masterAnalyser);
        masterAnalyser.connect(ctx.destination);
        masterAnalyserRef.current = masterAnalyser;

        if (onAnalyserReady) onAnalyserReady(masterAnalyser);

        let maxDuration = 0;
        let loadedStemsCount = 0;

        const isSingleFile = stemsPath.match(/\.(mp3|wav|m4a|flac)$/i);
        setIsFileMode(!!isSingleFile);

        for (let i = 0; i < STEMS.length; i++) {
          const stem = STEMS[i];
          const legacyStem = stem === 'melody' ? 'other' : stem;

          setLoadingProgress(Math.round(((i) / 4) * 100));

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
            if (stem === 'vocals') {
              filePaths = [stemsPath];
            } else {
              continue;
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
            } catch (e) { }
          }

          if (!arrayBuffer) {
            if (!isSingleFile) console.warn(`Could not find audio for stem: ${stem}`);
            continue;
          }

          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

          if (isCancelled) return;
          
          // Automatic BPM Detection (Run only once per track)
          if ((stem === 'drums' || stem === 'vocals') && loadedStemsCount === 0) {
              try {
                  const { bpm, offset } = await guess(audioBuffer);
                  if (bpm > 0) {
                      setBaseBpm(Math.round(bpm * 10) / 10);
                      setBeatOffset(offset || 0);
                      console.log(`Auto-detected BPM: ${bpm}, Offset: ${offset}`);
                  }
              } catch(e) {
                  console.warn("BPM Auto-detect failed", e);
              }
          }

          if (stem === 'drums' || (!peaksRef.current && stem === 'vocals')) {
              const channelData = audioBuffer.getChannelData(0);
              const samplesPerSec = 50; 
              const step = Math.floor(audioBuffer.sampleRate / samplesPerSec);
              const peaks = new Float32Array(Math.floor(channelData.length / step));
              for (let i = 0; i < peaks.length; i++) {
                  let max = 0;
                  const offset = i * step;
                  for (let j = 0; j < step; j++) {
                      const val = Math.abs(channelData[offset + j]);
                      if (val > max) max = val;
                  }
                  peaks[i] = max;
              }
              peaksRef.current = peaks;
          }

          buffersRef.current[stem] = audioBuffer;
          if (audioBuffer.duration > maxDuration) {
            maxDuration = audioBuffer.duration;
          }
          loadedStemsCount++;
        }

        if (loadedStemsCount === 0) {
          throw new Error("No compatible audio found.");
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

    const rate = (linkInfoRef.current.enabled && linkInfoRef.current.tempo > 0 && baseBpmRef.current > 0) ? (linkInfoRef.current.tempo / baseBpmRef.current) : 1.0;

    STEMS.forEach(stem => {
      if (!buffersRef.current[stem]) return;
      const source = ctx.createBufferSource();
      source.buffer = buffersRef.current[stem];
      source.playbackRate.value = rate;
      source.preservesPitch = keyLockRef.current;
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
    isPlayingRef.current = true;
    if (onPlayStateChange) onPlayStateChange(true);
  };

  const stopPlayback = () => {
    STEMS.forEach(stem => {
      if (sourcesRef.current[stem]) {
        try { sourcesRef.current[stem].stop(); } catch (e) { }
        sourcesRef.current[stem].disconnect();
        sourcesRef.current[stem] = null;
      }
    });
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (onPlayStateChange) onPlayStateChange(false);
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

  const quantizedPlay = async () => {
      if (!hasAudio) return;
      if (!linkInfo.enabled || isPlayingRef.current) {
          togglePlay();
          return;
      }

      setIsQuantizeWaiting(true);
      try {
          const { invoke } = await import('@tauri-apps/api/core');
          const [phase, tempo] = await invoke('get_link_phase');
          let beatsUntilOne = 4.0 - phase;
          if (beatsUntilOne < 0.1) beatsUntilOne += 4.0; // If too close, wait for next bar
          
          const bps = tempo / 60.0;
          const delayMs = (beatsUntilOne / bps) * 1000;

          setTimeout(() => {
              if (!isPlayingRef.current) togglePlay();
              setIsQuantizeWaiting(false);
          }, delayMs);
      } catch (e) {
          setIsQuantizeWaiting(false);
          togglePlay();
      }
  };

  const resetPlayback = () => {
    stopPlayback();
    offsetTimeRef.current = 0;
    setCurrentTime(0);
    startPlayback(0);
  };

  const handlePitchBend = (direction) => {
      if (!isPlayingRef.current) return;
      if (pitchBendIntervalRef.current) clearInterval(pitchBendIntervalRef.current);

      const baseRate = (linkInfoRef.current.enabled && linkInfoRef.current.tempo > 0 && baseBpmRef.current > 0) ? (linkInfoRef.current.tempo / baseBpmRef.current) : 1.0;
      let bendMultiplier = direction === 'up' ? 1.01 : 0.99;
      const maxBend = direction === 'up' ? 1.15 : 0.85;
      const step = direction === 'up' ? 0.005 : -0.005;

      pitchBendIntervalRef.current = setInterval(() => {
          bendMultiplier += step;
          if (direction === 'up' && bendMultiplier > maxBend) bendMultiplier = maxBend;
          if (direction === 'down' && bendMultiplier < maxBend) bendMultiplier = maxBend;
          
          const bendRate = baseRate * bendMultiplier;
          STEMS.forEach(stem => {
              if (sourcesRef.current[stem] && audioCtxRef.current) {
                  try { sourcesRef.current[stem].playbackRate.setTargetAtTime(bendRate, audioCtxRef.current.currentTime, 0.05); } catch(e){}
              }
          });
      }, 50);
  };

  const releasePitchBend = () => {
      if (pitchBendIntervalRef.current) {
          clearInterval(pitchBendIntervalRef.current);
          pitchBendIntervalRef.current = null;
      }

      if (!isPlayingRef.current) return;
      const baseRate = (linkInfoRef.current.enabled && linkInfoRef.current.tempo > 0 && baseBpmRef.current > 0) ? (linkInfoRef.current.tempo / baseBpmRef.current) : 1.0;
      
      STEMS.forEach(stem => {
          if (sourcesRef.current[stem] && audioCtxRef.current) {
              try { sourcesRef.current[stem].playbackRate.setTargetAtTime(baseRate, audioCtxRef.current.currentTime, 0.05); } catch(e){}
          }
      });
  };

  const updateProgress = () => {
    if (audioCtxRef.current) {
      if (isPlayingRef.current) {
        const current = audioCtxRef.current.currentTime - startTimeRef.current;
        setCurrentTime(current);
      }
      drawMeters();
      drawCentralWaveform();
    }
    animationRef.current = requestAnimationFrame(updateProgress);
  };

  const drawMeters = () => {
    const levels = {};
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
      levels[stem] = volumeRatio * 100;

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

          const flutter = (isPlayingRef.current && i === activeLeds && Math.random() > 0.5) ? 1 : 0;
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

    if (bcRef.current && !isLoading) {
        bcRef.current.postMessage({
            type: 'VU',
            levels,
            trackName: hasAudio ? trackName : 'No Stems Loaded'
        });
    }
  };

   const drawCentralWaveform = () => {
    const canvas = centralWaveformRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    
    const midY = height / 2;
    const peaks = peaksRef.current;
    
    let currentPos = 0;
    if (audioCtxRef.current) {
        if (isPlayingRef.current) {
            currentPos = audioCtxRef.current.currentTime - startTimeRef.current;
        } else {
            currentPos = offsetTimeRef.current;
        }
    }

    if (!peaks || peaks.length === 0) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      return;
    }

    const pixelsPerSecond = zoomLevelRef.current || 100;
    const samplesPerSec = 50; 
    
    const beatInterval = 60.0 / (baseBpmRef.current || 128);
    const offset = beatOffsetRef.current || 0;
    
    const adjustedTime = currentPos - offset;
    const firstBeat = Math.floor((adjustedTime - (width / 2) / pixelsPerSecond) / beatInterval);
    const lastBeat = Math.ceil((adjustedTime + (width / 2) / pixelsPerSecond) / beatInterval);

    for (let b = firstBeat; b <= lastBeat; b++) {
        const beatTime = (b * beatInterval) + offset;
        const x = (width / 2) + (beatTime - currentPos) * pixelsPerSecond;
        
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        
        if (b % 4 === 0) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; // Red downbeat
            ctx.lineWidth = 2;
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; // White beat
            ctx.lineWidth = 1;
        }
        ctx.stroke();
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#22d3ee';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#22d3ee';
    
    ctx.beginPath();
    
    const visibleSeconds = width / pixelsPerSecond;
    const startSec = currentPos - (visibleSeconds / 2);
    
    let started = false;
    
    for (let x = 0; x < width; x += 2) {
        const t = startSec + (x / pixelsPerSecond);
        if (t < 0 || t * samplesPerSec >= peaks.length) continue;
        
        const peakIndex = Math.floor(t * samplesPerSec);
        const val = peaks[peakIndex] || 0;
        const yAmp = val * midY * 0.9;
        
        if (!started) {
            ctx.moveTo(x, midY - yAmp);
            started = true;
        } else {
            ctx.lineTo(x, midY - yAmp);
        }
    }
    
    for (let x = width; x >= 0; x -= 2) {
        const t = startSec + (x / pixelsPerSecond);
        if (t < 0 || t * samplesPerSec >= peaks.length) continue;
        
        const peakIndex = Math.floor(t * samplesPerSec);
        const val = peaks[peakIndex] || 0;
        const yAmp = val * midY * 0.9;
        ctx.lineTo(x, midY + yAmp);
    }
    
    ctx.stroke();
    ctx.fillStyle = 'rgba(34, 211, 238, 0.1)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.stroke();
  };

  const handleWaveformClick = (e) => {
      if (!peaksRef.current) return;
      
      const rect = e.target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      const pixelsPerSecond = zoomLevelRef.current || 100;
      const offsetSec = (x - (width / 2)) / pixelsPerSecond;
      
      let currentPos = 0;
      if (audioCtxRef.current) {
          if (isPlayingRef.current) {
              currentPos = audioCtxRef.current.currentTime - startTimeRef.current;
          } else {
              currentPos = offsetTimeRef.current;
          }
      }
      
      let newTime = currentPos + offsetSec;
      if (newTime < 0) newTime = 0;
      if (newTime > duration) newTime = duration;
      
      if (isPlayingRef.current) {
          stopPlayback();
          offsetTimeRef.current = newTime;
          startPlayback(newTime);
      } else {
          offsetTimeRef.current = newTime;
          setCurrentTime(newTime);
          drawCentralWaveform();
      }
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

  const renderStemControl = (stem) => {
    const isDisabled = isFileMode && stem !== 'vocals';
    return (
      <div key={stem} className={`bg-[#0f1423] border-l border-slate-700/30 p-4 flex flex-col items-center flex-1 h-full min-h-[250px] md:min-h-[300px] ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
        <div className="flex gap-2 mb-4 w-full justify-center">
          <button
            onClick={() => toggleSolo(stem)}
            className={`w-10 h-7 rounded text-[10px] font-black transition-all border border-slate-700 ${solos[stem] ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_#06b6d4]' : 'bg-[#1e293b] text-slate-400 hover:text-white'}`}
          >
            SOLO
          </button>
          <button
            onClick={() => toggleMute(stem)}
            className={`w-10 h-7 rounded text-[10px] font-black transition-all border border-slate-700 ${mutes[stem] ? 'bg-pink-500 text-white shadow-[0_0_10px_#ec4899]' : 'bg-[#1e293b] text-slate-400 hover:text-white'}`}
          >
            MUTE
          </button>
        </div>

        <div className={`text-center w-full mb-4`}>
          <div className={`text-[10px] md:text-xs font-black uppercase tracking-widest text-${STEM_COLORS[stem]} drop-shadow-[0_0_8px_${STEM_HEX[stem]}] inline-block`}>
            {isFileMode && stem === 'vocals' ? 'MASTER' : stem}
          </div>
        </div>

        <div className="flex gap-3 h-full min-h-[160px] w-full justify-center items-end pb-4 relative">

          <div className="relative h-full w-12 flex flex-col items-center justify-center group flex-1">
            <input
              type="range"
              min="0" max="1.2" step="0.01"
              value={volumes[stem]}
              onChange={(e) => handleVolume(stem, e.target.value)}
              className="onyx-fader"
              style={{
                width: '150px',
                height: '40px',
                transform: 'rotate(270deg)',
                transformOrigin: 'center'
              }}
            />
          </div>

          <div className="h-full w-6 bg-[#030712] rounded border border-slate-800 p-0.5 flex-shrink-0 relative hidden sm:block">
            <canvas
              ref={el => canvasesRef.current[stem] = el}
              width={20}
              height={200}
              className="w-full h-full object-fill"
            />
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-400">
              {(volumes[stem] * 100).toFixed(0)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full bg-[#121929] border border-slate-700/50 rounded-[20px] shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden relative font-sans flex flex-col">
      {isLoading && (
        <div className="absolute inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center flex-col text-center rounded-[20px]">
          <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(168,85,247,0.5)]"></div>
          <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 uppercase tracking-widest mb-2">
            Loading Audio
          </h2>
          <p className="text-slate-400 font-mono text-xs">Loading... {loadingProgress}%</p>
        </div>
      )}

      {/* Top Header Strip */}
      <div className="h-14 bg-[#0a0f1c] border-b border-slate-700/50 flex flex-col md:flex-row justify-between items-center px-6 shrink-0 gap-2 py-2 md:py-0">
        <div className="flex items-center gap-4">
          <div className="text-cyan-400 font-black tracking-widest text-sm drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] uppercase">STEM DJ MIXER</div>
          
          <div className="flex items-center gap-2">
              <button 
                  onClick={() => setKeyLock(k => !k)}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full border transition-all ${keyLock ? 'bg-purple-900/30 border-purple-500 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.3)]' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'}`}
              >
                  <span className="font-black text-[10px] tracking-wider uppercase">KEY</span>
              </button>
              {/* Ableton Link Toggle */}
              <button 
                  onClick={() => {
                      import('@tauri-apps/api/core').then(({ invoke }) => invoke('toggle_link'));
                  }}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${linkInfo.enabled ? 'bg-emerald-900/30 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'}`}
              >
                  <span className="font-black text-[10px] tracking-wider uppercase">LINK</span>
                  {linkInfo.enabled && <span className="font-mono text-[10px] bg-emerald-950 px-1.5 py-0.5 rounded">{linkInfo.tempo.toFixed(1)}</span>}
              </button>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-xs text-slate-400 tracking-widest font-mono hidden md:flex items-center gap-4">
            <div>
                {hasAudio ? <span className="text-cyan-400 font-bold">CURRENT TRACK: </span> : ''}
                {hasAudio ? trackName : 'No Track Loaded'}
            </div>
            
            {hasAudio && (
                <div className="flex items-center gap-2 bg-slate-900 px-2 py-1 rounded border border-slate-700">
                    <span className="text-[10px] text-slate-500 font-bold">ORIGINAL BPM:</span>
                    <input 
                        type="number" 
                        value={baseBpm} 
                        onChange={e => setBaseBpm(parseFloat(e.target.value) || 128)}
                        className="w-14 bg-transparent text-cyan-400 font-bold outline-none text-right appearance-none"
                        step="0.1"
                    />
                </div>
            )}
          </div>
          <button onClick={loadMediaDialog} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-full text-slate-300 font-mono text-xs border border-slate-600 transition-all ml-0 md:ml-4 shadow-lg">
            <FolderOpen className="w-3 h-3 text-cyan-400" /> LOAD MEDIA
          </button>
        </div>
      </div>

      {/* Main Mixer Body */}
      <div className="flex flex-col md:flex-row h-auto md:h-[360px]">
        {/* Left Faders */}
        <div className="flex w-full md:w-[30%] h-[300px] md:h-full">
          {renderStemControl('vocals')}
          {renderStemControl('drums')}
        </div>

        {/* Center Waveform & Transport */}
        <div className="flex-1 border-l border-r border-slate-700/30 bg-[#0a0f1c] p-4 flex flex-col relative h-[300px] md:h-full">
          <div className="flex-1 bg-[#050810] rounded-xl border border-slate-800 relative overflow-hidden shadow-inner flex flex-col mb-4">
            <canvas
              ref={centralWaveformRef}
              width={800}
              height={200}
              className="w-full h-full object-fill absolute inset-0 z-0 cursor-pointer"
              onClick={handleWaveformClick}
            />
            {/* Grid Adjust & Zoom Overlay */}
            <div 
              className="absolute top-2 right-2 flex flex-col gap-2 items-end z-20"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center bg-slate-900/80 p-2 rounded-lg backdrop-blur-md border border-slate-700/50">
                <span className="text-[10px] text-slate-400 font-bold mb-1">GRID ADJUST</span>
                <div className="flex gap-2">
                  <button onClick={() => setBeatOffset(prev => prev - 0.002)} className="w-8 h-6 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold flex items-center justify-center border border-slate-700 text-xs" title="Shift Grid Left (-2ms)">
                    &lt;
                  </button>
                  <button onClick={() => setBeatOffset(prev => prev + 0.002)} className="w-8 h-6 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-bold flex items-center justify-center border border-slate-700 text-xs" title="Shift Grid Right (+2ms)">
                    &gt;
                  </button>
                </div>
              </div>
              <div className="flex flex-col items-center bg-slate-900/80 p-2 rounded-lg backdrop-blur-md border border-slate-700/50">
                <span className="text-[10px] text-slate-400 font-bold mb-1">ZOOM</span>
                <input
                  type="range"
                  min="30"
                  max="300"
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(Number(e.target.value))}
                  className="w-20 accent-cyan-400"
                />
              </div>
            </div>
          </div>

          <div className="h-16 flex items-center justify-between px-2 shrink-0">
            <div className="text-xl md:text-2xl font-mono text-cyan-400 font-light w-20 md:w-24">
              {formatTime(currentTime)}
            </div>

            <div className="flex gap-4">
              <button disabled={!hasAudio} onPointerDown={() => handlePitchBend('down')} onPointerUp={releasePitchBend} onPointerLeave={releasePitchBend} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors border border-slate-700 disabled:opacity-50 text-slate-300 font-black" title="Pitch Bend Down">
                -
              </button>
              
              <button disabled={!hasAudio} onClick={quantizedPlay} className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border disabled:opacity-50 ${isQuantizeWaiting ? 'bg-amber-900/50 border-amber-500 text-amber-400 animate-pulse' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'}`} title="Play on Next Bar (One)">
                <span className="font-black text-[10px]">1</span>
              </button>

              <button disabled={!hasAudio} onClick={togglePlay} className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center hover:scale-105 transition-transform shadow-[0_0_15px_rgba(34,211,238,0.4)] disabled:opacity-50">
                {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-1" />}
              </button>
              
              <button disabled={!hasAudio} onClick={resetPlayback} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors border border-slate-700 disabled:opacity-50">
                <SkipForward className="w-4 h-4 rotate-180 text-slate-300" title="Back to Start" />
              </button>

              <button disabled={!hasAudio} onPointerDown={() => handlePitchBend('up')} onPointerUp={releasePitchBend} onPointerLeave={releasePitchBend} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors border border-slate-700 disabled:opacity-50 text-slate-300 font-black" title="Pitch Bend Up">
                +
              </button>
            </div>

            <div className="text-xl md:text-2xl font-mono text-slate-500 font-light w-20 md:w-24 text-right">
              {formatTime(duration)}
            </div>
          </div>
        </div>

        {/* Right Faders */}
        <div className="flex w-full md:w-[30%] h-[300px] md:h-full">
          {renderStemControl('bass')}
          {renderStemControl('melody')}
        </div>
      </div>
    </div>
  );
};

export default OnyxPlayer;
