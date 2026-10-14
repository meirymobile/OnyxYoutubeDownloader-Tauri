import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, ShieldAlert, ShieldCheck, RefreshCw, Power, 
  CheckCircle2, AlertCircle, Laptop, BellOff, Coffee, 
  Trash2, Filter, Search, Music, Check, X, Sparkles,
  SlidersHorizontal, Layers, ChevronRight
} from 'lucide-react';

export default function App() {
  // Operational Mode: 'whitelist' (keep selected, kill rest) | 'blacklist' (kill selected)
  const [mode, setMode] = useState(() => {
    return localStorage.getItem('onyx_shield_mode') || 'whitelist';
  });

  // State
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPids, setSelectedPids] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Shield Activation State
  const [isShieldActive, setIsShieldActive] = useState(false);
  const [shieldStats, setShieldStats] = useState(null);

  // System Memory
  const [sysMem, setSysMem] = useState({ total_gb: 16, used_gb: 8, free_gb: 8 });

  // Auxiliary Options
  const [muteNotifications, setMuteNotifications] = useState(true);
  const [preventSleep, setPreventSleep] = useState(true);
  const [activeGuard, setActiveGuard] = useState(() => {
    return localStorage.getItem('onyx_shield_active_guard') !== 'false';
  });
  const [confirmPrompt, setConfirmPrompt] = useState(false);
  const [blockedEvents, setBlockedEvents] = useState([]);
  const [latestBlocked, setLatestBlocked] = useState(null);
  const [showBlockedModal, setShowBlockedModal] = useState(false);

  // Sync mode & active guard to localStorage
  useEffect(() => {
    localStorage.setItem('onyx_shield_mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('onyx_shield_active_guard', activeGuard);
  }, [activeGuard]);

  // Listen for real-time app blocked events emitted from Rust Active Guard
  useEffect(() => {
    let unlisten = null;
    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('app_blocked_event', (event) => {
          console.log('[Active Guard Event]', event.payload);
          const data = event.payload;
          setBlockedEvents(prev => [data, ...prev].slice(0, 50));
          setLatestBlocked(data);
          setTimeout(() => {
            setLatestBlocked(curr => (curr?.timestamp === data.timestamp ? null : curr));
          }, 6000);
        });
      } catch (e) {
        console.warn('Tauri event listener setup failed:', e);
      }
    };
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Invoke helper with graceful fallback for browser preview
  const callTauri = async (cmd, args = {}) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke(cmd, args);
    } catch (e) {
      console.warn(`[Tauri Mock] cmd: ${cmd}`, e);
      // Mock data for browser testing
      if (cmd === 'get_running_gui_apps') {
        return [
          { pid: 101, name: "Serato DJ Pro", bundle_id: "com.serato.seratodjpro", mem_mb: 850.5, is_dj_app: true, is_protected: false, category: "dj" },
          { pid: 102, name: "Onyx Downloader", bundle_id: "com.meir.onyx", mem_mb: 180.2, is_dj_app: true, is_protected: true, category: "dj" },
          { pid: 201, name: "Google Chrome", bundle_id: "com.google.Chrome", mem_mb: 1420.0, is_dj_app: false, is_protected: false, category: "browser" },
          { pid: 202, name: "WhatsApp", bundle_id: "net.whatsapp.WhatsApp", mem_mb: 480.0, is_dj_app: false, is_protected: false, category: "chat" },
          { pid: 203, name: "Telegram", bundle_id: "ru.keepcoder.Telegram", mem_mb: 320.0, is_dj_app: false, is_protected: false, category: "chat" },
          { pid: 204, name: "Spotify", bundle_id: "com.spotify.client", mem_mb: 390.0, is_dj_app: true, is_protected: false, category: "media" },
          { pid: 205, name: "Finder", bundle_id: "com.apple.finder", mem_mb: 110.0, is_dj_app: false, is_protected: true, category: "system" },
          { pid: 206, name: "Activity Monitor", bundle_id: "com.apple.ActivityMonitor", mem_mb: 95.0, is_dj_app: false, is_protected: false, category: "system" }
        ];
      }
      if (cmd === 'get_system_memory') {
        return { total_gb: 16.0, used_gb: 11.2, free_gb: 4.8 };
      }
      if (cmd === 'terminate_apps') {
        return { closed_count: (args.pids || []).length, freed_mem_mb: 2200.0, closed_names: [], errors: [] };
      }
      return null;
    }
  };

  // Load apps and system RAM
  const refreshData = async () => {
    setLoading(true);
    try {
      const [appList, memInfo] = await Promise.all([
        callTauri('get_running_gui_apps'),
        callTauri('get_system_memory')
      ]);

      if (appList) {
        setApps(appList);

        // Auto-initialize selections based on mode if empty
        const savedWhitelist = JSON.parse(localStorage.getItem('onyx_saved_whitelist') || '[]');
        
        if (mode === 'whitelist') {
          // Select apps to KEEP (DJ apps by default or saved whitelist)
          const keepSet = new Set();
          appList.forEach(app => {
            if (app.is_dj_app || app.is_protected || savedWhitelist.includes(app.name)) {
              keepSet.add(app.pid);
            }
          });
          setSelectedPids(keepSet);
        } else {
          // Blacklist: select apps to KILL (browsers, chats, heavy apps)
          const killSet = new Set();
          appList.forEach(app => {
            if (!app.is_dj_app && !app.is_protected && (app.category === 'browser' || app.category === 'chat')) {
              killSet.add(app.pid);
            }
          });
          setSelectedPids(killSet);
        }
      }

      if (memInfo) {
        setSysMem(memInfo);
      }
    } catch (err) {
      console.error("Error refreshing data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [mode]);

  // Filter apps based on search & category
  const filteredApps = useMemo(() => {
    return apps.filter(app => {
      const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            app.bundle_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || app.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [apps, searchQuery, categoryFilter]);

  // Calculate target apps to terminate
  const targetPidsToKill = useMemo(() => {
    if (mode === 'whitelist') {
      // In Whitelist: Kill everything NOT in selectedPids (and not protected)
      return apps.filter(a => !selectedPids.has(a.pid) && !a.is_protected).map(a => a.pid);
    } else {
      // In Blacklist: Kill everything in selectedPids (and not protected)
      return apps.filter(a => selectedPids.has(a.pid) && !a.is_protected).map(a => a.pid);
    }
  }, [apps, selectedPids, mode]);

  // Calculate RAM to be freed
  const reclaimableMemMb = useMemo(() => {
    const killSet = new Set(targetPidsToKill);
    return apps
      .filter(a => killSet.has(a.pid))
      .reduce((sum, a) => sum + (a.mem_mb || 0), 0);
  }, [apps, targetPidsToKill]);

  const reclaimableDisplay = useMemo(() => {
    if (reclaimableMemMb >= 1024) {
      return `${(reclaimableMemMb / 1024).toFixed(1)} GB`;
    }
    return `${Math.round(reclaimableMemMb)} MB`;
  }, [reclaimableMemMb]);

  const projectedFreeGb = useMemo(() => {
    const additionalGb = reclaimableMemMb / 1024;
    return (sysMem.free_gb + additionalGb).toFixed(1);
  }, [sysMem.free_gb, reclaimableMemMb]);

  // Toggle single app selection
  const toggleAppSelection = (pid) => {
    setSelectedPids(prev => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });
  };

  // Quick Preset Handlers
  const selectAllDjApps = () => {
    const set = new Set();
    apps.forEach(a => {
      if (a.is_dj_app || a.is_protected) set.add(a.pid);
    });
    setSelectedPids(set);
  };

  const selectOnlyDistractions = () => {
    const set = new Set();
    apps.forEach(a => {
      if (a.category === 'browser' || a.category === 'chat') {
        set.add(a.pid);
      }
    });
    setSelectedPids(set);
  };

  const selectAll = () => {
    setSelectedPids(new Set(apps.map(a => a.pid)));
  };

  const clearSelection = () => {
    setSelectedPids(new Set());
  };

  // Execute Shield Activation
  const activateShield = async () => {
    if (targetPidsToKill.length === 0) {
      alert("אין אפליקציות לסגירה בהתאם להגדרות הנוכחיות.");
      return;
    }

    if (confirmPrompt) {
      const msg = mode === 'whitelist'
        ? `האם להפעיל מגן הופעה? פעולה זו תסגור ${targetPidsToKill.length} אפליקציות ותפנה כ-${(reclaimableMemMb / 1024).toFixed(1)} GB RAM.`
        : `האם לסגור ${targetPidsToKill.length} אפליקציות מסומנות ולפנות כ-${(reclaimableMemMb / 1024).toFixed(1)} GB RAM?`;
      if (!window.confirm(msg)) return;
    }

    setLoading(true);
    try {
      // 1. Terminate targeted apps
      const res = await callTauri('terminate_apps', { pids: targetPidsToKill, force: false });

      // 2. Set Focus / Do Not Disturb Mode if enabled
      if (muteNotifications) {
        await callTauri('set_focus_mode', { enable: true });
      }

      // 3. Set Anti-Sleep Caffeinate if enabled
      if (preventSleep) {
        await callTauri('set_caffeinate', { enable: true });
      }

      // 4. Start Active Guard if enabled
      if (activeGuard) {
        let allowedNames = [];
        if (mode === 'whitelist') {
          allowedNames = apps
            .filter(a => selectedPids.has(a.pid) || a.is_protected)
            .map(a => a.name);
        } else {
          allowedNames = apps
            .filter(a => !selectedPids.has(a.pid) || a.is_protected)
            .map(a => a.name);
        }
        await callTauri('set_active_guard', { enable: true, allowedNames });
      }

      // 5. Save current Whitelist to localStorage
      if (mode === 'whitelist') {
        const keptNames = apps.filter(a => selectedPids.has(a.pid)).map(a => a.name);
        localStorage.setItem('onyx_saved_whitelist', JSON.stringify(keptNames));
      }

      setIsShieldActive(true);
      setShieldStats({
        closedCount: res?.closed_count || targetPidsToKill.length,
        freedMemMb: res?.freed_mem_mb || reclaimableMemMb,
        time: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      });

      // Refresh list
      await refreshData();
    } catch (err) {
      console.error("Failed to activate shield:", err);
      alert("שגיאה בהפעלת מגן ההופעה: " + err);
    } finally {
      setLoading(false);
    }
  };

  // Deactivate Shield
  const deactivateShield = async () => {
    setLoading(true);
    try {
      await Promise.all([
        callTauri('set_caffeinate', { enable: false }),
        callTauri('set_active_guard', { enable: false, allowedNames: [] })
      ]);
      setIsShieldActive(false);
      setShieldStats(null);
      await refreshData();
    } catch (err) {
      console.error("Error deactivating shield:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 select-none overflow-hidden font-sans border border-slate-800/80 rounded-2xl shadow-2xl">
      
      {/* ======================================================== */}
      {/* TOP BAR / LUXURY HEADER                                 */}
      {/* ======================================================== */}
      <header className="px-6 py-4 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <img 
              src="/icon.png" 
              alt="Onyx DJ Shield" 
              className={`w-10 h-10 rounded-xl object-cover border transition-all ${
                isShieldActive 
                  ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)] animate-pulse' 
                  : 'border-slate-700/80 shadow-md'
              }`} 
            />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>ONYX DJ PERFORMANCE SHIELD</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-amber-500/30">
                  v1.0 PRO
                </span>
              </h1>

              {/* REQUESTED: By DJ Shazz — Authentic Engraved Metallic Styling */}
              <div 
                className="engraved-dj-shazz px-3 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1.5 shadow-inner cursor-default"
                title="Designed & Tailored By DJ Shazz for Uncompromising Live Performance"
              >
                <span>BY DJ SHAZZ</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              מגן ביצועים והופעות לדיג'יי &bull; סטריליזציית מערכת, מניעת קפיצות סאונד והשתקת התראות
            </p>
          </div>
        </div>

        {/* System Memory & Status Badges */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <div>
              <span className="text-slate-500 text-[10px] block">RAM תפוס</span>
              <span className="font-bold text-amber-400">{sysMem.used_gb} GB</span>
            </div>
            <div className="w-[1px] h-6 bg-slate-800" />
            <div>
              <span className="text-slate-500 text-[10px] block">RAM פנוי</span>
              <span className="font-bold text-emerald-400">{sysMem.free_gb} GB</span>
            </div>
            <div className="w-[1px] h-6 bg-slate-800" />
            <div 
              className="relative cursor-help text-right"
              title={`סגירת ${targetPidsToKill.length} האפליקציות שנבחרו תפנה ${reclaimableDisplay} (ה-RAM הפנוי יגדל מ-${sysMem.free_gb} GB ל-${projectedFreeGb} GB)`}
            >
              <span className="text-purple-400 text-[10px] font-bold block flex items-center gap-1 justify-end">
                <span>ניתן לפנות</span>
                {reclaimableMemMb > 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
              </span>
              <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300">
                {reclaimableDisplay}
              </span>
            </div>
            <div className="w-[1px] h-6 bg-slate-800" />
            <div>
              <span className="text-slate-500 text-[10px] block">סה"כ</span>
              <span className="font-bold text-slate-300">{sysMem.total_gb} GB</span>
            </div>
          </div>

          {/* Live Shield State Indicator */}
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
            isShieldActive 
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
              : 'bg-slate-900 text-slate-400 border-slate-800'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isShieldActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
            <span>{isShieldActive ? 'SHIELD ACTIVE 🛡️' : 'STANDBY ⚪'}</span>
          </div>

          {/* Refresh Button */}
          <button 
            onClick={refreshData}
            disabled={loading}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            title="רענן רשימת אפליקציות וזיכרון"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* SHIELD ACTIVE BANNER (IF ACTIVE)                         */}
      {/* ======================================================== */}
      {isShieldActive && shieldStats && (
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 border-b border-emerald-500/40 px-6 py-2.5 flex items-center justify-between text-xs animate-fadeIn shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 font-black flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              מגן ההופעות פועל ומגן על הסביבה שלך!
            </span>
            <span className="text-slate-300">
              נסגרו <b>{shieldStats.closedCount}</b> אפליקציות &bull; פונו <b>{(shieldStats.freedMemMb / 1024).toFixed(2)} GB</b> זיכרון &bull; התראות מושתקות &bull; מסך נעול כנגד שינה
              {activeGuard && (
                <>
                  {' '}&bull;{' '}
                  <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    שומר רקע פעיל
                    {blockedEvents.length > 0 && (
                      <button 
                        onClick={() => setShowBlockedModal(true)}
                        className="underline hover:text-amber-200 ml-1 cursor-pointer bg-amber-500/20 px-1.5 py-0.5 rounded text-[10px]"
                      >
                        (נחסמו {blockedEvents.length} ניסיונות)
                      </button>
                    )}
                  </span>
                </>
              )}
            </span>
          </div>
          <button 
            onClick={deactivateShield}
            className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg font-bold text-xs transition-all active:scale-95"
          >
            שחרר מגן (יציאה ממצב הופעה) 🔓
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* MAIN CONTROL BAR: MODE SELECTOR & PRESETS                */}
      {/* ======================================================== */}
      <div className="px-6 py-3.5 bg-slate-900/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Dual Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setMode('whitelist')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'whitelist'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>מצב שימור (מה להשאיר) 🎧</span>
          </button>

          <button 
            onClick={() => setMode('blacklist')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'blacklist'
                ? 'bg-rose-500 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>מצב ניקוי (מה לסגור) 🧹</span>
          </button>
        </div>

        {/* Quick Selection Shortcuts */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 text-[11px] font-bold">בחירה מהירה:</span>
          {mode === 'whitelist' ? (
            <>
              <button 
                onClick={selectAllDjApps}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-amber-300 border border-amber-500/20 font-semibold transition-all active:scale-95"
              >
                סמן רק DJ Software 🎧
              </button>
              <button 
                onClick={selectAll}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-semibold transition-all active:scale-95"
              >
                השאר הכל
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={selectOnlyDistractions}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-rose-300 border border-rose-500/20 font-semibold transition-all active:scale-95"
              >
                דפדפנים וצ'אטים 🌐
              </button>
              <button 
                onClick={clearSelection}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 font-semibold transition-all active:scale-95"
              >
                נקה בחירה
              </button>
            </>
          )}
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-500" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש אפליקציה..."
              className="w-44 bg-slate-950 border border-slate-800 rounded-xl pr-8 pl-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-amber-500/50"
          >
            <option value="all">כל הקטגוריות</option>
            <option value="dj">תוכנות DJ 🎧</option>
            <option value="browser">דפדפנים 🌐</option>
            <option value="chat">צ'אט והודעות 💬</option>
            <option value="media">מדיה וסאונד 🎵</option>
            <option value="system">מערכת ⚙️</option>
            <option value="other">אחר 📦</option>
          </select>
        </div>
      </div>

      {/* Mode Explanatory Sub-banner */}
      <div className="px-6 py-2 bg-slate-900/20 border-b border-slate-800/40 text-[11px] text-slate-400 flex items-center justify-between">
        <div>
          {mode === 'whitelist' ? (
            <span>
              💡 <b>מצב שימור (Whitelist):</b> סמן את התוכנות שחייבות להישאר פעילות (תוכנות הדיג'יי שלך). כל שאר האפליקציות <b>ייסגרו אוטומטית</b> בלחיצה על כפתור המגן!
            </span>
          ) : (
            <span>
              💡 <b>מצב ניקוי (Blacklist):</b> סמן ב-V את האפליקציות שברצונך לסגור כעת מתוך הזיכרון.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 font-mono text-xs">
          <span className="text-slate-500">
            {apps.length} אפליקציות
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold flex items-center gap-1.5 shadow-sm">
            <span>⚡ זיכרון שיתפנה:</span>
            <span className="text-amber-300 font-black">{reclaimableDisplay}</span>
            <span className="text-[10px] text-purple-400">({targetPidsToKill.length} לסגירה)</span>
          </span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* APPS LIST (MAIN SCROLLABLE AREA)                         */}
      {/* ======================================================== */}
      <main className="flex-1 overflow-y-auto p-6 space-y-2.5">
        {loading && apps.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
            <span className="text-xs font-semibold">סורק אפליקציות פעילות ב-macOS...</span>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Filter className="w-8 h-8 text-slate-600" />
            <span className="text-xs font-semibold">לא נמצאו אפליקציות התואמות לחיפוש</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredApps.map((app) => {
              const isSelected = selectedPids.has(app.pid);
              
              // In Whitelist: App will be killed if it's NOT selected (and not protected)
              // In Blacklist: App will be killed if it IS selected (and not protected)
              const willBeKilled = mode === 'whitelist' 
                ? (!isSelected && !app.is_protected)
                : (isSelected && !app.is_protected);

              return (
                <div 
                  key={app.pid}
                  onClick={() => !app.is_protected && toggleAppSelection(app.pid)}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                    app.is_protected
                      ? 'bg-slate-900/30 border-slate-800/60 opacity-60 cursor-not-allowed'
                      : willBeKilled
                        ? 'bg-rose-950/20 border-rose-500/40 hover:bg-rose-950/30 shadow-[0_0_15px_rgba(244,63,94,0.08)]'
                        : isSelected && mode === 'whitelist'
                          ? 'bg-emerald-950/20 border-emerald-500/40 hover:bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Checkbox indicator */}
                    <div className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                      app.is_protected
                        ? 'bg-slate-800 border-slate-700 text-slate-500'
                        : isSelected
                          ? mode === 'whitelist'
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                            : 'bg-rose-500 border-rose-400 text-white font-bold'
                          : 'border-slate-700 bg-slate-950'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      {app.is_protected && <span className="text-[10px]">🔒</span>}
                    </div>

                    {/* App Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white truncate">{app.name}</span>
                        {app.is_dj_app && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider">
                            DJ SOFTWARE 🎧
                          </span>
                        )}
                        {app.is_protected && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[9px] font-bold">
                            מוגן (Core)
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        PID: {app.pid} &bull; {app.bundle_id || 'macOS App'}
                      </div>
                    </div>
                  </div>

                  {/* Memory & Action Badge */}
                  <div className="text-left shrink-0 pl-1">
                    <span className="font-mono font-bold text-xs text-slate-300 block">
                      {app.mem_mb >= 1024 
                        ? `${(app.mem_mb / 1024).toFixed(1)} GB` 
                        : `${Math.round(app.mem_mb)} MB`}
                    </span>
                    <span className={`text-[10px] font-bold ${
                      willBeKilled 
                        ? 'text-rose-400' 
                        : isSelected && mode === 'whitelist'
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                    }`}>
                      {willBeKilled ? 'ייסגר במגן 🛑' : 'יישאר פעיל ✅'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* BOTTOM ACTION BAR                                        */}
      {/* ======================================================== */}
      <footer className="px-6 py-4 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        
        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors">
            <input 
              type="checkbox"
              checked={muteNotifications}
              onChange={(e) => setMuteNotifications(e.target.checked)}
              className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
            />
            <BellOff className="w-3.5 h-3.5 text-amber-400" />
            <span>השתק התראות ואייפון (Focus) 🔕</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors">
            <input 
              type="checkbox"
              checked={preventSleep}
              onChange={(e) => setPreventSleep(e.target.checked)}
              className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
            />
            <Coffee className="w-3.5 h-3.5 text-amber-400" />
            <span>מנע שינה ושומר מסך ☕</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors">
            <input 
              type="checkbox"
              checked={activeGuard}
              onChange={(e) => setActiveGuard(e.target.checked)}
              className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
            />
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>שומר רקע אקטיבי (חסימת פתיחה אוטומטית) 🛡️</span>
          </label>

          <label className="hidden xl:flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-300 transition-colors">
            <input 
              type="checkbox"
              checked={confirmPrompt}
              onChange={(e) => setConfirmPrompt(e.target.checked)}
              className="accent-amber-500 w-4 h-4 rounded cursor-pointer"
            />
            <span>בקש אישור</span>
          </label>
        </div>

        {/* Action Button & Memory Summary */}
        <div className="flex items-center gap-4">
          <div className="text-left font-mono">
            <span className="text-[10px] text-slate-400 block">סך פינוי משוער:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">{targetPidsToKill.length} אפליקציות &bull;</span>
              <span className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300">
                +{reclaimableDisplay} RAM
              </span>
            </div>
          </div>

          <button
            onClick={activateShield}
            disabled={loading || targetPidsToKill.length === 0}
            className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === 'whitelist'
                ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-orange-500/20'
                : 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-rose-600/20'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>
              {mode === 'whitelist'
                ? 'הפעל מגן הופעה - סגור את כל השאר 🛡️'
                : 'סגור אפליקציות מסומנות 🧹'}
            </span>
          </button>
        </div>
      </footer>

      {/* Real-time Blocked App Toast */}
      {latestBlocked && (
        <div className="fixed bottom-20 right-6 z-50 bg-rose-950/95 border border-rose-500/60 shadow-[0_0_30px_rgba(244,63,94,0.3)] rounded-2xl p-4 text-xs text-rose-200 flex items-center gap-3 backdrop-blur-md animate-slideUp">
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="font-bold text-white text-sm flex items-center gap-2">
              <span>הפעלת רקע נבלמה אוטומטית! 🛑</span>
              <span className="text-[10px] bg-rose-500/30 px-1.5 py-0.5 rounded text-rose-300">
                ACTIVE GUARD
              </span>
            </div>
            <div className="text-slate-300 mt-0.5">
              האפליקציה <b className="text-amber-300">{latestBlocked.name}</b> (PID {latestBlocked.pid}) נסגרה מיידית.
            </div>
          </div>
          <button 
            onClick={() => setLatestBlocked(null)} 
            className="p-1 hover:text-white text-slate-400 hover:bg-slate-800 rounded-lg transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Blocked Events Modal */}
      {showBlockedModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <span>היסטוריית חסימות בזמן אמת (Active Guard)</span>
              </div>
              <button 
                onClick={() => setShowBlockedModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-2">
              {blockedEvents.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-xs">
                  לא נרשמו ניסיונות פתיחה שנחסמו עד כה. המערכת שקטה.
                </div>
              ) : (
                blockedEvents.map((evt, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white">{evt.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">PID {evt.pid}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-rose-400 font-bold block">נחסם מיידית 🛑</span>
                      <span className="text-[9px] text-slate-500">
                        {new Date(evt.timestamp).toLocaleTimeString('he-IL')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
              <button 
                onClick={() => setBlockedEvents([])}
                className="text-slate-400 hover:text-rose-400 transition-colors"
              >
                נקה היסטוריה
              </button>
              <button 
                onClick={() => setShowBlockedModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
