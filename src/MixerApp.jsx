import { useState, useEffect } from 'react';
import MixerScreen from './MixerScreen.jsx';
import AudioSettings from './AudioSettings.jsx';

export default function MixerApp() {
    const [stemsPath, setStemsPath] = useState(localStorage.getItem('onyx_stems_path') || '');
    const [mixerConfig, setMixerConfig] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('onyx_mixer_config')) || { input: '', output: '' };
        } catch (e) {
            return { input: '', output: '' };
        }
    });
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        // Listen to storage events to sync state across windows instantly
        const handleStorageChange = (e) => {
            if (e.key === 'onyx_stems_path') {
                setStemsPath(e.newValue || '');
            } else if (e.key === 'onyx_mixer_config') {
                try {
                    setMixerConfig(JSON.parse(e.newValue) || { input: '', output: '' });
                } catch (err) {}
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Also poll occasionally in case storage events are missed (some WebViews drop them)
    useEffect(() => {
        const interval = setInterval(() => {
            const currentPath = localStorage.getItem('onyx_stems_path') || '';
            if (currentPath !== stemsPath) setStemsPath(currentPath);
        }, 1000);
        return () => clearInterval(interval);
    }, [stemsPath]);

    const handleApplySettings = (input, output) => {
        const config = { input, output };
        setMixerConfig(config);
        localStorage.setItem('onyx_mixer_config', JSON.stringify(config));
        setShowSettings(false);
    };

    return (
        <div className="w-screen h-screen bg-[#161616] text-white overflow-hidden">
            {showSettings ? (
                <AudioSettings 
                    onBack={() => setShowSettings(false)} 
                    onApply={handleApplySettings} 
                />
            ) : (
                <MixerScreen 
                    stemsPath={stemsPath}
                    mixerConfig={mixerConfig}
                    onClose={() => {
                        import('@tauri-apps/api/core').then(({ invoke }) => invoke('close_mixer_window')).catch(() => window.close());
                    }}
                    onOpenSettings={() => setShowSettings(true)}
                />
            )}
        </div>
    );
}
