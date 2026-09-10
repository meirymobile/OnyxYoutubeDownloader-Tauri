import React, { useCallback, useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Music, Check, AlertCircle } from 'lucide-react'

const DjayFloatingIcon = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [statusObj, setStatusObj] = useState({ status: 'idle', progress: '' });

  useEffect(() => {
    const checkStatus = () => {
      const saved = localStorage.getItem('djay_global_status');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setStatusObj(parsed);
        } catch (e) {}
      }
    };
    
    checkStatus();
    window.addEventListener('storage', checkStatus);
    const interval = setInterval(checkStatus, 1000);
    
    return () => {
      window.removeEventListener('storage', checkStatus);
      clearInterval(interval);
    };
  }, []);

  const handleDrag = useCallback(async (e) => {
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

  const { status, progress } = statusObj;
  
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  let strokeDashoffset = circumference;
  let isIndeterminate = false;

  if (status === 'downloading' && progress) {
    const p = parseFloat(progress);
    if (isNaN(p) || p >= 100) {
      isIndeterminate = true;
      strokeDashoffset = circumference * 0.75; // 25% filled arc for spinner
    } else {
      strokeDashoffset = circumference - (p / 100) * circumference;
    }
  } else if (status === 'success') {
    strokeDashoffset = 0;
  } else if (status === 'downloading' && !progress) {
    isIndeterminate = true;
    strokeDashoffset = circumference * 0.75;
  }

  let innerGradient = "from-emerald-500 to-emerald-400";
  let shadowColor = "shadow-emerald-500/30";
  let ringColor = "text-emerald-500";
  let pingColor = "bg-emerald-500/50";
  let Icon = Music;

  if (status === 'downloading') {
    innerGradient = "from-cyan-500 to-blue-500";
    shadowColor = "shadow-cyan-500/30";
    ringColor = "text-cyan-400";
    pingColor = "bg-cyan-500/50";
  } else if (status === 'success') {
    innerGradient = "from-green-500 to-emerald-400";
    shadowColor = "shadow-green-500/30";
    ringColor = "text-green-400";
    pingColor = "bg-green-500/50";
    Icon = Check;
  }

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
          ${status === 'error' ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-white/10'} backdrop-blur-xl group`}
      >
        {status === 'error' && (
          <div className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-md z-10 animate-pulse">
            <AlertCircle className="w-3 h-3 text-white" />
          </div>
        )}

        {(status === 'downloading' || status === 'success') && (
          <svg className={`absolute inset-0 w-full h-full pointer-events-none ${isIndeterminate ? 'animate-spin' : '-rotate-90'}`} viewBox="0 0 60 60">
            <circle 
              className="text-white/5" 
              strokeWidth="2" 
              stroke="currentColor" 
              fill="transparent" 
              r={radius} 
              cx="30" 
              cy="30" 
            />
            <circle 
              className={`${ringColor} ${isIndeterminate ? 'transition-none' : 'transition-all duration-300 ease-out'}`}
              strokeWidth="2" 
              strokeDasharray={circumference} 
              strokeDashoffset={strokeDashoffset} 
              strokeLinecap="round" 
              stroke="currentColor" 
              fill="transparent" 
              r={radius} 
              cx="30" 
              cy="30" 
            />
          </svg>
        )}

        <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${pingColor} transition-colors duration-500`} style={{ animationDuration: status === 'downloading' ? '1.5s' : '3s' }}></div>
        
        <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${innerGradient} flex items-center justify-center shadow-lg ${shadowColor} transition-all duration-500 ${isHovered ? 'rotate-12' : ''} ${(status === 'success') ? 'scale-110' : ''}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  )
}

export default DjayFloatingIcon
