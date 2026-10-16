import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Maximize, Minimize, Music, Sparkles, X, Radio, Disc, MapPin } from 'lucide-react';

export default function QrStageWindow() {
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('onyx_guest_room') || 'SHAZZ-SONIC');
  const [djNames, setDjNames] = useState(() => localStorage.getItem('onyx_guest_dj_names') || 'DJ Shazz & DJ Sonic');
  const [webHostUrl, setWebHostUrl] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_host_url');
    if (saved && (saved.startsWith('http://') || saved.startsWith('https://')) && !saved.includes('onyx-requests.vercel.app')) return saved;
    return 'https://dj-onyxdownloader-guest-requests.vercel.app';
  });
  const [geoEnabled, setGeoEnabled] = useState(() => localStorage.getItem('onyx_guest_geo_enabled') !== 'false');
  const [geoRadius, setGeoRadius] = useState(() => localStorage.getItem('onyx_guest_geo_radius') || '30');
  const [djLat, setDjLat] = useState(() => localStorage.getItem('onyx_guest_lat'));
  const [djLon, setDjLon] = useState(() => localStorage.getItem('onyx_guest_lon'));
  const [isActive, setIsActive] = useState(() => localStorage.getItem('onyx_guest_active') === 'true');
  const [spotlight, setSpotlight] = useState(() => {
    try {
      const saved = localStorage.getItem('onyx_stage_spotlight');
      return saved ? JSON.parse(saved) : { active: false };
    } catch {
      return { active: false };
    }
  });
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qrTransform, setQrTransform] = useState('translate(0px, 0px) scale(1)');
  const canvasRef = useRef(null);
  const qrRef = useRef(null);

  // Dual-layer image crossfade state
  const [photoA, setPhotoA] = useState('');
  const [photoB, setPhotoB] = useState('');
  const [activePhotoSlot, setActivePhotoSlot] = useState('none');

  // Spotlight card fade transition state
  const [displayedSpotlight, setDisplayedSpotlight] = useState(() => {
    try {
      const saved = localStorage.getItem('onyx_stage_spotlight');
      const parsed = saved ? JSON.parse(saved) : null;
      return (parsed && parsed.active) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [cardVisible, setCardVisible] = useState(() => {
    try {
      const saved = localStorage.getItem('onyx_stage_spotlight');
      const parsed = saved ? JSON.parse(saved) : null;
      return !!(parsed && parsed.active);
    } catch {
      return false;
    }
  });
  const cardTransitionRef = useRef(null);
  const currentKeyRef = useRef('');

  // Sync state from localStorage & storage events
  useEffect(() => {
    const syncState = () => {
      setRoomCode(localStorage.getItem('onyx_guest_room') || 'SHAZZ-SONIC');
      setDjNames(localStorage.getItem('onyx_guest_dj_names') || 'DJ Shazz & DJ Sonic');
      const savedHost = localStorage.getItem('onyx_guest_host_url');
      setWebHostUrl((savedHost && (savedHost.startsWith('http://') || savedHost.startsWith('https://')) && !savedHost.includes('onyx-requests.vercel.app')) ? savedHost : 'https://dj-onyxdownloader-guest-requests.vercel.app');
      setIsActive(localStorage.getItem('onyx_guest_active') === 'true');
      setGeoEnabled(localStorage.getItem('onyx_guest_geo_enabled') !== 'false');
      setGeoRadius(localStorage.getItem('onyx_guest_geo_radius') || '30');
      setDjLat(localStorage.getItem('onyx_guest_lat'));
      setDjLon(localStorage.getItem('onyx_guest_lon'));

      try {
        const savedSpotlight = localStorage.getItem('onyx_stage_spotlight');
        if (savedSpotlight) {
          const parsed = JSON.parse(savedSpotlight);
          if (parsed && parsed.active) {
            setSpotlight(parsed);
          } else {
            setSpotlight({ active: false });
          }
        } else {
          setSpotlight({ active: false });
        }
      } catch {
        setSpotlight({ active: false });
      }
    };

    window.addEventListener('storage', syncState);
    const interval = setInterval(syncState, 1000);
    return () => {
      window.removeEventListener('storage', syncState);
      clearInterval(interval);
    };
  }, []);

  // Guarantee stage screen returns to main QR screen whenever room changes (e.g. New Event)
  const lastRoomRef = useRef(null);
  useEffect(() => {
    if (lastRoomRef.current && lastRoomRef.current !== roomCode) {
      setSpotlight({ active: false });
      setActivePhotoSlot('none');
    }
    lastRoomRef.current = roomCode;
  }, [roomCode]);

  // Dual-layer image crossfade controller
  useEffect(() => {
    if (!spotlight.active || !spotlight.photo) {
      setActivePhotoSlot('none');
      return;
    }

    const newPhoto = spotlight.photo;
    const currentActivePhoto = activePhotoSlot === 'a' ? photoA : (activePhotoSlot === 'b' ? photoB : null);

    if (newPhoto === currentActivePhoto) return;

    // Preload image before initiating smooth crossfade
    const img = new Image();
    img.onload = () => {
      if (activePhotoSlot === 'a') {
        setPhotoB(newPhoto);
        setActivePhotoSlot('b');
      } else {
        setPhotoA(newPhoto);
        setActivePhotoSlot('a');
      }
    };
    img.src = newPhoto;
  }, [spotlight.photo, spotlight.active]);

  // Smoothly fade out text card, update content/position, and fade back in
  useEffect(() => {
    if (!spotlight || !spotlight.active) {
      currentKeyRef.current = '';
      if (cardTransitionRef.current) clearTimeout(cardTransitionRef.current);
      setCardVisible(false);
      const timer = setTimeout(() => {
        setDisplayedSpotlight(null);
      }, 500);
      return () => clearTimeout(timer);
    }

    const newKey = `${spotlight.requester || ''}:::${spotlight.songTitle || ''}:::${spotlight.note || ''}:::${spotlight.photo || ''}:::${spotlight.textPosition?.x ?? 50}:::${spotlight.textPosition?.y ?? 75}:::${spotlight.textScale ?? 1}`;

    if (newKey === currentKeyRef.current && cardVisible) {
      return;
    }

    if (cardVisible && displayedSpotlight) {
      // Transitioning between two spotlights: fade out old card, update content, fade in new card
      if (cardTransitionRef.current) clearTimeout(cardTransitionRef.current);
      setCardVisible(false);
      cardTransitionRef.current = setTimeout(() => {
        currentKeyRef.current = newKey;
        setDisplayedSpotlight(spotlight);
        setCardVisible(true);
      }, 400);
    } else {
      // First activation or immediate update
      if (cardTransitionRef.current) clearTimeout(cardTransitionRef.current);
      currentKeyRef.current = newKey;
      setDisplayedSpotlight(spotlight);
      requestAnimationFrame(() => {
        setCardVisible(true);
      });
    }

    return () => {
      if (cardTransitionRef.current) clearTimeout(cardTransitionRef.current);
    };
  }, [spotlight]);

  // Butter-Smooth Glide to Top-Left Corner
  useEffect(() => {
    const handleGlide = () => {
      if (spotlight.active) {
        if (qrRef.current) {
          qrRef.current.style.transform = 'translate(0px, 0px) scale(1)';
          const rect = qrRef.current.getBoundingClientRect();
          const targetX = 32;
          const targetY = 32;
          const deltaX = targetX - rect.left;
          const deltaY = targetY - rect.top;
          setQrTransform(`translate(${deltaX}px, ${deltaY}px) scale(0.62)`);
        }
      } else {
        setQrTransform('translate(0px, 0px) scale(1)');
      }
    };

    handleGlide();
    window.addEventListener('resize', handleGlide);
    return () => window.removeEventListener('resize', handleGlide);
  }, [spotlight.active]);

  const buildTargetUrl = () => {
    try {
      const validBase = (webHostUrl && (webHostUrl.startsWith('http://') || webHostUrl.startsWith('https://')) && !webHostUrl.includes('onyx-requests.vercel.app'))
        ? webHostUrl
        : 'https://dj-onyxdownloader-guest-requests.vercel.app';
      const url = new URL(validBase);
      url.searchParams.set('room', roomCode);
      if (isActive) {
        url.searchParams.set('live', 'true');
      }
      if (geoEnabled && djLat && djLon) {
        url.searchParams.set('lat', String(djLat));
        url.searchParams.set('lon', String(djLon));
        url.searchParams.set('rad', String(geoRadius));
      }
      return url.toString();
    } catch {
      return `https://dj-onyxdownloader-guest-requests.vercel.app?room=${encodeURIComponent(roomCode)}${isActive ? '&live=true' : ''}`;
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
      <div className="w-full flex justify-between items-center z-30 shrink-0 pointer-events-none" data-tauri-drag-region="true">
        <div className={`flex items-center gap-3 transition-all duration-700 pointer-events-auto ${spotlight.active ? 'opacity-0 -translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
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

        <div className={`flex items-center gap-2 transition-all duration-700 pointer-events-auto ${spotlight.active ? 'opacity-30 hover:opacity-100' : 'opacity-100'}`}>
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

      {/* Spotlight Media Backdrop with Dual-Layer Crossfade */}
      <div 
        className={`fixed inset-0 z-[5] pointer-events-none transition-opacity duration-1000 overflow-hidden ${
          spotlight.active ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {photoA && (
          <img 
            src={photoA} 
            alt="" 
            className={`absolute inset-0 w-full h-full object-cover filter brightness-[0.55] contrast-[1.15] transition-opacity duration-[1400ms] ease-in-out ${
              activePhotoSlot === 'a' ? 'opacity-100 scale-108' : 'opacity-0 scale-100'
            }`}
            style={{ transitionProperty: 'opacity, transform', transitionDuration: '1400ms, 16000ms' }}
          />
        )}
        {photoB && (
          <img 
            src={photoB} 
            alt="" 
            className={`absolute inset-0 w-full h-full object-cover filter brightness-[0.55] contrast-[1.15] transition-opacity duration-[1400ms] ease-in-out ${
              activePhotoSlot === 'b' ? 'opacity-100 scale-108' : 'opacity-0 scale-100'
            }`}
            style={{ transitionProperty: 'opacity, transform', transitionDuration: '1400ms, 16000ms' }}
          />
        )}
        <div className="absolute inset-0 bg-radial-[circle_at_center,rgba(5,2,10,0.25)_20%,rgba(5,2,10,0.9)_85%]" />
      </div>

      {/* Spotlight Dedication Card - Positioned dynamically from guest mobile simulator with smooth fade transitions */}
      {displayedSpotlight && (
        <div 
          className={`fixed z-20 flex flex-col items-center justify-center text-center p-[1.2vw_2.2vw] rounded-[2.2vw] bg-[rgba(10,4,18,0.88)] border border-white/20 backdrop-blur-2xl shadow-[0_1vw_3vw_rgba(0,0,0,0.85),0_0_2vw_rgba(168,85,247,0.35)] transition-all duration-500 ease-out pointer-events-none max-w-[75vw] w-max ${
            cardVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{
            left: `${displayedSpotlight.textPosition?.x ?? 50}%`,
            top: `${displayedSpotlight.textPosition?.y ?? 75}%`,
            transform: `translate(-50%, -50%) scale(${(displayedSpotlight.textScale ?? 1) * (cardVisible ? 1 : 0.95)})`,
          }}
        >
          <div className="inline-flex items-center gap-[0.35vw] px-[0.9vw] py-[0.25vw] rounded-full bg-amber-500/20 border border-amber-500/60 text-amber-300 font-black text-[1.05vw] tracking-wider shadow-[0_0_1.5vw_rgba(245,158,11,0.3)] animate-pulse mb-[0.4vw] whitespace-nowrap">
            <Sparkles className="w-[1.05vw] h-[1.05vw] text-amber-400" />
            <span>מתנגן עכשיו לבקשת הקהל!</span>
            <Sparkles className="w-[1.05vw] h-[1.05vw] text-amber-400" />
          </div>

          {/* LINE 1: Requester Name - Large & Colorful */}
          <div 
            className="inline-flex items-center justify-center gap-[0.4vw] font-black text-[2.25vw] bg-gradient-to-r from-white via-cyan-400 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-[0_0_1.5vw_rgba(56,189,248,0.4)] leading-tight mb-[0.4vw] max-w-[70vw] whitespace-nowrap"
            dir="rtl"
            style={{ unicodeBidi: 'plaintext' }}
          >
            <span className="text-[1.9vw] text-pink-400" style={{ WebkitTextFillColor: 'initial' }}>❤️</span>
            <span>הוקדש ע״י </span>
            <span>{displayedSpotlight.requester || 'אורח ברחבה'}</span>
          </div>

          {/* LINE 2: Dedication Note - Large & Colorful */}
          {displayedSpotlight.note && displayedSpotlight.note.trim() && (
            <div 
              className="flex items-center justify-center gap-[0.35vw] font-black text-[2.25vw] bg-clip-text text-transparent leading-tight mb-[0.4vw] max-w-[70vw]"
              dir="rtl"
              style={{
                backgroundImage: 'linear-gradient(135deg, #ffffff 0%, #fde047 30%, #fb7185 65%, #e879f9 100%)',
                filter: 'drop-shadow(0 0 1.5vw rgba(251,113,133,0.4))',
                unicodeBidi: 'plaintext'
              }}
            >
              <span className="text-[2.4vw] font-serif text-amber-300 opacity-95 leading-none select-none" style={{ WebkitTextFillColor: '#fde047', filter: 'drop-shadow(0 0 0.8vw rgba(253,224,71,0.5))' }}>“</span>
              <p className="text-center font-black">
                {displayedSpotlight.note}
              </p>
              <span className="text-[2.4vw] font-serif text-amber-300 opacity-95 leading-none select-none" style={{ WebkitTextFillColor: '#fde047', filter: 'drop-shadow(0 0 0.8vw rgba(253,224,71,0.5))' }}>”</span>
            </div>
          )}

          {/* LINE 3: Song Title & Artist - Smallest at the bottom */}
          <div 
            className="inline-flex items-center justify-center gap-[0.4vw] text-[1.15vw] font-bold text-slate-200 bg-[rgba(15,7,26,0.7)] px-[1.2vw] py-[0.3vw] rounded-full border border-white/15 backdrop-blur-md shadow-md mb-[0.2vw] max-w-[68vw] truncate whitespace-nowrap"
            dir="rtl"
            style={{ unicodeBidi: 'plaintext' }}
          >
            <span className="text-[1.1vw]">🎵</span>
            <span>{displayedSpotlight.songTitle || 'שיר לבקשת הקהל'}</span>
          </div>
        </div>
      )}

      {/* Center Stage Presentation */}
      <div className="flex-1 flex flex-col items-center justify-center text-center z-40 w-full max-w-4xl my-auto animate-fadeIn px-2 md:px-4">
        
        {/* DJ Main Title */}
        <div className={`mb-3 md:mb-5 transition-all duration-700 ${spotlight.active ? 'opacity-0 -translate-y-6 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-wider bg-gradient-to-r from-amber-300 via-purple-300 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_35px_rgba(168,85,247,0.5)]">
            {djNames}
          </h1>
          <p className="text-xs md:text-sm font-bold tracking-[6px] text-cyan-400 uppercase mt-1">
            LIVE GUEST REQUESTS &bull; עמדת בקשות שירים
          </p>
        </div>

        {isActive ? (
          /* ACTIVE EVENT: OPTIMIZED STAGE QR CODE CARD WITH SMOOTH CORNER GLIDE */
          <div 
            ref={qrRef} 
            className="relative group origin-top-left"
            style={{ 
              transform: qrTransform, 
              transition: 'transform 1.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 1s ease',
              zIndex: 50 
            }}
          >
            {/* Luminous Neon Frame */}
            <div className="absolute -inset-3 bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 rounded-[34px] blur-xl opacity-75 group-hover:opacity-100 transition-opacity animate-pulse duration-1000" />
            
            <div className="relative p-4 sm:p-5 md:p-6 bg-white rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex flex-col items-center">
              {qrDataUrl && (
                <img 
                  src={qrDataUrl} 
                  className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 lg:w-72 lg:h-72 object-contain" 
                  alt="Guest Requests QR" 
                />
              )}
              
              <div className="mt-2.5 pt-2 border-t border-slate-200/80 w-full flex justify-between items-center text-slate-900 font-mono font-bold text-xs sm:text-sm">
                <span>{spotlight.active ? 'סרקו גם אתם!' : 'ONYX STAGE DISPLAY'}</span>
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

        {/* Bottom Callout Instructions - Enriched, Huge Font & Crystal-Clear for Dancefloor Crowd */}
        {isActive && (
          <div className={`mt-5 md:mt-7 space-y-2 md:space-y-3 w-full max-w-3xl px-2 transition-all duration-700 ${spotlight.active ? 'opacity-0 translate-y-6 pointer-events-none' : 'opacity-100 translate-y-0'}`} dir="rtl">
            {/* Primary Action Title */}
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white flex items-center justify-center gap-2 md:gap-3 drop-shadow-[0_4px_20px_rgba(245,158,11,0.6)]">
              <Music className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 text-amber-400 shrink-0 animate-bounce" />
              <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-yellow-100 bg-clip-text text-transparent">
                סרקו מהטלפון ובקשו שיר ישירות לדיג'יי!
              </span>
            </h2>

            {/* Explanatory Subtitle */}
            <p className="text-base sm:text-xl md:text-2xl lg:text-3xl font-extrabold text-cyan-200 leading-snug drop-shadow-md">
              בחרו שיר והקדשה והם ישלחו מיידית לבדיקת ה Dj ברחבה 🎵
            </p>

            {/* Visual Step-by-Step Pill Badge for Dancefloor Crowd */}
            <div className="pt-1 flex justify-center">
              <div className="inline-flex items-center gap-2 md:gap-3 px-5 py-2 md:px-8 md:py-2.5 rounded-full bg-slate-900/90 border border-amber-400/40 shadow-[0_0_25px_rgba(245,158,11,0.25)] backdrop-blur-md">
                <span className="text-amber-400 font-black text-xs sm:text-sm md:text-base lg:text-lg tracking-wide">
                  1. פותחים מצלמה &bull; 2. סורקים את הברקוד &bull; 3. בוחרים שיר &bull; 4. שומעים ברחבה!
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stage Footer */}
      <footer className={`text-[11px] font-mono text-slate-500 tracking-widest text-center z-10 shrink-0 uppercase transition-all duration-700 ${spotlight.active ? 'opacity-0 translate-y-6 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
        POWERED BY ONYX &bull; {djNames} &bull; LIVE STAGE DISPLAY
      </footer>
    </div>
  );
}
