import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import Paho from 'paho-mqtt';
import { 
  X, Radio, Power, RefreshCw, Copy, Check, ExternalLink, Play, 
  FolderOpen, Music, CheckCircle2, AlertCircle, Clock, Volume2, 
  QrCode, Maximize2, Minimize2, Settings2, User, MessageSquareHeart, Monitor,
  MapPin, Navigation, Compass, Smartphone, Search, Building2, CheckCircle,
  Tv, Cast, Wifi, Loader2, Sparkles, Camera, Image as ImageIcon
} from 'lucide-react';

// Popular Israeli event venues & wedding halls for 1-click DJ GPS calibration
const POPULAR_VENUES = [
  { name: 'חוות רונית', city: 'שרון', lat: 32.229502, lon: 34.839827 },
  { name: 'טראסק', city: 'נמל תל אביב', lat: 32.097580, lon: 34.773320 },
  { name: 'האחוזה', city: 'מודיעין', lat: 31.890350, lon: 34.985620 },
  { name: 'שרונית', city: 'משמר השרון', lat: 32.358240, lon: 34.908410 },
  { name: 'אודאון', city: 'עמק חפר', lat: 32.395120, lon: 34.912630 },
  { name: 'קאי קולקשן (Kai)', city: 'עמק חפר', lat: 32.401200, lon: 34.904800 },
  { name: 'גאיה (Gaia)', city: 'בית עובד / חדרה', lat: 32.441200, lon: 34.921300 },
  { name: 'בית על הים', city: 'יפו', lat: 32.053890, lon: 34.750560 },
];

// Audio chime notification using Web Audio API (safe, zero external dependencies)
const playChime = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // Audio context may be restricted by browser policy before user interaction
  }
};

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

  // DJ Location Calibration State (Options 2 & 3)
  const [locationTab, setLocationTab] = useState('phone'); // 'phone' | 'venue' | 'manual'
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [djGpsQrDataUrl, setDjGpsQrDataUrl] = useState('');
  const [phoneSyncSuccess, setPhoneSyncSuccess] = useState(false);
  const [phoneAccuracy, setPhoneAccuracy] = useState(null);

  // Option 3: Venue Search State
  const [venueSearchQuery, setVenueSearchQuery] = useState('');
  const [venueSearchResults, setVenueSearchResults] = useState([]);
  const [isSearchingVenue, setIsSearchingVenue] = useState(false);
  const [venueSearchError, setVenueSearchError] = useState('');

  // Manual Coordinates State
  const [manualLat, setManualLat] = useState(() => {
    return localStorage.getItem('onyx_guest_lat') || '';
  });
  const [manualLon, setManualLon] = useState(() => {
    return localStorage.getItem('onyx_guest_lon') || '';
  });

  // UI States
  const [activeTab, setActiveTab] = useState('list'); // 'list', 'qr', 'settings'
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isBigQr, setIsBigQr] = useState(false);
  const [isModalMaximized, setIsModalMaximized] = useState(false);

  // Wireless Screen Casting & Projector States
  const [showCastModal, setShowCastModal] = useState(false);
  const [screenDevices, setScreenDevices] = useState([]);
  const [isScanningScreens, setIsScanningScreens] = useState(false);
  const [activeCastDevice, setActiveCastDevice] = useState(null);
  const [isCastingLoading, setIsCastingLoading] = useState(false);
  const [castMessage, setCastMessage] = useState(null);
  const [copiedStageUrl, setCopiedStageUrl] = useState(false);

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

  const requestsRef = useRef(requests);
  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  const [currentSpotlightId, setCurrentSpotlightId] = useState(null);
  const currentSpotlightIdRef = useRef(null);
  useEffect(() => {
    currentSpotlightIdRef.current = currentSpotlightId;
  }, [currentSpotlightId]);

  const hiveClientRef = useRef(null);
  const emqxClientRef = useRef(null);

  // Broadcast Live Stage Experience Spotlight (Song, Requester, Dedication, Guest Photo)
  const broadcastSpotlight = (spotlightData) => {
    const cleanRoom = (roomCode || 'SHAZZ-SONIC').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '') || 'SHAZZ-SONIC';
    const spotlightTopic = `onyx/stage/${cleanRoom}/spotlight`;
    const payloadStr = JSON.stringify(spotlightData);

    const sendToClient = (client, name) => {
      try {
        if (client && client.isConnected()) {
          const MqttMessage = Paho?.Message || (Paho?.default && Paho.default.Message) || (window.Paho && window.Paho.Message);
          if (MqttMessage) {
            const msg = new MqttMessage(payloadStr);
            msg.destinationName = spotlightTopic;
            msg.qos = 0;
            msg.retained = true;
            client.send(msg);
          }
        }
      } catch (err) {
        console.warn(`[Onyx Stage Spotlight] Failed to broadcast to ${name}:`, err);
      }
    };

    sendToClient(hiveClientRef.current, 'HiveMQ');
    sendToClient(emqxClientRef.current, 'EMQX');

    // Also sync to localStorage for Tauri Stage Display windows
    try {
      if (spotlightData && spotlightData.active) {
        localStorage.setItem('onyx_stage_spotlight', payloadStr);
      } else {
        localStorage.removeItem('onyx_stage_spotlight');
      }
      window.dispatchEvent(new Event('storage'));
    } catch (e) {}
  };

  const toggleManualSpotlight = (item) => {
    if (currentSpotlightId === item.id) {
      setCurrentSpotlightId(null);
      broadcastSpotlight({ active: false, timestamp: Date.now() });
    } else {
      setCurrentSpotlightId(item.id);
      broadcastSpotlight({
        active: true,
        requestId: item.id,
        songTitle: item.title,
        artist: item.channel || '',
        requester: item.requester || 'אורח ברחבה',
        note: item.note || '',
        photo: item.photo || null,
        textPosition: item.textPosition || { x: 50, y: 75 },
        textScale: (typeof item.textScale === 'number' && item.textScale > 0) ? item.textScale : 1.0,
        timestamp: Date.now()
      });
    }
  };

  // Broadcast Real-time Room Active/Closed Status to all guests via Dual-Engine (HTTPS ntfy + Retained MQTT)
  const broadcastRoomStatus = (activeState, customRoomCode) => {
    const currentState = typeof activeState === 'boolean' ? activeState : isActiveRef.current;
    const targetRoom = customRoomCode || roomCode;
    const cleanRoom = (targetRoom || 'SHAZZ-SONIC').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '') || 'SHAZZ-SONIC';
    const statusTopic = `onyx/status/${cleanRoom}`;
    const payloadObj = {
      active: currentState,
      room: cleanRoom,
      djNames: djNamesRef.current || 'DJ Shazz & DJ Sonic',
      timestamp: Date.now()
    };
    const payloadStr = JSON.stringify(payloadObj);

    // 1. High-speed HTTP/HTTPS broadcast via ntfy (standard port 443 - zero blockages on cellular & iOS)
    try {
      fetch(`https://ntfy.sh/onyx_status_${cleanRoom.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr
      }).catch(err => console.warn('[Onyx ntfy status error]', err));

      if (cleanRoom !== 'SHAZZ-SONIC') {
        fetch('https://ntfy.sh/onyx_status_shazz-sonic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadStr
        }).catch(() => {});
      }
    } catch (e) {}

    // 2. Broadcast via MQTT Retained (HiveMQ + EMQX)
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

          if (cleanRoom !== 'SHAZZ-SONIC') {
            const fallbackMsg = new MqttMessage(payloadStr);
            fallbackMsg.destinationName = 'onyx/status/SHAZZ-SONIC';
            fallbackMsg.qos = 0;
            fallbackMsg.retained = true;
            client.send(fallbackMsg);
          }
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

  // Target DJ GPS Calibration URL (Option 2)
  const buildDjGpsUrl = () => {
    try {
      const validBase = (webHostUrl && (webHostUrl.startsWith('http://') || webHostUrl.startsWith('https://')) && !webHostUrl.includes('onyx-requests.vercel.app'))
        ? webHostUrl
        : 'https://dj-onyxdownloader-guest-requests.vercel.app';
      const url = new URL(validBase);
      url.searchParams.set('dj_gps', 'true');
      url.searchParams.set('room', roomCode || 'SHAZZ-SONIC');
      return url.toString();
    } catch (e) {
      return `https://dj-onyxdownloader-guest-requests.vercel.app?dj_gps=true&room=${encodeURIComponent(roomCode || 'SHAZZ-SONIC')}`;
    }
  };

  const djGpsUrl = buildDjGpsUrl();

  // Generate DJ GPS QR Code
  useEffect(() => {
    QRCode.toDataURL(djGpsUrl, {
      width: 340,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    }).then(setDjGpsQrDataUrl).catch(console.error);
  }, [djGpsUrl]);

  // Handle incoming DJ smartphone GPS calibration (from MQTT or SSE)
  const handleIncomingDjGps = (loc) => {
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return;
    const lat = parseFloat(loc.lat.toFixed(6));
    const lon = parseFloat(loc.lon.toFixed(6));
    const acc = loc.accuracy ? Math.round(loc.accuracy) : null;
    setDjLat(lat);
    setDjLon(lon);
    setManualLat(String(lat));
    setManualLon(String(lon));
    setPhoneAccuracy(acc);
    setLocationStatus(`סונכרן מהסמארטפון 📱: ${lat}, ${lon}${acc ? ` (דיוק: ±${acc} מ')` : ''}`);
    setPhoneSyncSuccess(true);
    playChime();
    setTimeout(() => setPhoneSyncSuccess(false), 9000);
  };

  // Option 3: Search Venue in Israel via OpenStreetMap Nominatim
  const searchVenue = async (queryText) => {
    const q = (queryText !== undefined ? queryText : venueSearchQuery).trim();
    if (!q) return;
    setIsSearchingVenue(true);
    setVenueSearchError('');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=il&format=json&limit=6&addressdetails=1`, {
        headers: { 'Accept-Language': 'he' }
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setVenueSearchResults(data);
      } else {
        setVenueSearchResults([]);
        setVenueSearchError('לא נמצאו תוצאות עבור חיפוש זה. נסה שם אחר, עיר או כתובת.');
      }
    } catch (err) {
      setVenueSearchError('שגיאה בחיפוש במפה. ודא שיש חיבור אינטרנט פעיל.');
    } finally {
      setIsSearchingVenue(false);
    }
  };

  const selectVenue = (venue) => {
    const lat = parseFloat(parseFloat(venue.lat).toFixed(6));
    const lon = parseFloat(parseFloat(venue.lon).toFixed(6));
    const name = venue.name || venue.display_name.split(',')[0];
    setDjLat(lat);
    setDjLon(lon);
    setManualLat(String(lat));
    setManualLon(String(lon));
    setLocationStatus(`אולם: ${name} (${lat}, ${lon})`);
    playChime();
  };

  const selectPresetVenue = (preset) => {
    setDjLat(preset.lat);
    setDjLon(preset.lon);
    setManualLat(String(preset.lat));
    setManualLon(String(preset.lon));
    setLocationStatus(`אולם: ${preset.name} - ${preset.city} (${preset.lat}, ${preset.lon})`);
    playChime();
  };

  const applyManualCoordinates = () => {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (isNaN(lat) || isNaN(lon)) {
      alert('נא להזין קואורדינטות מספריות תקינות');
      return;
    }
    const finalLat = parseFloat(lat.toFixed(6));
    const finalLon = parseFloat(lon.toFixed(6));
    setDjLat(finalLat);
    setDjLon(finalLon);
    setLocationStatus(`הזנה ידנית: ${finalLat}, ${finalLon}`);
    playChime();
  };

  // High-speed SSE listener for DJ phone calibration from ntfy
  useEffect(() => {
    const cleanRoom = (roomCode || 'SHAZZ-SONIC').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '') || 'SHAZZ-SONIC';
    let es = null;
    try {
      const sseUrl = `https://ntfy.sh/onyx_dj_location_${cleanRoom.toLowerCase()}/sse`;
      es = new EventSource(sseUrl);
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && parsed.event === 'message' && parsed.message) {
            const loc = typeof parsed.message === 'string' ? JSON.parse(parsed.message) : parsed.message;
            handleIncomingDjGps(loc);
          }
        } catch (err) {}
      };
    } catch (e) {}

    return () => {
      if (es) {
        try { es.close(); } catch(e) {}
      }
    };
  }, [roomCode]);

  // Location Calibrator Component for Options 2 & 3
  const renderLocationCalibrator = (isPopup = false) => (
    <div className="space-y-3.5 text-right">
      {/* Current Active Location Display */}
      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
        <div>
          <div className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span>מרכז עמדת הדיג'יי הנבחר:</span>
          </div>
          <div className="text-[11px] font-mono text-amber-300 mt-0.5">
            {locationStatus || (djLat ? `${djLat}, ${djLon}` : 'טרם הוגדר מיקום')}
          </div>
        </div>
        {djLat !== null && djLon !== null && (
          <a
            href={`https://www.google.com/maps?q=${djLat},${djLon}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-700 transition-all shrink-0"
            title="פתח ב-Google Maps"
          >
            <span>פתח במפה ↗</span>
          </a>
        )}
      </div>

      {/* 2 Main Choice Tabs for the DJ */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950/90 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => setLocationTab('phone')}
          className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            locationTab === 'phone'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>אופציה 2: טלפון 📱</span>
        </button>

        <button
          type="button"
          onClick={() => setLocationTab('venue')}
          className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            locationTab === 'venue'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>אופציה 3: אולם 🏢</span>
        </button>

        <button
          type="button"
          onClick={() => setLocationTab('manual')}
          className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            locationTab === 'manual'
              ? 'bg-slate-800 text-white shadow-md border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>ידני / מחשב 💻</span>
        </button>
      </div>

      {/* OPTION 2: SMARTPHONE GPS CALIBRATION */}
      {locationTab === 'phone' && (
        <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-black text-white">אופציה 2: כיול GPS לווייני מסמארטפון הדיג'יי</span>
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold border border-purple-500/40">
              מומלץ למקבוק ⭐
            </span>
          </div>

          <p className="text-[11px] text-slate-300 leading-relaxed">
            מחשבי Mac אינם מכילים רכיב GPS לווייני. סרקו את הברקוד במצלמת הסמארטפון שלכם ולחצו על <b>"דגום מיקום ושדר למחשב"</b>. המחשב יקבל את ה-GPS האמיתי בזמן אמת!
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-950/80 p-3 rounded-xl border border-purple-500/20">
            {/* Dedicated DJ GPS QR Code */}
            <div className="p-2 bg-white rounded-xl shadow-lg border border-purple-400/40 shrink-0">
              {djGpsQrDataUrl ? (
                <img src={djGpsQrDataUrl} alt="DJ GPS QR" className="w-32 h-32 block" />
              ) : (
                <div className="w-32 h-32 flex items-center justify-center text-slate-500 text-xs">טוען...</div>
              )}
            </div>

            <div className="flex-1 space-y-2 text-right w-full">
              {/* Live Status indicator */}
              {phoneSyncSuccess ? (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-bounce">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>🎉 נקלט GPS לווייני אמיתי מהטלפון! העמדה מכוילת.</span>
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-slate-900 border border-purple-500/30 text-purple-300 text-[11px] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                  <span>ממתין לסריקה ולחיצה מהסמארטפון... (בשידור ישיר)</span>
                </div>
              )}

              <div className="text-[11px] text-slate-400 space-y-1">
                <div>• חדר מחובר: <span className="font-mono text-amber-300 font-bold">{roomCode}</span></div>
                <div>• שידור דו-ערוצי מאובטח: HTTPS Port 443 + MQTT</div>
              </div>

              <div className="flex gap-2 pt-1">
                <a
                  href={djGpsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow transition-all"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>פתח כיול בדפדפן</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OPTION 3: VENUE SEARCH & PRESETS */}
      {locationTab === 'venue' && (
        <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-black text-white">אופציה 3: בחירת אולם אירועים או חיפוש כתובת</span>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-500/40">
              חיפוש מהיר במפה 🏢
            </span>
          </div>

          {/* Quick preset buttons */}
          <div>
            <div className="text-[11px] text-slate-300 font-bold mb-1.5">אולמות וגני אירועים נפוצים (בלחיצה אחת):</div>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_VENUES.map((venue) => (
                <button
                  key={venue.name}
                  type="button"
                  onClick={() => selectPresetVenue(venue)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 border border-slate-800 hover:border-amber-500/40 text-xs font-semibold transition-all active:scale-95 flex items-center gap-1"
                >
                  <span>{venue.name}</span>
                  <span className="text-[10px] text-slate-500 font-normal">({venue.city})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
            <div className="text-[11px] text-slate-400">חפש כל אולם, גן אירועים או כתובת בישראל:</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={venueSearchQuery}
                onChange={(e) => setVenueSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchVenue(); }}
                placeholder="לדוגמה: טראסק, שרונית, נמל תל אביב..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => searchVenue()}
                disabled={isSearchingVenue || !venueSearchQuery.trim()}
                className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1 transition-all shadow shrink-0"
              >
                <Search className={`w-3.5 h-3.5 ${isSearchingVenue ? 'animate-spin' : ''}`} />
                <span>חפש</span>
              </button>
            </div>
          </div>

          {/* Search error */}
          {venueSearchError && (
            <div className="p-2 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs">
              {venueSearchError}
            </div>
          )}

          {/* Search Results */}
          {venueSearchResults.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {venueSearchResults.map((res) => (
                <div
                  key={res.place_id}
                  className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-amber-500/50 flex items-center justify-between gap-2 transition-all"
                >
                  <div className="text-right flex-1 min-w-0">
                    <div className="font-bold text-white text-xs truncate">
                      {res.name || res.display_name.split(',')[0]}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {res.display_name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectVenue(res)}
                    className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold shrink-0 transition-all active:scale-95"
                  >
                    בחר מיקום זה ✓
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OPTION: MANUAL COORDINATES & COMPUTER WI-FI */}
      {locationTab === 'manual' && (
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-white">הזנת קואורדינטות ידניות או דגימת Wi-Fi ממחשב</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">קו רוחב (Latitude):</label>
              <input
                type="text"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="32.229502"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs font-mono text-white outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">קו אורך (Longitude):</label>
              <input
                type="text"
                value={manualLon}
                onChange={(e) => setManualLon(e.target.value)}
                placeholder="34.839827"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs font-mono text-white outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={applyManualCoordinates}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow"
            >
              החל קואורדינטות אלו 💾
            </button>

            <button
              type="button"
              onClick={fetchDjLocation}
              disabled={isFetchingLocation}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-700"
              title="דגום לפי Wi-Fi של המחשב"
            >
              <Navigation className={`w-3.5 h-3.5 ${isFetchingLocation ? 'animate-spin text-amber-400' : ''}`} />
              <span>דגום מ-Wi-Fi המחשב</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Subscribe to Realtime Guest Requests via MQTT WSS (HiveMQ & EMQX redundant brokers)
  useEffect(() => {
    const cleanRoom = (roomCode || 'SHAZZ-SONIC').toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '') || 'SHAZZ-SONIC';
    const topic = `onyx/requests/${cleanRoom}`;
    const locationTopic = `onyx/dj_location/${cleanRoom}`;

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
            const payload = JSON.parse(msg.payloadString);
            if (msg.destinationName && msg.destinationName.includes('dj_location')) {
              handleIncomingDjGps(payload);
            } else {
              processIncomingRequest(payload);
            }
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
            try { hiveClient.subscribe(locationTopic, { qos: 0 }); } catch(e) {}
            if (cleanRoom !== 'SHAZZ-SONIC') {
              try { hiveClient.subscribe('onyx/dj_location/SHAZZ-SONIC', { qos: 0 }); } catch(e) {}
            }
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
            const payload = JSON.parse(msg.payloadString);
            if (msg.destinationName && msg.destinationName.includes('dj_location')) {
              handleIncomingDjGps(payload);
            } else {
              processIncomingRequest(payload);
            }
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
            try { emqxClient.subscribe(locationTopic, { qos: 0 }); } catch(e) {}
            if (cleanRoom !== 'SHAZZ-SONIC') {
              try { emqxClient.subscribe('onyx/dj_location/SHAZZ-SONIC', { qos: 0 }); } catch(e) {}
            }
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

    // Heartbeat: Republish room status every 4s to maintain broker retained state & instant mobile sync
    const heartbeatInterval = setInterval(() => {
      broadcastRoomStatus(isActiveRef.current);
    }, 4000);

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
  }, [roomCode]);

  // Live Stage Matching Helper Functions
  const normalizeTrackText = (text) => {
    if (!text) return '';
    return text
      .toLowerCase()
      // Remove content in brackets e.g. (Official Music Video), [Audio], (Remix)
      .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ')
      // Remove leading track numbering e.g. "01 - ", "02. ", "03 "
      .replace(/^\s*\d+[\s\.\-_]+/g, '')
      // Remove common YouTube suffixes
      .replace(/official\s+video|official\s+audio|lyrics|hd|4k|videoclip/gi, '')
      // Keep only letters & numbers across all alphabets (Hebrew, English, etc.)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const isSongMatch = (deck, req) => {
    const deckTitle = normalizeTrackText(deck.title);
    const deckArtist = normalizeTrackText(deck.artist);
    const reqTitle = normalizeTrackText(req.title);
    const reqChannel = normalizeTrackText(req.channel);

    if (!deckTitle || !reqTitle) return false;
    if (deckTitle === reqTitle) return true;
    if (deckTitle.length >= 4 && reqTitle.includes(deckTitle)) return true;
    if (reqTitle.length >= 4 && deckTitle.includes(reqTitle)) return true;

    // Check combined artist + title
    const combinedDeck = `${deckArtist} ${deckTitle}`.trim();
    const combinedReq = `${reqChannel} ${reqTitle}`.trim();
    if (combinedDeck.length >= 6 && combinedReq.includes(combinedDeck)) return true;
    if (combinedReq.length >= 6 && combinedDeck.includes(combinedReq)) return true;

    // Word token overlap
    const deckWords = deckTitle.split(' ').filter(w => w.length > 2);
    const reqWords = reqTitle.split(' ').filter(w => w.length > 2);
    if (deckWords.length >= 2 && reqWords.length >= 2) {
      const matchCount = deckWords.filter(w => reqWords.some(rw => rw === w || rw.includes(w) || w.includes(rw))).length;
      if (matchCount / Math.min(deckWords.length, reqWords.length) >= 0.7) {
        return true;
      }
    }

    return false;
  };

  // Live Stage Experience: Continuously Poll djay Pro Master Track via Channel Upfaders (Crossfader Excluded)
  useEffect(() => {
    let isCancelled = false;
    let autoSpotlightReqId = null;

    const checkMasterDeckAndSpotlight = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const resText = await invoke('get_djay_tracks_native');
        if (!resText || isCancelled) return;

        const data = JSON.parse(resText);
        if (data.error || !data.decks) return;

        // Upfader-Only Logic: Exclude crossfader entirely.
        // A deck is audible on speakers if is_playing is true AND vertical volume slider >= 0.15 (15%)
        const audibleDecks = data.decks.filter(d => {
          const isPlaying = d.is_playing === 'true' || d.is_playing === true;
          const vol = d.volume !== undefined ? parseFloat(d.volume) : 1.0;
          return isPlaying && !isNaN(vol) && vol >= 0.15;
        });

        let masterDeck = null;
        if (audibleDecks.length === 1) {
          masterDeck = audibleDecks[0];
        } else if (audibleDecks.length > 1) {
          // If both decks are active, the track with the higher channel fader is the Master track
          audibleDecks.sort((a, b) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0));
          masterDeck = audibleDecks[0];
        }

        if (!masterDeck) {
          // No track is playing audibly on speakers (or only headphone cueing)
          if (autoSpotlightReqId !== null) {
            autoSpotlightReqId = null;
            setCurrentSpotlightId(null);
            broadcastSpotlight({ active: false, timestamp: Date.now() });
          }
          return;
        }

        // Match against current guest requests
        const currentReqs = requestsRef.current || [];
        const matchedReq = currentReqs.find(r => isSongMatch(masterDeck, r));

        if (matchedReq) {
          if (autoSpotlightReqId !== matchedReq.id) {
            autoSpotlightReqId = matchedReq.id;
            setCurrentSpotlightId(matchedReq.id);
            console.log(`[Onyx Stage Live] Master Track MATCHED Guest Request: "${matchedReq.title}" by ${matchedReq.requester}`);

            // Mark request as played
            setRequests(prev => prev.map(r => r.id === matchedReq.id ? { ...r, status: 'played' } : r));

            broadcastSpotlight({
              active: true,
              requestId: matchedReq.id,
              songTitle: matchedReq.title,
              artist: masterDeck.artist || matchedReq.channel || '',
              requester: matchedReq.requester || 'אורח ברחבה',
              note: matchedReq.note || '',
              photo: matchedReq.photo || null,
              textPosition: matchedReq.textPosition || { x: 50, y: 75 },
              textScale: matchedReq.textScale || 1.0,
              timestamp: Date.now()
            });
          }
        } else {
          // An audible track is playing, but it is NOT a guest request -> mix-out or new song
          if (autoSpotlightReqId !== null) {
            console.log('[Onyx Stage Live] Mixed out to non-guest track. Deactivating Stage Spotlight.');
            autoSpotlightReqId = null;
            setCurrentSpotlightId(null);
            broadcastSpotlight({ active: false, timestamp: Date.now() });
          }
        }
      } catch (e) {
        // Silent catch for accessibility / app not running
      }
    };

    const interval = setInterval(checkMasterDeckAndSpotlight, 1200);
    return () => {
      isCancelled = true;
      clearInterval(interval);
      if (autoSpotlightReqId !== null) {
        broadcastSpotlight({ active: false, timestamp: Date.now() });
      }
    };
  }, [roomCode]);

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
        photo: reqItem.photo || null,
        textPosition: reqItem.textPosition || { x: 50, y: 75 },
        textScale: reqItem.textScale || 1.0,
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

      let activePort = serverPort;
      let res = null;
      const candidatePorts = [serverPort, 8001, 8000, 8002, 8003];
      for (const p of [...new Set(candidatePorts)]) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 2000);
          const testRes = await fetch(`http://127.0.0.1:${p}/api/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(tid);
          if (testRes.ok) {
            res = testRes;
            activePort = p;
            break;
          }
        } catch (e) {
          // try next candidate port
        }
      }

      if (!res) {
        throw new Error('שרת ההורדות המקומי אינו זמין כרגע');
      }

      const data = await res.json();
      if (data && data.job_id) {
        const jobId = data.job_id;
        setRequests(prev => prev.map(r => r.id === item.id ? { ...r, jobId } : r));

        // Poll for progress percentage and completion every 600ms
        const pollTimer = setInterval(async () => {
          try {
            const statusRes = await fetch(`http://127.0.0.1:${activePort}/api/download/${jobId}`);
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
    isActiveRef.current = nextState;
    localStorage.setItem('onyx_room_active_' + roomCode, String(nextState));
    broadcastRoomStatus(nextState);
    // Burst broadcasts to guarantee instant pickup on all mobile networks
    setTimeout(() => broadcastRoomStatus(nextState), 300);
    setTimeout(() => broadcastRoomStatus(nextState), 1000);
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

  // Stage QR URL for wireless screens and TV browsers
  const stageDisplayUrl = `${webHostUrl}/stage.html?room=${encodeURIComponent(roomCode)}&dj=${encodeURIComponent(djNames)}`;

  // Scan all screens (unified Google Cast, AirPlay, and system monitors)
  const scanAllScreens = async () => {
    setIsScanningScreens(true);
    setCastMessage(null);
    const combinedDevices = [];

    // 1. Scan system monitors (Tauri)
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const monitors = await invoke('get_available_monitors');
      if (Array.isArray(monitors)) {
        monitors.forEach((m, idx) => {
          combinedDevices.push({
            id: m.id || `monitor_${idx}`,
            name: m.is_primary ? `${m.name} (מסך מחשב ראשי)` : `${m.name} (מקרן / מסך חיצוני)`,
            model: `${m.width}x${m.height}`,
            type: 'monitor',
            protocol: 'מקרן / מסך מחובר',
            monitorIndex: idx,
            isPrimary: m.is_primary,
            status: 'ready'
          });
        });
      }
    } catch (e) {
      console.warn("Tauri monitors scan skipped or unavailable:", e);
    }

    // 2. Scan wireless devices via Python backend (Chromecast, Android TV, Google TV, AirPlay)
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/cast/devices`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.devices)) {
          data.devices.forEach(dev => {
            combinedDevices.push(dev);
          });
        }
      }
    } catch (e) {
      console.warn("Backend wireless scan error:", e);
    }

    // 3. Check current cast status from backend
    try {
      const statusRes = await fetch(`http://127.0.0.1:${serverPort}/api/cast/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData?.cast?.is_casting && statusData.cast.device) {
          setActiveCastDevice(statusData.cast.device);
        }
      }
    } catch (e) {
      // ignore
    }

    setScreenDevices(combinedDevices);
    setIsScanningScreens(false);
  };

  // Start broadcast to selected screen
  const startCastToDevice = async (device) => {
    setIsCastingLoading(true);
    setCastMessage(null);
    try {
      if (device.type === 'monitor') {
        // Physical / AirPlay connected screen via Tauri
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_qr_stage_on_monitor', { monitorIndex: device.monitorIndex, fullscreen: true });
        setActiveCastDevice(device);
        setCastMessage({ type: 'success', text: `המסך נפתח בהצלחה על: ${device.name} 🚀` });
      } else {
        // Wireless Google Cast / AirPlay via Python backend
        const res = await fetch(`http://127.0.0.1:${serverPort}/api/cast/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: device.id,
            target_url: stageDisplayUrl
          })
        });
        const resData = await res.json();
        if (res.ok && resData.status === 'success') {
          setActiveCastDevice(device);
          setCastMessage({ type: 'success', text: `משדר כעת בהצלחה אל ${device.name}! 📡` });
        } else {
          setCastMessage({ type: 'error', text: resData.message || 'שגיאה בהתחברות למסך האלחוטי' });
        }
      }
    } catch (err) {
      console.error("Cast error:", err);
      setCastMessage({ type: 'error', text: `שגיאה בהפעלת השידור: ${err.message || err}` });
    } finally {
      setIsCastingLoading(false);
    }
  };

  // Stop broadcast
  const stopCastBroadcast = async () => {
    setIsCastingLoading(true);
    try {
      await fetch(`http://127.0.0.1:${serverPort}/api/cast/stop`, { method: 'POST' });
      setActiveCastDevice(null);
      setCastMessage({ type: 'info', text: 'השידור האלחוטי הופסק.' });
    } catch (err) {
      console.error("Stop cast error:", err);
    } finally {
      setIsCastingLoading(false);
    }
  };

  const copyStageDisplayUrl = () => {
    navigator.clipboard.writeText(stageDisplayUrl);
    setCopiedStageUrl(true);
    setTimeout(() => setCopiedStageUrl(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md select-none font-sans ${isModalMaximized ? 'p-0' : 'p-3 md:p-6'}`} dir="rtl">
      
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
              בחרו שיר והקדשה והם ישלחו מיידית לבדיקת ה Dj ברחבה 🎵
            </p>
          </div>

          <div className="text-sm md:text-base font-mono text-amber-300 font-bold bg-slate-900 border border-slate-800 px-6 py-2 rounded-full mb-2">
            חדר: {roomCode}
          </div>
          <p className="text-xs text-slate-400 font-medium">פותחים מצלמה &bull; סורקים &bull; בוחרים שיר &bull; שומעים ברחבה!</p>
        </div>
      )}

      {/* Universal Wireless Display & Screen Cast Modal */}
      {showCastModal && (
        <div className="fixed inset-0 z-[160] bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 md:p-6 animate-fadeIn" dir="rtl">
          <div className="bg-slate-950 border border-amber-500/30 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[0_0_60px_rgba(245,158,11,0.25)] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-black font-black shadow-lg">
                  <Cast className="w-5 h-5 text-black" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-black text-white flex items-center gap-2">
                    שידור מסך אלחוטי לקהל 📡
                  </h3>
                  <p className="text-xs text-slate-400">
                    זיהוי ושידור אוטומטי למסכים ברשת (Android TV, Google TV, Apple TV, Smart TV, מקרנים ומסכים מחוברים)
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowCastModal(false)}
                className="p-2 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              
              {/* Active Broadcast Banner if casting */}
              {activeCastDevice && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-500/50 flex items-center justify-between shadow-lg animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <div>
                      <div className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                        שידור פעיל כעת ברחבה 🔴
                      </div>
                      <div className="text-sm font-bold text-white">
                        {activeCastDevice.name} ({activeCastDevice.protocol || 'מסך חיצוני'})
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={stopCastBroadcast}
                    disabled={isCastingLoading}
                    className="px-3 py-1.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-xs font-black transition-all flex items-center gap-1 active:scale-95 shadow-md"
                  >
                    <span>הפסק שידור ⏹️</span>
                  </button>
                </div>
              )}

              {/* Status or Error Feedback Banner */}
              {castMessage && (
                <div className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                  castMessage.type === 'success' 
                    ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300' 
                    : castMessage.type === 'error'
                    ? 'bg-red-950/60 border border-red-500/40 text-red-300'
                    : 'bg-slate-900 border border-slate-800 text-slate-300'
                }`}>
                  <span>{castMessage.text}</span>
                </div>
              )}

              {/* Scanning Header & Refresh Button */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>מסכים וטלוויזיות שזוהו ברשת ({screenDevices.length})</span>
                </div>
                <button
                  onClick={scanAllScreens}
                  disabled={isScanningScreens}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningScreens ? 'animate-spin text-amber-400' : ''}`} />
                  <span>{isScanningScreens ? 'סורק מסכים ברשת...' : 'רענן סריקה 🔄'}</span>
                </button>
              </div>

              {/* Devices List */}
              <div className="space-y-2.5">
                {isScanningScreens && screenDevices.length === 0 ? (
                  <div className="p-8 text-center bg-slate-900/50 rounded-2xl border border-slate-800/80 space-y-3">
                    <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
                    <p className="text-sm font-bold text-slate-300">סורק מסכים, Apple TV וטלוויזיות ברשת ה-Wi-Fi...</p>
                    <p className="text-xs text-slate-500">הסריקה מתבצעת באופן אוטומטי מול כל הפרוטוקולים</p>
                  </div>
                ) : screenDevices.length > 0 ? (
                  screenDevices.map((dev) => {
                    const isCurrent = activeCastDevice && (activeCastDevice.id === dev.id || activeCastDevice.name === dev.name);
                    return (
                      <div
                        key={dev.id}
                        className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                          isCurrent 
                            ? 'bg-amber-950/20 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]' 
                            : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                            isCurrent
                              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                              : 'bg-slate-800 text-amber-400 border border-slate-700'
                          }`}>
                            {dev.type === 'tv' ? <Tv className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <span>{dev.name}</span>
                              {dev.isPrimary && (
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                                  ראשי
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                                  משדר כעת 🔴
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>{dev.model || dev.protocol}</span>
                              <span className="text-slate-600">&bull;</span>
                              <span className="text-amber-400/80">
                                {dev.type === 'monitor' ? 'חיבור מקרן / מסך מחשב' : 'שידור אלחוטי ברשת'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {isCurrent ? (
                            <button
                              onClick={stopCastBroadcast}
                              disabled={isCastingLoading}
                              className="px-3.5 py-2 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-xs font-black transition-all shadow-md active:scale-95"
                            >
                              נתק שידור ⏹️
                            </button>
                          ) : (
                            <button
                              onClick={() => startCastToDevice(dev)}
                              disabled={isCastingLoading}
                              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                            >
                              <Cast className="w-3.5 h-3.5" />
                              <span>שדר למסך זה 🚀</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center bg-slate-900/40 rounded-2xl border border-slate-800 space-y-2">
                    <Wifi className="w-8 h-8 text-slate-500 mx-auto" />
                    <p className="text-sm font-bold text-slate-300">לא זוהו מסכים אלחוטיים או מקרנים פתוחים כרגע</p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      ודא שהטלוויזיה, ה-Apple TV או ה-Chromecast דולקים ומחוברים לאותה רשת Wi-Fi עם מחשב הדיג'יי.
                    </p>
                  </div>
                )}
              </div>

              {/* Universal Smart TV Browser Link Fallback */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tv className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-white">
                      טלוויזיה חכמה ללא סטרימר? (Samsung / LG webOS / Fire TV)
                    </span>
                  </div>
                  <span className="text-[10px] text-purple-400 font-mono bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-500/30">
                    דפדפן טלוויזיה
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  ניתן לפתוח את דפדפן האינטרנט המובנה בטלוויזיה ולהזין את הכתובת הישירה של הבמה להצגת קוד ה-QR ועדכוני שירים בזמן אמת:
                </p>
                <div className="flex items-center gap-2 bg-black/60 p-2 rounded-xl border border-slate-800 font-mono text-xs text-amber-300">
                  <input
                    type="text"
                    readOnly
                    value={stageDisplayUrl}
                    className="bg-transparent flex-1 outline-none text-[11px] text-slate-300 select-all"
                  />
                  <button
                    onClick={copyStageDisplayUrl}
                    className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all flex items-center gap-1 shrink-0 active:scale-95"
                  >
                    {copiedStageUrl ? <Check className="w-3.5 h-3.5 text-black" /> : <Copy className="w-3.5 h-3.5 text-black" />}
                    <span>{copiedStageUrl ? 'הועתק!' : 'העתק קישור 📋'}</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                כל הפרוטוקולים נתמכים אוטומטית (AirPlay, Cast, HDMI, Wi-Fi)
              </span>
              <button
                onClick={() => setShowCastModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all text-xs"
              >
                סגור
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Location Calibration Modal (Options 2 & 3) */}
      {showLocationModal && (
        <div className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none" dir="rtl">
          <div className="bg-slate-900 border border-purple-500/30 rounded-3xl max-w-xl w-full p-4 sm:p-6 space-y-4 shadow-[0_0_50px_rgba(168,85,247,0.25)] relative text-right max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">כיול מיקום עמדת הדיג'יי (מרכז המסיבה)</h3>
                  <p className="text-[11px] text-slate-400">בחר באפשרות 2 (טלפון) או אפשרות 3 (אולם) לקביעת מיקום מדויק</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {renderLocationCalibrator(true)}

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold transition-all shadow"
              >
                סגור וסיים ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Modal Card */}
      <div className={`w-full bg-slate-950 border border-slate-800 shadow-2xl flex flex-col overflow-hidden relative transition-all duration-200 ${
        isModalMaximized 
          ? 'w-full h-full max-w-none max-h-none rounded-none m-0 border-0' 
          : 'max-w-6xl h-[92vh] max-h-[880px] rounded-3xl'
      }`}>
        
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
            {/* Universal Wireless Cast Button */}
            <button 
              onClick={() => { setShowCastModal(true); scanAllScreens(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 border ${
                activeCastDevice 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400/40 shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-pulse' 
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black border-amber-400/40'
              }`}
              title="שדר את מסך ה-QR למסכים אלחוטיים, טלוויזיות, Apple TV, מקרנים ומסכים מחוברים"
            >
              <Cast className="w-3.5 h-3.5" />
              <span>{activeCastDevice ? `משדר: ${activeCastDevice.name} 🔴` : 'שידור אלחוטי 📡'}</span>
            </button>

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

            {/* Maximize / Restore Button */}
            <button 
              onClick={() => setIsModalMaximized(!isModalMaximized)} 
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all active:scale-95"
              title={isModalMaximized ? "שחזר גודל חלון" : "הגדל למסך מלא"}
            >
              {isModalMaximized ? <Minimize2 className="w-4 h-4 text-purple-400" /> : <Maximize2 className="w-4 h-4 text-purple-400" />}
            </button>

            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all active:scale-95" title="סגור חלון">
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
            <button
              type="button"
              onClick={() => setAutoDownload(!autoDownload)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                autoDownload 
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]' 
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title={autoDownload ? 'הורדה אוטומטית פועלת - כל שיר חדש יורד מיד לעמדת הדיג\'יי' : 'הורדה אוטומטית כבויה - לחץ להפעלה או הורד ידנית'}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${autoDownload ? 'bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse' : 'bg-slate-600'}`} />
              <span>{autoDownload ? 'הורדה אוטומטית: פעילה ⚡' : 'הורדה אוטומטית: כבויה ⏸️'}</span>
            </button>
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

                      {/* Thumbnail or Guest Live Photo */}
                      <div className="relative shrink-0">
                        <img 
                          src={item.photo || item.thumbnail} 
                          className="w-14 h-10 object-cover rounded-lg bg-black border border-slate-800" 
                          alt=""
                        />
                        {item.photo && (
                          <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white p-0.5 rounded-full shadow-md" title="האורח צירף תמונה אמיתית מהאירוע!">
                            <Camera className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>

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

                          {item.photo && (
                            <span className="text-pink-300 flex items-center gap-1 bg-pink-500/10 px-2 py-0.5 rounded-md border border-pink-500/20">
                              <Camera className="w-3 h-3 text-pink-400" />
                              תמונת אורח צורפה 📸
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
                      {/* Live Stage Spotlight Button */}
                      <button 
                        onClick={() => toggleManualSpotlight(item)}
                        className={`p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border ${
                          currentSpotlightId === item.id
                            ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse'
                            : 'bg-slate-800/80 hover:bg-purple-900/40 text-purple-300 hover:text-white border-purple-500/30'
                        }`}
                        title={currentSpotlightId === item.id ? 'השיר מוקרן כעת על מסך הבמה! לחץ לביטול' : 'הקרן שיר, תמונה והקדשה זו למסך הבמה בלייב'}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">
                          {currentSpotlightId === item.id ? 'מוקרן בבמה ✦' : 'הקרן לבמה'}
                        </span>
                      </button>

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
            <div className="flex flex-col items-center justify-center p-4 text-center max-w-2xl mx-auto space-y-5">
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

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {geoEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setLocationTab('phone'); setShowLocationModal(true); }}
                        className="px-2.5 py-1.5 bg-gradient-to-r from-purple-600/30 to-pink-600/30 hover:from-purple-600/40 hover:to-pink-600/40 text-purple-200 border border-purple-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
                        title="כיול GPS אמיתי מסמארטפון הדיג'יי (אופציה 2)"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-purple-400" />
                        <span>כייל מטלפון 📱</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setLocationTab('venue'); setShowLocationModal(true); }}
                        className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1 active:scale-95"
                        title="חיפוש אולם אירועים או כתובת במפה (אופציה 3)"
                      >
                        <Building2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>בחר אולם 🏢</span>
                      </button>
                    </>
                  )}
                  <button 
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
                    title="שנה רדיוס והגדרות מיקום"
                  >
                    שנה רדיוס
                  </button>
                </div>
              </div>

              {/* External Screen / Projector Launch Buttons */}
              <div className="w-full flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => { setShowCastModal(true); scanAllScreens(); }}
                  className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-xs md:text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all active:scale-95"
                >
                  <Cast className="w-4 h-4 text-black" />
                  <span>{activeCastDevice ? `משדר אלחוטית: ${activeCastDevice.name} 🔴` : 'שידור אלחוטי למסכים ומקרנים 📡'}</span>
                </button>
                <button
                  onClick={openStageWindow}
                  className="py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                  title="פתח חלון נפרד להצגת קוד ה-QR על מקרן או מסך חיצוני מחובר"
                >
                  <Monitor className="w-4 h-4" />
                  <span>פתח חלון במה 🖥️</span>
                </button>
                <button
                  onClick={() => setIsBigQr(true)}
                  className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>מסך מלא מהיר</span>
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
            <div className="w-full max-w-3xl mx-auto space-y-4 text-right">
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

                    {/* Location Calibration Options for DJ */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <div className="mb-2.5">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>כיול עמדת הדיג'יי (מרכז המסיבה):</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          בחר בין כיול מסמארטפון (GPS לווייני מדויק) לבין בחירת אולם אירועים במפה:
                        </p>
                      </div>
                      {renderLocationCalibrator(false)}
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
