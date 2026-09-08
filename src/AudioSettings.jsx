import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function AudioSettings({ onBack, onApply }) {
    const [devices, setDevices] = useState([]);
    const [inputDevice, setInputDevice] = useState('');
    const [outputDevice, setOutputDevice] = useState('');
    const [linkEnabled, setLinkEnabled] = useState(false);
    const [linkTempo, setLinkTempo] = useState(120.0);
    const [linkPeers, setLinkPeers] = useState(0);

    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const devs = await invoke('get_audio_devices');
                setDevices(devs);
                const outputs = devs.filter(d => d.is_output);
                const inputs = devs.filter(d => d.is_input);
                
                const savedOut = localStorage.getItem('onyx_out_device');
                const savedIn = localStorage.getItem('onyx_in_device');
                
                if (savedOut && outputs.find(d => d.name === savedOut)) {
                    setOutputDevice(savedOut);
                } else if(outputs.length > 0) {
                    setOutputDevice(outputs[0].name);
                }
                
                if (savedIn && inputs.find(d => d.name === savedIn)) {
                    setInputDevice(savedIn);
                } else if(inputs.length > 0) {
                    setInputDevice(inputs[0].name);
                }
            } catch (err) {
                console.error("Failed to get audio devices:", err);
            }
        };
        fetchDevices();

        const linkInterval = setInterval(async () => {
            try {
                const [enabled, tempo, peers] = await invoke('get_link_status');
                setLinkEnabled(enabled);
                setLinkTempo(tempo);
                setLinkPeers(peers);
            } catch (err) {
                console.error(err);
            }
        }, 1000);

        return () => clearInterval(linkInterval);
    }, []);

    const handleStartRouting = async () => {
        if (onApply) onApply(inputDevice, outputDevice);
    };

    return (
        <div className="bg-[#161616] h-full text-gray-200 p-8 flex flex-col font-sans relative overflow-y-auto w-full">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Audio Routing & Sync</h2>
                <button onClick={onBack} className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded text-sm transition">
                    Back to Downloader
                </button>
            </div>
            
            {/* Master Output Section */}
            <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-5 mb-6 shadow-sm">
                <h3 className="font-bold text-gray-200 mb-2">Master Output</h3>
                <p className="text-xs text-gray-500 mb-4">Where the final mixed audio is sent (To Speakers/Controller).</p>
                <select 
                    value={outputDevice} 
                    onChange={e => {
                        setOutputDevice(e.target.value);
                        localStorage.setItem('onyx_out_device', e.target.value);
                    }}
                    className="w-full bg-[#111] border border-[#333] text-white rounded p-3 outline-none"
                >
                    {devices.filter(d => d.is_output).map(d => (
                        <option key={d.name} value={d.name}>{d.name}</option>
                    ))}
                </select>
            </div>

            {/* Input Routing Section */}
            <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-5 mb-6 shadow-sm">
                <h3 className="font-bold text-gray-200 mb-2">Virtual Input Routing (Djay Pro Feed)</h3>
                <p className="text-xs text-gray-500 mb-4">Select the virtual audio cable (e.g. BlackHole) used in Djay Pro.</p>
                <div className="flex gap-3">
                    <select 
                        value={inputDevice} 
                        onChange={e => {
                            setInputDevice(e.target.value);
                            localStorage.setItem('onyx_in_device', e.target.value);
                        }}
                        className="flex-1 bg-[#111] border border-[#333] text-white rounded p-3 outline-none"
                    >
                        {devices.filter(d => d.is_input).map(d => (
                            <option key={d.name} value={d.name}>{d.name}</option>
                        ))}
                    </select>
                    <button 
                        onClick={async () => {
                            try {
                                const msg = await invoke('install_blackhole');
                                alert(msg);
                                // Refresh devices after install
                                const devs = await invoke('get_audio_devices');
                                setDevices(devs);
                            } catch (e) {
                                alert(e);
                            }
                        }}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded shadow text-sm font-bold whitespace-nowrap transition"
                    >
                        Install BlackHole
                    </button>
                </div>
            </div>

            {/* Ableton Link Section */}
            <div className="bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl p-5 mb-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="font-bold text-gray-200 mb-1">Ableton Link Clock Sync</h3>
                        <p className="text-xs text-gray-500">Synchronize Onyx Stems with Djay Pro / CDJs over network.</p>
                    </div>
                    <button 
                        onClick={async () => {
                            try {
                                await invoke('toggle_link', { enabled: !linkEnabled });
                            } catch (e) {
                                console.error(e);
                            }
                        }}
                        className={`px-6 py-2 rounded-lg font-bold text-sm shadow transition ${linkEnabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-[#333] hover:bg-[#444] text-gray-300'}`}
                    >
                        {linkEnabled ? 'LINK ON' : 'LINK OFF'}
                    </button>
                </div>
                {linkEnabled && (
                    <div className="bg-[#111] border border-[#333] rounded-lg p-3 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                            <span className="text-emerald-400 font-mono text-sm">{linkPeers} Peers Connected</span>
                        </div>
                        <div className="text-gray-300 font-mono text-xl">
                            {linkTempo.toFixed(2)} BPM
                        </div>
                    </div>
                )}
            </div>
            
            <button onClick={handleStartRouting} className="bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 rounded-lg shadow-lg mt-auto">
                Apply Routing & Start Mixer
            </button>
        </div>
    );
}
