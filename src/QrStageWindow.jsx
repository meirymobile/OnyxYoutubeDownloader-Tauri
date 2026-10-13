import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Maximize, Minimize, Music, Sparkles, X, Radio, Disc, MapPin } from 'lucide-react';

export default function QrStageWindow() {
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('onyx_guest_room') || 'SHAZZ-SONIC');
  const [webHostUrl, setWebHostUrl] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_host_url');
    if (saved && (saved.startsWith('http://') || saved.startsWith('https://'))) return saved;
    return 'https://onyx-requests.vercel.app';
  });
  const [geoEnabled, setGeoEnabled] = useState(() => localStorage.getItem('onyx_guest_geo_enabled') !== 'false');
  const [geoRadius, setGeoRadius] = useState(() => localStorage.getItem('onyx_guest_geo_radius') || '30');
  const [djLat, setDjLat] = useState(() => localStorage.getItem('onyx_guest_lat'));
  const [djLon, setDjLon] = useState(() => localStorage.getItem('onyx_guest_lon'));
  const [isActive, setIsActive] = useState(() => localStorage.getItem('onyx_guest_active') === 'true');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef(null);

  // Sync state from localStorage & storage events
  useEffect(() => {
    const syncState = () => {
      setRoomCode(localStorage.getItem('onyx_guest_room') || 'SHAZZ-SONIC');
      const savedHost = localStorage.getItem('onyx_guest_host_url');
      setWebHostUrl((savedHost && (savedHost.startsWith('http://') || savedHost.startsWith('https://'))) ? savedHost : 'https://onyx-requests.vercel.app');
      setIsActive(localStorage.getItem('onyx_guest_active') === 'true');
      setGeoEnabled(localStorage.getItem('onyx_guest_geo_enabled') !== 'false');
      setGeoRadius(localStorage.getItem('onyx_guest_geo_radius') || '30');
      setDjLat(localStorage.getItem('onyx_guest_lat'));
      setDjLon(localStorage.getItem('onyx_guest_lon'));
    };

    window.addEventListener('storage', syncState);
    const interval = setInterval(syncState, 1500);
    return () => {
      window.removeEventListener('storage', syncState);
      clearInterval(interval);
    };
  }, []);

  const buildTargetUrl = () => {
    try {
      const url = new URL(webHostUrl);
      url.searchParams.set('room', roomCode);
      if (geoEnabled && djLat && djLon) {
        url.searchParams.set('lat', String(djLat));
        url.searchParams.set('lon', String(djLon));
        url.searchParams.set('rad', String(geoRadius));
      }
      return url.toString();
    } catch {
      return `${webHostUrl}${webHostUrl.includes('?') ? '&' : '?'}room=${encodeURIComponent(roomCode)}`;
    }
  };

  const targetUrl = buildTargetUrl();

  // Generate ultra high resolution QR code for big screens
  useEffect(() => {
    QRCode.toDataURL(targetUrl, {
      width: 600,
      margin: 1.5,
      color: {
        dark: '#05020a',
        light: '#ffffff'
      }
    }).then(setQrDataUrl).catch(console.error);
  }, [targetUrl]);

  // Stage Spotlight & Equalizer Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let angle = 0;
    const render = () => {
      animId = requestAnimationFrame(render);
      angle += 0.015;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // 1. Moving Stage Spotlights
      const spots = [
        { x: w * 0.25 + Math.sin(angle) * (w * 0.15), color: 'rgba(168, 85, 247, 0.18)' },
        { x: w * 0.75 + Math.cos(angle * 1.2) * (w * 0.15), color: 'rgba(56, 189, 248, 0.18)' },
        { x: w * 0.5 + Math.sin(angle * 0.8) * (w * 0.2), color: 'rgba(245, 158, 11, 0.15)' }
      ];

      spots.forEach(s => {
        const grad = ctx.createRadialGradient(s.x, h * 0.45, 20, s.x, h * 0.45, Math.min(w, h) * 0.55);
        grad.addColorStop(0, s.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });

      // 2. Animated Stage Floor Equalizer
      const bars = 48;
      const barWidth = w / bars;
      for (let i = 0; i < bars; i++) {
        const barH = 15 + Math.abs(Math.sin(angle * 2 + i * 0.25)) * 45;
        const gradBar = ctx.createLinearGradient(0, h, 0, h - barH);
        gradBar.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
        gradBar.addColorStop(1, 'rgba(56, 189, 248, 0.05)');
        ctx.fillStyle = gradBar;
        ctx.fillRect(i * barWidth, h - barH, barWidth - 3, barH);
      }
    };

    render();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const closeWindow = () => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('close_qr_stage_window').catch(() => window.close());
    }).catch(() => window.close());
  };

  return (
    <div className="w-screen h-screen bg-[#07020d] text-white flex flex-col justify-between items-center p-6 md:p-10 select-none overflow-hidden relative font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />

      {/* Floating Controls Top Bar */}
      <div className="w-full flex justify-between items-center z-20 shrink-0" data-tauri-drag-region="true">
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur-md flex items-center gap-2">
            <Radio className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
            <span className="text-xs font-bold font-mono tracking-wider">
              {isActive ? 'STAGE ON AIR' : 'EVENT STANDBY'}
            </span>
          </div>

          <div className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/30">
            ROOM: {roomCode}
          </div>

          {geoEnabled && djLat && djLon && (
            <div className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>GEOFENCE: {geoRadius}M</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={toggleFullscreen} 
            className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 backdrop-blur-md transition-all shadow"
            title="מסך מלא (F11)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
          
          <button 
            onClick={closeWindow}
            className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 border border-slate-700/60 backdrop-blur-md transition-all shadow"
            title="סגור חלון"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Stage Presentation */}
      <div className="flex-1 flex flex-col items-center justify-center text-center z-10 max-w-2xl my-auto animate-fadeIn">
        
        {/* DJ Main Title */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-wider bg-gradient-to-r from-amber-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(168,85,247,0.5)]">
            {djNames}
          </h1>
          <p className="text-xs md:text-sm font-bold tracking-[6px] text-cyan-400 uppercase mt-1">
            LIVE GUEST REQUESTS &bull; עמדת בקשות שירים
          </p>
        </div>

        {isActive ? (
          /* ACTIVE EVENT: HUGE QR CODE CARD */
          <div className="relative group">
            {/* Luminous Neon Frame */}
            <div className="absolute -inset-3 bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 rounded-[38px] blur-xl opacity-70 group-hover:opacity-100 transition-opacity animate-pulse duration-1000" />
            
            <div className="relative p-6 md:p-8 bg-white rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex flex-col items-center">
              {qrDataUrl && (
                <img 
                  src={qrDataUrl} 
                  className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 object-contain" 
                  alt="Guest Requests QR" 
                />
              )}
              
              <div className="mt-4 pt-3 border-t border-slate-200/80 w-full flex justify-between items-center text-slate-900 font-mono font-bold text-xs md:text-sm">
                <span>ONYX STAGE DISPLAY</span>
                <span className="text-amber-600 tracking-wider">#{roomCode}</span>
              </div>
            </div>
          </div>
        ) : (
          /* CLOSED EVENT: ALTERNATIVE 3 STAGE VINYL THEME */
          <div className="bg-slate-950/80 border border-purple-500/30 rounded-3xl p-8 backdrop-blur-xl shadow-2xl flex flex-col items-center max-w-md">
            <div className="w-32 h-32 rounded-full border-4 border-amber-500/40 bg-black flex items-center justify-center mb-5 shadow-[0_0_35px_rgba(245,158,11,0.3)] animate-spin" style={{ animationDuration: '20s' }}>
              <Disc className="w-16 h-16 text-amber-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">המוזיקה נחה... 💿</h2>
            <p className="text-sm text-slate-300 font-light leading-relaxed">
              עמדת הבקשות כבויה כרגע. נתראה באירוע הבא ברחבה!
            </p>
          </div>
        )}

        {/* Bottom Callout Instructions */}
        {isActive && (
          <div className="mt-6 md:mt-8 space-y-1">
            <h3 className="text-lg md:text-2xl font-black text-white flex items-center justify-center gap-2">
              <span>סרקו מהטלפון ובקשו שיר ישירות לדיג'יי</span>
              <Music className="w-5 h-5 text-amber-400" />
            </h3>
            <p className="text-xs md:text-sm text-slate-400 font-medium">
              השיר שתבחרו ביוטיוב ייכנס מיידית לעמדת הדיג'יי
            </p>
          </div>
        )}
      </div>

      {/* Stage Footer */}
      <footer className="text-[11px] font-mono text-slate-500 tracking-widest text-center z-10 shrink-0 uppercase">
        POWERED BY ONYX &bull; {djNames} &bull; LIVE STAGE DISPLAY
      </footer>
    </div>
  );
}
