import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import Paho from 'paho-mqtt';
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
    const saved = localStorage.getItem('onyx_guest_active');
    return saved !== null ? saved === 'true' : true;
  });
  const [roomCode, setRoomCode] = useState(() => {
    return localStorage.getItem('onyx_guest_room') || 'SHAZZ-SONIC';
  });
  const [djNames, setDjNames] = useState(() => {
    return localStorage.getItem('onyx_guest_dj_names') || 'DJ Shazz & DJ Sonic';
  });
  const [webHostUrl, setWebHostUrl] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_host_url');
    if (saved && (saved.startsWith('http://') || saved.startsWith('https://')) && !saved.includes('onyx-requests.vercel.app')) {
      return saved;
    }
    return 'https://dj-onyxdownloader-guest-requests.vercel.app';
  });
  const [autoDownload, setAutoDownload] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_auto_download');
    return saved !== null ? saved === 'true' : true;
  });

  // Dedicated Guest Requests Audio Directory (Independent of global system download directory)
  const [guestAudioDir, setGuestAudioDir] = useState(() => {
    const saved = localStorage.getItem('onyx_guest_audio_dir');
    if (saved) return saved;
    if (directories?.audio_dir) return `${directories.audio_dir}/GuestRequests`;
    return '~/Downloads/OnyxAudio/GuestRequests';
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

  // Synchronized Refs to avoid stale closures in MQTT listeners
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const autoDownloadRef = useRef(autoDownload);
  useEffect(() => {
    autoDownloadRef.current = autoDownload;
  }, [autoDownload]);

  const djNamesRef = useRef(djNames);
  useEffect(() => {
    djNamesRef.current = djNames;
  }, [djNames]);

  const hiveClientRef = useRef(null);
  const emqxClientRef = useRef(null);

  // Broadcast Real-time Room Active/Closed Status to all guests via Retained MQTT
  const broadcastRoomStatus = (activeState, customRoomCode) => {
    const currentState = typeof activeState === 'boolean' ? activeState : isActiveRef.current;
    const targetRoom = customRoomCode || roomCode;
    const cleanRoom = (targetRoom || 'SHAZZ-SONIC').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '') || 'SHAZZ-SONIC';
    const statusTopic = `onyx/status/${cleanRoom}`;
    const payloadStr = JSON.stringify({
      active: currentState,
      room: cleanRoom,
      djNames: djNamesRef.current || 'DJ Shazz & DJ Sonic',
      timestamp: Date.now()
    });

    const MqttMessage = Paho?.Message || (Paho?.default && Paho.default.Message) || (window.Paho && window.Paho.Message);
    if (!MqttMessage) return;

    const sendToClient = (client, name) => {
      try {
        if (client && client.isConnected()) {
          const msg = new MqttMessage(payloadStr);
          msg.destinationName = statusTopic;
          msg.qos = 0;
          msg.retained = true;
          client.send(msg);
          console.log(`[Onyx MQTT] Broadcasted status (${currentState ? 'ACTIVE' : 'CLOSED'}) to ${name} on ${statusTopic} with retain=true`);
        }
      } catch (err) {
        console.warn(`[Onyx MQTT] Failed to broadcast status to ${name}:`, err);
      }
    };

    sendToClient(hiveClientRef.current, 'HiveMQ');
    sendToClient(emqxClientRef.current, 'EMQX');
  };


  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('onyx_guest_active', String(isActive));
    localStorage.setItem('onyx_guest_room', roomCode);
    localStorage.setItem('onyx_guest_dj_names', djNames);
    localStorage.setItem('onyx_guest_host_url', webHostUrl);
    localStorage.setItem('onyx_guest_auto_download', String(autoDownload));
    localStorage.setItem('onyx_guest_audio_dir', guestAudioDir);
    localStorage.setItem('onyx_guest_counter', String(requestCounter));
    localStorage.setItem('onyx_guest_requests_list', JSON.stringify(requests));
    localStorage.setItem('onyx_guest_geo_enabled', String(geoEnabled));
    localStorage.setItem('onyx_guest_geo_radius', String(geoRadius));
    if (djLat !== null) localStorage.setItem('onyx_guest_lat', String(djLat));
    if (djLon !== null) localStorage.setItem('onyx_guest_lon', String(djLon));
  }, [isActive, roomCode, djNames, webHostUrl, autoDownload, guestAudioDir, requestCounter, requests, geoEnabled, geoRadius, djLat, djLon]);

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
    try {
      const validBase = (webHostUrl && (webHostUrl.startsWith('http://') || webHostUrl.startsWith('https://')) && !webHostUrl.includes('onyx-requests.vercel.app'))
        ? webHostUrl
        : 'https://dj-onyxdownloader-guest-requests.vercel.app';
      const url = new URL(validBase);
      url.searchParams.set('room', roomCode || 'SHAZZ-SONIC');
      if (!isActive) {
        url.searchParams.set('closed', 'true');
      } else {
        url.searchParams.set('live', 'true');
      }
      if (geoEnabled && djLat !== null && djLon !== null) {
        url.searchParams.set('lat', String(djLat));
        url.searchParams.set('lon', String(djLon));
        url.searchParams.set('rad', String(geoRadius));
      }
      return url.toString();
    } catch (e) {
      return `https://dj-onyxdownloader-guest-requests.vercel.app?room=${encodeURIComponent(roomCode || 'SHAZZ-SONIC')}${!isActive ? '&closed=true' : '&live=true'}`;
    }
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

  // Subscribe to Realtime Guest Requests via MQTT WSS (HiveMQ & EMQX redundant brokers)
  useEffect(() => {
    const cleanRoom = (roomCode || 'SHAZZ-SONIC').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '') || 'SHAZZ-SONIC';
    const topic = `onyx/requests/${cleanRoom}`;

    let isUnmounted = false;
    let hiveClient = null;
    let emqxClient = null;
    let hiveReconnectTimer = null;
    let emqxReconnectTimer = null;

    const MqttClient = Paho?.Client || (Paho?.default && Paho.default.Client) || (window.Paho && window.Paho.Client);

    const initHive = () => {
      if (isUnmounted || !MqttClient) return;
      try {
        const id = 'onyx_desk_h_' + Math.random().toString(36).substring(2, 9);
        hiveClient = new MqttClient('broker.hivemq.com', 8884, '/mqtt', id);
        hiveClient.onConnectionLost = (resp) => {
          if (!isUnmounted) hiveReconnectTimer = setTimeout(initHive, 3000);
        };
        hiveClient.onMessageArrived = (msg) => {
          try {
            const req = JSON.parse(msg.payloadString);
            processIncomingRequest(req);
          } catch(e) {}
        };
        hiveClient.connect({
          useSSL: true,
          timeout: 5,
          keepAliveInterval: 30,
          cleanSession: true,
          onSuccess: () => {
            console.log('Onyx connected to HiveMQ WSS topic:', topic);
            hiveClientRef.current = hiveClient;
            try { hiveClient.subscribe(topic, { qos: 0 }); } catch(e) {}
            broadcastRoomStatus(isActiveRef.current);
          },
          onFailure: () => {
            if (!isUnmounted) hiveReconnectTimer = setTimeout(initHive, 4000);
          }
        });
      } catch(e) {
        if (!isUnmounted) hiveReconnectTimer = setTimeout(initHive, 5000);
      }
    };

    const initEmqx = () => {
      if (isUnmounted || !MqttClient) return;
      try {
        const id = 'onyx_desk_e_' + Math.random().toString(36).substring(2, 9);
        emqxClient = new MqttClient('broker.emqx.io', 8084, '/mqtt', id);
        emqxClient.onConnectionLost = (resp) => {
          if (!isUnmounted) emqxReconnectTimer = setTimeout(initEmqx, 3000);
        };
        emqxClient.onMessageArrived = (msg) => {
          try {
            const req = JSON.parse(msg.payloadString);
            processIncomingRequest(req);
          } catch(e) {}
        };
        emqxClient.connect({
          useSSL: true,
          timeout: 5,
          keepAliveInterval: 30,
          cleanSession: true,
          onSuccess: () => {
            console.log('Onyx connected to EMQX WSS topic:', topic);
            emqxClientRef.current = emqxClient;
            try { emqxClient.subscribe(topic, { qos: 0 }); } catch(e) {}
            broadcastRoomStatus(isActiveRef.current);
          },
          onFailure: () => {
            if (!isUnmounted) emqxReconnectTimer = setTimeout(initEmqx, 4000);
          }
        });
      } catch(e) {
        if (!isUnmounted) emqxReconnectTimer = setTimeout(initEmqx, 5000);
      }
    };

    initHive();
    initEmqx();

    // LocalStorage fallback for same-machine testing
    const pollLocal = setInterval(() => {
      const storageKey = 'onyx_requests_' + cleanRoom;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const incoming = JSON.parse(stored);
          if (Array.isArray(incoming) && incoming.length > 0) {
            incoming.forEach(req => processIncomingRequest(req));
            localStorage.removeItem(storageKey);
          }
        } catch(e) {}
      }
    }, 1500);

    // Heartbeat: Republish room status every 15s to maintain broker retained state
    const heartbeatInterval = setInterval(() => {
      broadcastRoomStatus(isActiveRef.current);
    }, 15000);

    return () => {
      isUnmounted = true;
      if (hiveReconnectTimer) clearTimeout(hiveReconnectTimer);
      if (emqxReconnectTimer) clearTimeout(emqxReconnectTimer);
      clearInterval(heartbeatInterval);
      clearInterval(pollLocal);
      hiveClientRef.current = null;
      emqxClientRef.current = null;
      try { if (hiveClient && hiveClient.isConnected()) hiveClient.disconnect(); } catch(e) {}
      try { if (emqxClient && emqxClient.isConnected()) emqxClient.disconnect(); } catch(e) {}
    };
  }, [roomCode, requestCounter]);

  // Process a newly received song request
  const processIncomingRequest = async (reqItem) => {
    if (!reqItem || !reqItem.title) return;

    // Hard reject if DJ station is turned OFF (inactive)
    if (!isActiveRef.current) {
      console.warn(`[Onyx] Blocked incoming request "${reqItem.title}" because requests station is CLOSED (OFF).`);
      return;
    }

    setRequests(prev => {
      // Robust deduplication by id or by url/title received within 20s
      const isDuplicate = prev.some(r => {
        if (reqItem.id && r.id === reqItem.id) return true;
        if (r.url && reqItem.url && r.url === reqItem.url && Math.abs((r.timestamp || 0) - (reqItem.timestamp || 0)) < 20000) return true;
        if (r.title && reqItem.title && r.title === reqItem.title && r.requester === reqItem.requester && Math.abs((r.timestamp || 0) - (reqItem.timestamp || 0)) < 20000) return true;
        return false;
      });

      if (isDuplicate) return prev;

      const nextNum = (prev.length > 0 ? Math.max(...prev.map(r => r.num || 0)) : 0) + 1;
      const formattedNum = String(nextNum).padStart(2, '0');

      const newRequest = {
        id: reqItem.id || 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        num: nextNum,
        formattedNum: formattedNum,
        title: reqItem.title,
        channel: reqItem.channel || 'YouTube',
        url: reqItem.url || '',
        thumbnail: reqItem.thumbnail || '',
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
      if (autoDownloadRef.current && isActiveRef.current) {
        setTimeout(() => triggerDownload(newRequest), 100);
      }

      return [newRequest, ...prev];
    });
  };

  // Trigger Local Download with Sequential Number Prefix & Real-time Progress Tracking
  const triggerDownload = async (item) => {
    // Sanitize URL: if it is a search results URL, convert to ytsearch1:
    let downloadUrl = (item.url || '').trim();
    if (downloadUrl.includes('results?search_query=')) {
      try {
        const q = new URL(downloadUrl).searchParams.get('search_query');
        if (q) downloadUrl = `ytsearch1:${decodeURIComponent(q)}`;
      } catch(e) {
        downloadUrl = `ytsearch1:${item.title}`;
      }
    } else if (!downloadUrl.startsWith('http') && !downloadUrl.startsWith('ytsearch')) {
      downloadUrl = `ytsearch1:${item.title}`;
    }

    setRequests(prev => prev.map(r => r.id === item.id ? { 
      ...r, 
      status: 'downloading',
      percent: 5,
      progressText: 'מתחיל הורדה...'
    } : r));

    try {
      const audioDir = guestAudioDir || (directories?.audio_dir ? `${directories.audio_dir}/GuestRequests` : '~/Downloads/OnyxAudio/GuestRequests');
      
      const payload = {
        url: downloadUrl,
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

        // Poll for progress percentage and completion every 600ms
        const pollTimer = setInterval(async () => {
          try {
            const statusRes = await fetch(`http://127.0.0.1:${serverPort}/api/download/${jobId}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              
              let pct = 0;
              let progText = statusData.progress || 'מוריד...';

              if (statusData.status === 'completed') {
                pct = 100;
                progText = 'ההורדה הושלמה!';
              } else if (statusData.progress) {
                const match = statusData.progress.match(/(\d+\.?\d*)%/);
                if (match) {
                  pct = Math.min(100, Math.max(0, Math.round(parseFloat(match[1]))));
                } else if (statusData.progress.includes('Metadata') || statusData.progress.includes('BPM') || statusData.progress.includes('Renaming')) {
                  pct = 95;
                  progText = 'מעבד BPM ותגיות...';
                } else if (statusData.progress.includes('Audio') || statusData.progress.includes('Starting')) {
                  pct = 15;
                  progText = 'מתחבר ליוטיוב...';
                } else if (statusData.status === 'processing') {
                  pct = 25;
                }
              }

              if (statusData.status === 'completed') {
                clearInterval(pollTimer);
                setRequests(prev => prev.map(r => r.id === item.id ? { 
                  ...r, 
                  status: 'ready', 
                  percent: 100,
                  progressText: 'הושלם',
                  filePath: statusData.result_file 
                } : r));
              } else if (statusData.status === 'error') {
                clearInterval(pollTimer);
                setRequests(prev => prev.map(r => r.id === item.id ? { 
                  ...r, 
                  status: 'error',
                  progressText: statusData.progress || 'שגיאה בהורדה'
                } : r));
              } else {
                // Active download state - update percentage and label smoothly
                setRequests(prev => prev.map(r => r.id === item.id ? { 
                  ...r, 
                  percent: pct,
                  progressText: progText
                } : r));
              }
            }
          } catch (e) {
            clearInterval(pollTimer);
          }
        }, 600);
      }
    } catch (err) {
      console.error("Failed to start download for guest request:", err);
      setRequests(prev => prev.map(r => r.id === item.id ? { 
        ...r, 
        status: 'error',
        progressText: 'שגיאת שרת מקומי'
      } : r));
    }
  };

  // Dedicated Guest Requests Directory Picker (Affects ONLY guest requests)
  const handleBrowseGuestDir = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: guestAudioDir ? guestAudioDir.replace('~', '') : undefined
      });
      if (selected && typeof selected === 'string') {
        setGuestAudioDir(selected);
      }
    } catch (err) {
      console.warn("Tauri directory dialog error, falling back to prompt:", err);
      const manual = window.prompt("הזן נתיב תיקייה מקומית לשמירת בקשות האורחים (משפיע רק על בקשות הקהל):", guestAudioDir);
      if (manual && manual.trim()) {
        setGuestAudioDir(manual.trim());
      }
    }
  };

  // Start a fresh new event
  const startNewEvent = () => {
    if (requests.length > 0) {
      if (!window.confirm("האם לפתוח אירוע חדש? פעולה זו תאפס את רשימת הבקשות ואת המספור הרץ ל-01 ותייצר קוד אירוע חדש.")) {
        return;
      }
    }
    // Broadcast CLOSED state for the retiring room code immediately
    broadcastRoomStatus(false, roomCode);

    const newCode = `SHAZZ-${Math.floor(1000 + Math.random() * 9000)}`;
    setRoomCode(newCode);
    setRequestCounter(0);
    setRequests([]);
    setIsActive(true);
    localStorage.setItem('onyx_room_active_' + newCode, 'true');
    // Broadcast ACTIVE state for new room
    setTimeout(() => broadcastRoomStatus(true, newCode), 500);
  };

  // Toggle active/inactive
  const toggleActive = () => {
    const nextState = !isActive;
    setIsActive(nextState);
    localStorage.setItem('onyx_room_active_' + roomCode, String(nextState));
    broadcastRoomStatus(nextState);
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

          <div className="p-4 sm:p-5 bg-white rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.5)] mb-4">
            {qrDataUrl && <img src={qrDataUrl} className="w-56 h-56 md:w-72 md:h-72 object-contain" alt="QR Code" />}
          </div>

          <div className="space-y-2 max-w-xl mx-auto mb-3" dir="rtl">
            <h3 className="text-2xl md:text-3xl font-black text-amber-300 drop-shadow">
              סרקו מהטלפון ובקשו שיר ישירות לדיג'יי! 🎵
            </h3>
            <p className="text-base md:text-xl font-bold text-slate-200">
              השיר שתבחרו ביוטיוב ייכנס מיידית לעמדת הדיג'יי
            </p>
          </div>

          <div className="text-sm md:text-base font-mono text-amber-300 font-bold bg-slate-900 border border-slate-800 px-6 py-2 rounded-full mb-2">
            חדר: {roomCode}
          </div>
          <p className="text-xs text-slate-400 font-medium">פותחים מצלמה &bull; סורקים &bull; בוחרים שיר &bull; שומעים ברחבה!</p>
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

            {/* Set/Change Guest Requests Destination Directory (Affects ONLY Guest Requests) */}
            <button 
              onClick={handleBrowseGuestDir}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500/15 to-orange-500/15 hover:from-amber-500/25 hover:to-orange-500/25 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
              title={`שנה יעד שמירה ספציפי לבקשות קהל בלבד (נוכחי: ${guestAudioDir})`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>יעד הורדות בקשות 📂</span>
            </button>

            {/* Open Current Guest Directory in Finder */}
            {onOpenPath && (
              <button 
                onClick={() => onOpenPath(guestAudioDir)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
                title="פתח את תיקיית שירי האורחים ב-Finder"
              >
                <span>פתח תיקייה ↗</span>
              </button>
            )}

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

                        {/* Live Download Progress Bar & Status Text */}
                        {item.status === 'downloading' && (
                          <div className="mt-2.5 w-full bg-slate-950/80 p-2.5 rounded-xl border border-amber-500/30 shadow-inner">
                            <div className="flex justify-between items-center text-[11px] font-mono mb-1.5">
                              <span className="text-amber-300 font-bold truncate flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                                {item.progressText || 'מוריד קובץ שמע...'}
                              </span>
                              <span className="text-amber-400 font-black text-xs font-mono ml-2 shrink-0">
                                {item.percent || 0}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/60">
                              <div 
                                className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(245,158,11,0.6)]" 
                                style={{ width: `${Math.max(5, item.percent || 0)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {/* Status Indicator */}
                      {item.status === 'downloading' && (
                        <span className="text-xs font-mono font-black text-amber-300 flex items-center gap-1.5 bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/40 shadow-sm animate-pulse">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>{item.percent ? `${item.percent}%` : 'מוריד...'}</span>
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
              {/* DEDICATED GUEST DOWNLOAD DIRECTORY CONFIGURATION CARD */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/30 space-y-2.5 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-black text-white">תיקיית יעד להורדת בקשות הקהל בלבד</span>
                  </div>
                  <button 
                    type="button"
                    onClick={handleBrowseGuestDir}
                    className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-lg text-xs transition-all shadow active:scale-95 flex items-center gap-1"
                  >
                    <span>בחר תיקייה 📂</span>
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <input 
                    type="text" 
                    value={guestAudioDir}
                    onChange={(e) => setGuestAudioDir(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-amber-300 outline-none focus:border-amber-400"
                    placeholder="~/Downloads/OnyxAudio/GuestRequests"
                  />
                  {onOpenPath && (
                    <button 
                      type="button"
                      onClick={() => onOpenPath(guestAudioDir)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold shrink-0 transition-colors"
                      title="פתח תיקייה זו ב-Finder"
                    >
                      פתח ↗
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-amber-400/90 font-semibold leading-relaxed">
                  ⚡ הגדרה זו משפיעה <b>אך ורק על מסך בקשות הקהל</b> ולא משנה את נתיב ההורדות הראשי של המערכת!
                </p>
              </div>

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
