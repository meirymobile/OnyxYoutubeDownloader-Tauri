import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  X, Radio, Power, RefreshCw, Copy, Check, ExternalLink, Play, 
  FolderOpen, Music, CheckCircle2, AlertCircle, Clock, Volume2, 
  QrCode, Maximize2, Minimize2, Settings2, User, MessageSquareHeart, Monitor,
  MapPin, Navigation, Compass
} from 'lucide-react';

export default function GuestRequestsModal({ 
  isOpen, 
  onClose, 
  serverPort = 8000, 
  onPlayInternal, 
  onOpenPath,
  directories 
}) {
  // Event State
  const [isActive, setIsActive] = useState(() => {
    return localStorage.getItem('onyx_guest_active') === 'true';
  });
  const [roomCode, setRoomCode] = useState(() => {
    return localStorage.getItem('onyx_guest_room') || 'SHAZZ-SONIC';
  });
  const [djNames, setDjNames] = useState(() => {
    return localStorage.getItem('onyx_guest_dj_names') || 'DJ Shazz & DJ Sonic';
  });
  const [webHostUrl, setWebHostUrl] = useState(() => {
    return localStorage.getItem('onyx_guest_host_url') || window.location.origin + '/Dj-OnyxDownloader-Guest-Requests/index.html';
  });
  const [autoDownload, setAutoDownload] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_auto_download');
    return saved !== null ? saved === 'true' : true;
  });

  // Requests Queue & Counter
  const [requestCounter, setRequestCounter] = useState(() => {
    return parseInt(localStorage.getItem('onyx_guest_counter') || '0', 10);
  });
  const [requests, setRequests] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('onyx_guest_requests_list') || '[]');
    } catch {
      return [];
    }
  });

  // Geofencing State
  const [geoEnabled, setGeoEnabled] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_geo_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [geoRadius, setGeoRadius] = useState(() => {
    return parseInt(localStorage.getItem('onyx_guest_geo_radius') || '30', 10);
  });
  const [djLat, setDjLat] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_lat');
    return saved ? parseFloat(saved) : null;
  });
  const [djLon, setDjLon] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_lon');
    return saved ? parseFloat(saved) : null;
  });
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');

  // UI States
  const [activeTab, setActiveTab] = useState('list'); // 'list', 'qr', 'settings'
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isBigQr, setIsBigQr] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('onyx_guest_active', String(isActive));
    localStorage.setItem('onyx_guest_room', roomCode);
    localStorage.setItem('onyx_guest_dj_names', djNames);
    localStorage.setItem('onyx_guest_host_url', webHostUrl);
    localStorage.setItem('onyx_guest_auto_download', String(autoDownload));
    localStorage.setItem('onyx_guest_counter', String(requestCounter));
    localStorage.setItem('onyx_guest_requests_list', JSON.stringify(requests));
    localStorage.setItem('onyx_guest_geo_enabled', String(geoEnabled));
    localStorage.setItem('onyx_guest_geo_radius', String(geoRadius));
    if (djLat !== null) localStorage.setItem('onyx_guest_lat', String(djLat));
    if (djLon !== null) localStorage.setItem('onyx_guest_lon', String(djLon));
  }, [isActive, roomCode, djNames, webHostUrl, autoDownload, requestCounter, requests, geoEnabled, geoRadius, djLat, djLon]);

  // Fetch DJ computer location
  const fetchDjLocation = () => {
    setIsFetchingLocation(true);
    setLocationStatus('דוגם מיקום נוכחי...');
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lon = parseFloat(pos.coords.longitude.toFixed(6));
          setDjLat(lat);
          setDjLon(lon);
          setIsFetchingLocation(false);
          setLocationStatus(`נדגם מיקום GPS: ${lat}, ${lon} (דיוק: ±${Math.round(pos.coords.accuracy)} מ')`);
        },
        async (err) => {
          console.warn("Navigator geolocation failed, using IP fallback:", err);
          try {
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            if (data && data.latitude && data.longitude) {
              const lat = parseFloat(data.latitude.toFixed(6));
              const lon = parseFloat(data.longitude.toFixed(6));
              setDjLat(lat);
              setDjLon(lon);
              setLocationStatus(`מיקום רשת: ${lat}, ${lon} (${data.city || 'מחשב דיג\'יי'})`);
            } else {
              setLocationStatus('לא ניתן לאתר מיקום');
            }
          } catch (e) {
            setLocationStatus('שגיאה בזיהוי מיקום');
          } finally {
            setIsFetchingLocation(false);
          }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    } else {
      setIsFetchingLocation(false);
      setLocationStatus('דפדפן אינו תומך במיקום');
    }
  };

  // Auto-fetch location on first load if not present
  useEffect(() => {
    if (!djLat || !djLon) {
      fetchDjLocation();
    }
  }, []);

  // Target Guest URL (includes room + geofence if active)
  const buildGuestUrl = () => {
    const url = new URL(webHostUrl);
    url.searchParams.set('room', roomCode);
    if (geoEnabled && djLat !== null && djLon !== null) {
      url.searchParams.set('lat', String(djLat));
      url.searchParams.set('lon', String(djLon));
      url.searchParams.set('rad', String(geoRadius));
    }
    return url.toString();
  };

  const targetGuestUrl = buildGuestUrl();

  // Generate QR Code
  useEffect(() => {
    QRCode.toDataURL(targetGuestUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    }).then(setQrDataUrl).catch(console.error);
  }, [targetGuestUrl]);

  // Synthesized notification chime on new incoming request
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(880, now + 0.12); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(659.25, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } catch (e) {
      console.warn("Chime error", e);
    }
  };

  // Check incoming requests (Firebase / LocalStorage Sync)
  useEffect(() => {
    const handleStorage = () => {
      const storageKey = 'onyx_requests_' + roomCode;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const incoming = JSON.parse(stored);
          if (Array.isArray(incoming) && incoming.length > 0) {
            incoming.forEach(req => processIncomingRequest(req));
            localStorage.removeItem(storageKey);
          }
        } catch (e) {}
      }
    };

    window.addEventListener('storage', handleStorage);
    const interval = setInterval(handleStorage, 1500);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, [roomCode, requestCounter, autoDownload]);

  // Process a newly received song request
  const processIncomingRequest = async (reqItem) => {
    // Avoid duplicates by URL or ID
    setRequests(prev => {
      if (prev.some(r => r.url === reqItem.url && r.timestamp === reqItem.timestamp)) {
        return prev;
      }

      const nextNum = (prev.length > 0 ? Math.max(...prev.map(r => r.num || 0)) : 0) + 1;
      const formattedNum = String(nextNum).padStart(2, '0');

      const newRequest = {
        id: reqItem.id || 'req_' + Date.now(),
        num: nextNum,
        formattedNum: formattedNum,
        title: reqItem.title,
        channel: reqItem.channel || 'YouTube',
        url: reqItem.url,
        thumbnail: reqItem.thumbnail,
        requester: reqItem.requester || 'אורח',
        note: reqItem.note || '',
        timestamp: reqItem.timestamp || Date.now(),
        status: 'pending', // 'pending', 'downloading', 'ready', 'played', 'error'
        jobId: null,
        filePath: null
      };

      // Play arrival sound
      playChime();

      // Trigger auto-download if active
      if (autoDownload && isActive) {
        setTimeout(() => triggerDownload(newRequest), 100);
      }

      return [newRequest, ...prev];
    });
  };

  // Trigger Local Download with Sequential Number Prefix
  const triggerDownload = async (item) => {
    setRequests(prev => prev.map(r => r.id === item.id ? { ...r, status: 'downloading' } : r));

    try {
      const audioDir = directories?.audio_dir ? `${directories.audio_dir}/GuestRequests` : '~/Downloads/OnyxAudio/GuestRequests';
      
      const payload = {
        url: item.url,
        formats: ['mp3'],
        audio_dir: audioDir,
        custom_prefix: item.formattedNum,
        bpm_suffix: true,
        spotify: true
      };

      const res = await fetch(`http://127.0.0.1:${serverPort}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data && data.job_id) {
        const jobId = data.job_id;
        setRequests(prev => prev.map(r => r.id === item.id ? { ...r, jobId } : r));

        // Poll for completion
        const pollTimer = setInterval(async () => {
          try {
            const statusRes = await fetch(`http://127.0.0.1:${serverPort}/api/download/${jobId}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === 'completed') {
                clearInterval(pollTimer);
                setRequests(prev => prev.map(r => r.id === item.id ? { 
                  ...r, 
                  status: 'ready', 
                  filePath: statusData.result_file 
                } : r));
              } else if (statusData.status === 'error') {
                clearInterval(pollTimer);
                setRequests(prev => prev.map(r => r.id === item.id ? { ...r, status: 'error' } : r));
              }
            }
          } catch (e) {
            clearInterval(pollTimer);
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to start download for guest request:", err);
      setRequests(prev => prev.map(r => r.id === item.id ? { ...r, status: 'error' } : r));
    }
  };

  // Start a fresh new event
  const startNewEvent = () => {
    if (requests.length > 0) {
      if (!window.confirm("האם לפתוח אירוע חדש? פעולה זו תאפס את רשימת הבקשות ואת המספור הרץ ל-01 ותייצר קוד אירוע חדש.")) {
        return;
      }
    }
    const newCode = `SHAZZ-${Math.floor(1000 + Math.random() * 9000)}`;
    setRoomCode(newCode);
    setRequestCounter(0);
    setRequests([]);
    setIsActive(true);
    localStorage.setItem('onyx_room_active_' + newCode, 'true');
  };

  // Toggle active/inactive
  const toggleActive = () => {
    const nextState = !isActive;
    setIsActive(nextState);
    localStorage.setItem('onyx_room_active_' + roomCode, String(nextState));
  };

  const copyLink = () => {
    navigator.clipboard.writeText(targetGuestUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const markAsPlayed = (id) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: r.status === 'played' ? 'ready' : 'played' } : r));
  };

  const openStageWindow = () => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('open_qr_stage_window').catch((err) => {
        console.warn("Tauri invoke failed, opening via browser window:", err);
        window.open('?qr_stage=true', 'OnyxQrStage', 'width=1024,height=768');
      });
    }).catch(() => {
      window.open('?qr_stage=true', 'OnyxQrStage', 'width=1024,height=768');
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md select-none font-sans" dir="rtl">
      
      {/* Fullscreen Big QR Modal */}
      {isBigQr && (
        <div className="fixed inset-0 z-[150] bg-black/95 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
          <button 
            onClick={() => setIsBigQr(false)} 
            className="absolute top-6 right-6 p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-7 h-7" />
          </button>

          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500 mb-2">
            {djNames}
          </h2>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-6">
            סרקו לבקשת שירים &bull; GUEST REQUESTS
          </p>

          <div className="p-6 bg-white rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.5)] mb-6">
            {qrDataUrl && <img src={qrDataUrl} className="w-72 h-72 md:w-96 md:h-96 object-contain" alt="QR Code" />}
          </div>

          <div className="text-xl font-mono text-amber-300 font-bold bg-slate-900 border border-slate-800 px-6 py-2.5 rounded-full mb-4">
            חדר: {roomCode}
          </div>
          <p className="text-xs text-slate-500">הקוד מפנה ישירות לעמוד החיפוש והבקשות בסמארטפון</p>
        </div>
      )}

      {/* Main Modal Card */}
      <div className="w-full max-w-4xl h-[90vh] max-h-[820px] bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Modal Header */}
        <div className="p-4 md:p-5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full ${isActive ? 'bg-emerald-500 shadow-[0_0_12px_#10b981] animate-pulse' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]'}`} />
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Guest Requests</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-slate-800 text-amber-400 border border-amber-500/30">
                  {roomCode}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                {isActive ? 'עמדת הבקשות פעילה ומקבלת שירים מהקהל' : 'העמדה כבויה (מוצג עמוד ויניל למבקרים: "נתראה באירוע הבא")'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Open External Stage Window Button */}
            <button 
              onClick={openStageWindow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-400/30 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
              title="פתח חלון נפרד להצגת קוד ה-QR על מקרן או מסך חיצוני לקהל"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>מסך מקרן / במה 🖥️</span>
            </button>

            {/* Active Toggle Switch */}
            <button 
              onClick={toggleActive}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                isActive 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isActive ? 'פעיל (ON)' : 'כבוי (OFF)'}</span>
            </button>

            {/* New Event Button */}
            <button 
              onClick={startNewEvent}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all shadow active:scale-95"
              title="פתיחת אירוע חדש ואיפוס המספור ל-01"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>אירוע חדש 🔄</span>
            </button>

            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Tabs Bar */}
        <div className="px-5 py-2.5 bg-slate-900/30 border-b border-slate-800/60 flex items-center justify-between shrink-0">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'list' ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <span>רשימת בקשות ({requests.length})</span>
            </button>

            <button 
              onClick={() => setActiveTab('qr')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'qr' ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>קוד QR וקישור לסריקה</span>
            </button>

            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'settings' ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>הגדרות</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5 cursor-pointer">
              <input 
                type="checkbox" 
                checked={autoDownload} 
                onChange={(e) => setAutoDownload(e.target.checked)}
                className="accent-purple-500 rounded cursor-pointer"
              />
              <span>הורדה אוטומטית (Auto-Download)</span>
            </label>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          
          {/* TAB 1: REQUESTS LIST */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center text-slate-500 space-y-3">
                  <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
                    <Music className="w-8 h-8 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-300">אין בקשות שירים עדיין</h3>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      הציגו את קוד ה-QR לאורחים. כל שיר שייבחר יופיע כאן מיידית עם מספר רץ (01, 02...) וירד אוטומטית למחשב.
                    </p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('qr')}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
                  >
                    הצג קוד QR לסריקה
                  </button>
                </div>
              ) : (
                requests.map((item) => (
                  <div 
                    key={item.id} 
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      item.status === 'played'
                        ? 'bg-slate-950/40 border-slate-900 opacity-60'
                        : item.status === 'ready'
                        ? 'bg-slate-900/80 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    {/* Number Badge & Track Meta */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {/* Sequential Number */}
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-slate-950 font-black text-base flex items-center justify-center shrink-0 shadow-md font-mono">
                        {item.formattedNum}
                      </div>

                      {/* Thumbnail */}
                      <img 
                        src={item.thumbnail} 
                        className="w-14 h-10 object-cover rounded-lg bg-black border border-slate-800 shrink-0" 
                        alt=""
                      />

                      {/* Title & Requester Details */}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs md:text-sm font-bold text-white truncate" title={item.title}>
                          {item.title}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                          <span className="text-slate-400 flex items-center gap-1 font-semibold">
                            <User className="w-3 h-3 text-purple-400" />
                            {item.requester}
                          </span>

                          {item.note && (
                            <span className="text-amber-300/90 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                              <MessageSquareHeart className="w-3 h-3 text-amber-400" />
                              "{item.note}"
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status & Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {/* Status Indicator */}
                      {item.status === 'downloading' && (
                        <span className="text-[11px] font-mono font-bold text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                          <RefreshCw className="w-3 h-3 animate-spin" /> מוריד...
                        </span>
                      )}

                      {item.status === 'ready' && (
                        <span className="text-[11px] font-mono font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> מוכן
                        </span>
                      )}

                      {item.status === 'error' && (
                        <button 
                          onClick={() => triggerDownload(item)}
                          className="text-[11px] font-bold text-rose-300 flex items-center gap-1 bg-rose-500/20 px-2.5 py-1 rounded-lg border border-rose-500/40 hover:bg-rose-500/30"
                        >
                          <AlertCircle className="w-3 h-3" /> נסה שוב
                        </button>
                      )}

                      {item.status === 'pending' && (
                        <button 
                          onClick={() => triggerDownload(item)}
                          className="text-[11px] font-bold text-purple-300 flex items-center gap-1 bg-purple-600/20 px-2.5 py-1 rounded-lg border border-purple-500/40 hover:bg-purple-600/30"
                        >
                          הורד עכשיו ⬇️
                        </button>
                      )}

                      {/* Play Button */}
                      {item.filePath && onPlayInternal && (
                        <button 
                          onClick={() => onPlayInternal(item.filePath, `${item.formattedNum} - ${item.title}`)}
                          className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white shadow-md transition-all active:scale-95"
                          title="השמע בנגן הפנימי"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}

                      {/* Open File Folder */}
                      {item.filePath && onOpenPath && (
                        <button 
                          onClick={() => onOpenPath(item.filePath)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                          title="פתח מיקום קובץ במחשב"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Mark as Played Button */}
                      <button 
                        onClick={() => markAsPlayed(item.id)}
                        className={`p-2 rounded-xl border transition-all text-xs flex items-center gap-1 font-bold ${
                          item.status === 'played'
                            ? 'bg-slate-800 text-slate-400 border-slate-700'
                            : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                        title={item.status === 'played' ? 'סמן כלא נוגן' : 'סמן כנוגן'}
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: QR CODE & GUEST LINK */}
          {activeTab === 'qr' && (
            <div className="flex flex-col items-center justify-center p-4 text-center max-w-lg mx-auto space-y-5">
              <div className="relative p-5 bg-white rounded-3xl shadow-[0_0_40px_rgba(245,158,11,0.3)]">
                {qrDataUrl && <img src={qrDataUrl} className="w-56 h-56 md:w-64 md:h-64 object-contain" alt="QR" />}
                <button 
                  onClick={() => setIsBigQr(true)}
                  className="absolute bottom-3 left-3 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl shadow"
                  title="הגדל למסך מלא"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <h3 className="text-xl font-black text-white">{djNames}</h3>
                <p className="text-xs text-slate-400 mt-1">סרקו כדי לבקש שיר ישירות מהסמארטפון</p>
              </div>

              {/* Geofence Status Badge in QR Tab */}
              <div className="w-full p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 text-right">
                  <div className={`p-2 rounded-xl ${geoEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}`}>
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>הגבלת רדיוס הגעה:</span>
                      <span className={geoEnabled ? 'text-emerald-400 font-mono font-black' : 'text-slate-500'}>
                        {geoEnabled ? `${geoRadius} מטר` : 'מבוטל (פתוח לכולם)'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {geoEnabled 
                        ? (locationStatus || (djLat ? `GPS דיג'יי: ${djLat}, ${djLon}` : 'לא נדגם מיקום'))
                        : 'כל מי שמחזיק בקישור יכול לבקש שירים'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {geoEnabled && (
                    <button
                      onClick={fetchDjLocation}
                      disabled={isFetchingLocation}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
                      title="דגום מיקום נוכחי מחדש"
                    >
                      <Navigation className={`w-3.5 h-3.5 ${isFetchingLocation ? 'animate-spin text-amber-400' : ''}`} />
                    </button>
                  )}
                  <button 
                    onClick={() => setActiveTab('settings')}
                    className="px-2.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition-all"
                  >
                    שנה רדיוס
                  </button>
                </div>
              </div>

              {/* External Screen / Projector Launch Buttons */}
              <div className="w-full flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={openStageWindow}
                  className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(168,85,247,0.4)] transition-all active:scale-95"
                >
                  <Monitor className="w-4 h-4" />
                  <span>פתח חלון למסך חיצוני / מקרן 🖥️</span>
                </button>
                <button
                  onClick={() => setIsBigQr(true)}
                  className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>תצוגת מסך מלא מהירה</span>
                </button>
              </div>

              {/* Shareable Link Box */}
              <div className="w-full flex items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-2xl">
                <input 
                  type="text" 
                  readOnly 
                  value={targetGuestUrl}
                  className="w-full bg-transparent text-xs font-mono text-amber-300 px-2 outline-none select-all"
                />
                <button 
                  onClick={copyLink}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 transition-all shadow"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'הועתק!' : 'העתק'}</span>
                </button>
                <a 
                  href={targetGuestUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                  title="פתח לבדיקה"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="max-w-lg mx-auto space-y-4 text-right">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  שמות הדיג'יים שיוצגו בראש העמוד:
                </label>
                <input 
                  type="text" 
                  value={djNames}
                  onChange={(e) => setDjNames(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  קוד החדר הנוכחי:
                </label>
                <input 
                  type="text" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-amber-400 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  כתובת הענן של עמוד האורחים (Hosting URL):
                </label>
                <input 
                  type="text" 
                  value={webHostUrl}
                  onChange={(e) => setWebHostUrl(e.target.value)}
                  placeholder="https://onyx-requests.web.app"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-300 outline-none focus:border-purple-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  הכתובת הציבורית אליה מועלה פרויקט ה-Dj-OnyxDownloader-Guest-Requests (Vercel / Firebase Hosting / Netlify).
                </p>
              </div>

              {/* GEOFENCING CONFIGURATION CARD */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-purple-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">הגבלת מיקום גאוגרפי (Geofencing)</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={geoEnabled} 
                      onChange={(e) => setGeoEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  מנע מאנשים מחוץ למסיבה לבקש שירים. רק אורחים שנמצאים פיזית ברדיוס שהוגדר יוכלו לגשת לעמוד החיפוש. מי שמחוץ לרדיוס יקבל עמוד סגור ("נתראה באירוע הבא").
                </p>

                {geoEnabled && (
                  <div className="space-y-3 pt-2 border-t border-slate-800/80">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-bold text-slate-300">רדיוס מורשה במטרים:</label>
                        <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                          {geoRadius} מטר
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <input 
                          type="range" 
                          min="10" 
                          max="200" 
                          step="5"
                          value={geoRadius}
                          onChange={(e) => setGeoRadius(parseInt(e.target.value, 10))}
                          className="w-full accent-purple-500 cursor-pointer"
                        />
                      </div>

                      {/* Quick Radius Buttons */}
                      <div className="flex gap-1.5 mt-2">
                        {[20, 30, 50, 100].map((r) => (
                          <button
                            key={r}
                            onClick={() => setGeoRadius(r)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                              geoRadius === r 
                                ? 'bg-purple-600 text-white shadow' 
                                : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700/60'
                            }`}
                          >
                            {r} מטר {r === 30 ? '(ברירת מחדל)' : ''}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DJ Location Status */}
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-300">מיקום עמדת הדיג'יי (מרכז המסיבה):</div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {locationStatus || (djLat ? `${djLat}, ${djLon}` : 'טרם נדגם מיקום')}
                        </div>
                      </div>
                      <button
                        onClick={fetchDjLocation}
                        disabled={isFetchingLocation}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-bold border border-slate-700 transition-all shrink-0"
                      >
                        <Navigation className={`w-3.5 h-3.5 ${isFetchingLocation ? 'animate-spin' : ''}`} />
                        <span>דגום מיקום נוכחי 🎯</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800">
                <button 
                  onClick={() => {
                    // Send demo test request
                    processIncomingRequest({
                      id: 'demo_' + Date.now(),
                      title: 'עומר אדם - רק שלך (Live)',
                      channel: 'Omer Adam Official',
                      url: 'https://www.youtube.com/watch?v=mock',
                      thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120',
                      requester: 'רועי ומיכל',
                      note: 'מזל טוב לכולם!'
                    });
                    setActiveTab('list');
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold border border-slate-700"
                >
                  🚀 שלח בקשת דמה לבדיקת המערכת והסאונד
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
