import React, { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Music } from 'lucide-react'

const DjayFloatingIcon = () => {
  const [isHovered, setIsHovered] = useState(false);

  const handleDrag = useCallback(async (e) => {
    // Only drag on left click or touch
    if (e.buttons === 1 || e.type === "touchstart") {
      try {
        await invoke("start_djay_float_drag");
      } catch (e) {
        console.error("Failed to start drag:", e);
      }
    }
  }, []);

  const handleRestore = useCallback(async (e) => {
    try {
      await invoke("restore_djay_companion");
    } catch (e) {
      console.error("Failed to restore companion:", e);
    }
  }, []);

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden p-1 flex items-center justify-center select-none">
      <div 
        onPointerDown={handleDrag}
        onTouchStart={handleDrag}
        onClick={handleRestore}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`w-full h-full rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 relative
          ${isHovered ? 'bg-slate-800/90 scale-105 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-slate-900/80 scale-100 shadow-[0_0_15px_rgba(16,185,129,0.2)]'} 
          border border-white/10 backdrop-blur-xl group`}
      >
        <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-emerald-500/50" style={{ animationDuration: '3s' }}></div>
        <div className={`w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-transform duration-300 ${isHovered ? 'rotate-12' : ''}`}>
          <Music className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  )
}

export default DjayFloatingIcon
