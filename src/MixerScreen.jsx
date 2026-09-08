import React, { useState, useEffect, useRef } from 'react';
import { Maximize2, X, Settings2, SlidersHorizontal, Volume2, Mic2, MonitorSpeaker } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export default function MixerScreen({ mixerConfig, onClose, onOpenSettings }) {
    const [channels, setChannels] = useState([
        { id: 'master', name: 'MASTER OUT', type: 'master', color: 'bg-teal-500', volume: 80, isMuted: false },
        { id: 'ext1', name: 'DJAY PRO / EXT 1', type: 'external', color: 'bg-purple-500', volume: 80, isMuted: false },
        { id: 'vocals', name: 'VOCALS', type: 'stem', color: 'bg-blue-400', volume: 80, isMuted: false },
        { id: 'drums', name: 'DRUMS', type: 'stem', color: 'bg-red-400', volume: 80, isMuted: false },
        { id: 'bass', name: 'BASS', type: 'stem', color: 'bg-yellow-400', volume: 80, isMuted: false },
        { id: 'melody', name: 'MELODY', type: 'stem', color: 'bg-green-400', volume: 80, isMuted: false },
    ]);

    const [audioUnlocked, setAudioUnlocked] = useState(false);

    const [linkInfo, setLinkInfo] = useState({ enabled: false, tempo: 120.0, peers: 0 });
    const [vuLevels, setVuLevels] = useState({});
    const [remoteTrackName, setRemoteTrackName] = useState('No Stems Loaded');

    const audioCtxRef = useRef(null);
    const gainsRef = useRef({});
    const analysersRef = useRef({});
    const masterGainRef = useRef(null);
    const extSourceRef = useRef(null);
    const animationRef = useRef(null);
    const masterAnalyserRef = useRef(null);
    const bcRef = useRef(null);
    
    // BroadcastChannel Sync
    useEffect(() => {
        const bc = new BroadcastChannel('onyx_mixer_sync');
        bcRef.current = bc;
        
        bc.onmessage = (e) => {
            const data = e.data;
            if (data.type === 'VU') {
                setVuLevels(prev => ({ ...prev, ...data.levels }));
                if (data.trackName !== undefined) {
                    setRemoteTrackName(data.trackName || 'No Stems Loaded');
                }
            } else if (data.type === 'SYNC_STATE') {
                setChannels(prev => prev.map(c => {
                    const newC = { ...c };
                    if (data.volumes && data.volumes[c.id] !== undefined) {
                        newC.volume = data.volumes[c.id] * 100;
                    }
                    if (data.mutes && data.mutes[c.id] !== undefined) {
                        newC.isMuted = data.mutes[c.id];
                    }
                    return newC;
                }));
            }
        };
        
        bc.postMessage({ type: 'REQUEST_STATE' });
        
        return () => bc.close();
    }, []);

    // Fetch Link Status
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const [enabled, tempo, peers] = await invoke('get_link_status');
                setLinkInfo({ enabled, tempo, peers });
            } catch (e) { }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Initialize Web Audio API and External Input
    useEffect(() => {
        if (!audioUnlocked) return;

        const initAudio = async () => {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtxRef.current = ctx;

            // Master Gain & Analyser
            masterGainRef.current = ctx.createGain();
            masterAnalyserRef.current = ctx.createAnalyser();
            masterGainRef.current.connect(masterAnalyserRef.current);
            masterAnalyserRef.current.connect(ctx.destination);
            masterGainRef.current.gain.value = 0.8;

            // Create Gain & Analyser for Ext 1
            const gain = ctx.createGain();
            const analyser = ctx.createAnalyser();
            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 256;
            gain.connect(analyser);
            analyser.connect(masterGainRef.current);
            gainsRef.current['ext1'] = gain;
            analysersRef.current['ext1'] = analyser;
            gain.gain.value = 0.8;

            // Try to set output sink if supported and if mixerConfig.output is provided
            if (mixerConfig?.output && typeof ctx.setSinkId === 'function') {
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const outDev = devices.find(d => d.kind === 'audiooutput' && d.label.includes(mixerConfig.output));
                    if (outDev) await ctx.setSinkId(outDev.deviceId);
                } catch(e) { console.warn("Sink ID not supported", e); }
            }

            // Start Audio Capture for Djay Pro (Ext 1)
            if (mixerConfig?.input) {
                try {
                    // Unlock device labels by requesting generic audio first
                    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    tempStream.getTracks().forEach(t => t.stop());
                    
                    const inDev = devices.find(d => d.kind === 'audioinput' && d.label.toLowerCase().includes(mixerConfig.input.toLowerCase()));
                    
                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: inDev ? { deviceId: { exact: inDev.deviceId }, echoCancellation: false, autoGainControl: false, noiseSuppression: false } : { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
                    });
                    
                    const source = ctx.createMediaStreamSource(stream);
                    source.connect(gainsRef.current['ext1']);
                    extSourceRef.current = source;
                } catch(e) {
                    await invoke('print_log', { msg: `Failed to capture Djay Pro input: ${e.toString()}` });
                }
            }

            // Start VU Meter Loop
            const updateVU = () => {
                const newLevels = {};
                
                // Read Master
                if (masterAnalyserRef.current) {
                    const data = new Uint8Array(masterAnalyserRef.current.frequencyBinCount);
                    masterAnalyserRef.current.getByteFrequencyData(data);
                    let max = 0;
                    for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
                    newLevels['master'] = (max / 255) * 100;
                }

                // Read Ext1
                if (analysersRef.current['ext1']) {
                    const data = new Uint8Array(analysersRef.current['ext1'].frequencyBinCount);
                    analysersRef.current['ext1'].getByteFrequencyData(data);
                    let max = 0;
                    for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
                    newLevels['ext1'] = (max / 255) * 100;
                }

                // Merge local VUs with existing (which contains remote VUs)
                setVuLevels(prev => ({ ...prev, ...newLevels }));
                animationRef.current = requestAnimationFrame(updateVU);
            };
            updateVU();
        };

        initAudio();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (audioCtxRef.current) audioCtxRef.current.close();
            if (extSourceRef.current && extSourceRef.current.mediaStream) {
                extSourceRef.current.mediaStream.getTracks().forEach(t => t.stop());
            }
        };
    }, [mixerConfig, audioUnlocked]);

    const updateVolume = (id, newVol) => {
        setChannels(prev => prev.map(c => c.id === id ? { ...c, volume: newVol } : c));
        
        if (id === 'master' || id === 'ext1') {
            const channel = channels.find(c => c.id === id);
            if (channel && channel.isMuted) return; 
            const volRatio = newVol / 100;
            if (id === 'master' && masterGainRef.current) {
                masterGainRef.current.gain.setTargetAtTime(volRatio, audioCtxRef.current.currentTime, 0.05);
            } else if (gainsRef.current[id]) {
                gainsRef.current[id].gain.setTargetAtTime(volRatio, audioCtxRef.current.currentTime, 0.05);
            }
        }
        
        if (bcRef.current) {
            bcRef.current.postMessage({ type: 'VOLUME', stem: id, value: newVol / 100 });
        }
    };

    const toggleMute = (id) => {
        setChannels(prev => {
            const newChannels = prev.map(c => c.id === id ? { ...c, isMuted: !c.isMuted } : c);
            const channel = newChannels.find(c => c.id === id);
            
            if (id === 'master' || id === 'ext1') {
                const targetVol = channel.isMuted ? 0 : channel.volume / 100;
                if (id === 'master' && masterGainRef.current) {
                    masterGainRef.current.gain.setTargetAtTime(targetVol, audioCtxRef.current.currentTime, 0.05);
                } else if (gainsRef.current[id]) {
                    gainsRef.current[id].gain.setTargetAtTime(targetVol, audioCtxRef.current.currentTime, 0.05);
                }
            }
            
            if (bcRef.current) {
                bcRef.current.postMessage({ type: 'MUTE', stem: id, isMuted: channel.isMuted });
            }
            
            return newChannels;
        });
    };

    return (
        <div className="fixed inset-0 z-[200] bg-[#0a0a0a] text-gray-200 flex flex-col font-sans select-none">
            {!audioUnlocked && (
                <div 
                    className="absolute inset-0 z-[300] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer"
                    onClick={() => setAudioUnlocked(true)}
                >
                    <div className="w-20 h-20 bg-teal-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                        <MonitorSpeaker className="w-10 h-10 text-teal-400" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-widest text-white mb-2">ACTIVATE MIXER ENGINE</h2>
                    <p className="text-gray-400 text-sm">Click anywhere to connect Djay Pro Audio</p>
                </div>
            )}

            {/* Header */}
            <div className="h-16 shrink-0 bg-[#111] border-b border-[#222] flex items-center justify-between px-6" style={{ WebkitAppRegion: 'drag' }}>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-5 h-5 text-teal-400" />
                        <h1 className="font-bold text-lg tracking-wider">ONYX <span className="font-light text-teal-500">LIVE MIXER</span></h1>
                    </div>
                    {linkInfo.enabled && (
                        <div className="ml-8 bg-[#1a1a1a] px-4 py-1.5 rounded-full border border-emerald-900/50 flex items-center gap-3 shadow-inner">
                            <span className="font-mono text-emerald-400 font-bold tracking-widest">{linkInfo.tempo.toFixed(2)} BPM</span>
                            <div className="w-px h-3 bg-gray-700"></div>
                            <span className="text-xs text-gray-400">LINK ON ({linkInfo.peers})</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
                    <button onClick={onOpenSettings} className="p-2 hover:bg-[#222] rounded-lg transition-colors border border-transparent hover:border-[#333]">
                        <Settings2 className="w-5 h-5 text-gray-400" />
                    </button>
                    <button onClick={onClose} className="p-2 hover:bg-red-900/30 text-gray-400 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-900/50">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Main Mixer Area */}
            <div className="flex-1 overflow-hidden p-6">
                <div className="h-full bg-[#111] border border-[#222] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                    
                    {/* Deck Info Section */}
                    <div className="h-16 shrink-0 border-b border-[#222] bg-gradient-to-b from-[#1a1a1a] to-[#111] flex items-center px-8 justify-center">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-gray-500 font-bold tracking-widest mb-1">NOW PLAYING (STEMS)</span>
                            <span className="text-lg font-bold text-white truncate max-w-md">
                                {remoteTrackName}
                            </span>
                        </div>
                    </div>

                    {/* Faders Section */}
                    <div className="flex-1 flex p-6 gap-2 overflow-x-auto">
                        {channels.map((channel, idx) => {
                            const vuHeight = vuLevels[channel.id] || 0;
                            
                            return (
                                <div key={channel.id} className={`flex-1 min-w-[120px] max-w-[180px] bg-[#0a0a0a] border border-[#222] rounded-xl flex flex-col items-center py-4 relative group ${channel.type === 'master' ? 'border-teal-900/50 bg-[#0d1515] ml-auto mr-0' : ''}`}>
                                    
                                    {/* Channel Header */}
                                    <div className="text-center mb-6 w-full px-2">
                                        <div className={`text-[10px] font-black tracking-widest ${channel.type === 'master' ? 'text-teal-400' : 'text-gray-500'}`}>
                                            CH {idx === 0 ? 'M' : idx}
                                        </div>
                                        <div className="text-xs font-bold text-white mt-1 truncate">
                                            {channel.name}
                                        </div>
                                    </div>

                                    {/* Fader Track */}
                                    <div className="flex-1 w-full flex justify-center relative my-4 min-h-[200px]">
                                        <div className="w-2 h-full bg-[#111] border border-[#000] rounded-full shadow-inner relative flex justify-center">
                                            {/* Volume Marks */}
                                            <div className="absolute inset-y-0 -left-4 w-2 flex flex-col justify-between py-2 text-[8px] text-gray-600 font-mono">
                                                <span>+6</span><span>0</span><span>-6</span><span>-12</span><span>-24</span><span>-inf</span>
                                            </div>
                                            
                                            {/* Fader Handle */}
                                            <input
                                                type="range"
                                                min="0"
                                                max="120"
                                                value={channel.volume}
                                                onChange={(e) => updateVolume(channel.id, parseInt(e.target.value))}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize z-20"
                                                style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
                                            />
                                            
                                            {/* Visual Fader Cap */}
                                            <div 
                                                className={`absolute w-12 h-6 ${channel.color} rounded-sm shadow-xl z-10 pointer-events-none flex items-center justify-center border-b-2 border-black/40`}
                                                style={{ bottom: `${(channel.volume / 120) * 100}%`, transform: 'translateY(50%)' }}
                                            >
                                                <div className="w-8 h-0.5 bg-black/50"></div>
                                            </div>

                                            {/* Real VU Meter Fill! */}
                                            {!channel.isMuted && vuHeight > 0 && (
                                                <div 
                                                    className="absolute bottom-0 w-1 bg-gradient-to-t from-green-500 via-yellow-400 to-red-500 rounded-full opacity-80" 
                                                    style={{ height: `${Math.min(vuHeight, 100)}%` }}
                                                ></div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Mute/Solo */}
                                    <div className="mt-4 flex flex-col gap-2">
                                        <button 
                                            onClick={() => toggleMute(channel.id)}
                                            className={`w-10 h-8 rounded text-[10px] font-bold border transition-colors ${channel.isMuted ? 'bg-red-500/20 text-red-500 border-red-500' : 'bg-[#1a1a1a] text-gray-500 border-[#333] hover:border-gray-500'}`}
                                        >
                                            MUTE
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
