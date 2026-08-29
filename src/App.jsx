import { useState, useEffect, useRef } from 'react'
import { 
  Search, Download, Music, Video, Sparkles, MonitorPlay, CheckCircle, Clock, Settings, 
  UserCircle, Play, X, Trash2, ListPlus, MapPin, FolderOpen, ListMusic, Clipboard, 
  Radio, Disc, Scissors, Layers, Check, RefreshCw
} from 'lucide-react'
import YouTube from 'react-youtube'

function App() {
  const [url, setUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [mobileTab, setMobileTab] = useState('search') // 'search', 'queue', 'settings'
  
  // Default Target Formats (All 9 Features Restored)
  const [defaultFormats, setDefaultFormats] = useState({ 
    mp3: true, video: false, onyx: false, playlist: false, shazam: false, spotify: false, 
    prefix: false, suffix: true, autoSplit: false 
  })

  const [shazamSettings, setShazamSettings] = useState(() => {
    const saved = localStorage.getItem('onyx_shazam_settings')
    return saved ? JSON.parse(saved) : { sampleDuration: 10, sampleInterval: 90 }
  })

  useEffect(() => {
    localStorage.setItem('onyx_shazam_settings', JSON.stringify(shazamSettings))
  }, [shazamSettings])

  // Queue & Active Jobs Tracking
  const [queue, setQueue] = useState([])
  const [activeJobs, setActiveJobs] = useState({})

  // Core Tools Updates
  const [updatesAvailable, setUpdatesAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Settings & Directories
  const [showSettings, setShowSettings] = useState(false)
  const [directories, setDirectories] = useState(() => {
    const saved = localStorage.getItem('onyx_dirs')
    return saved ? JSON.parse(saved) : {
      audio_dir: '~/Downloads/OnyxAudio',
      video_dir: '~/Downloads/OnyxVideo',
      onyx_dir: '~/Downloads/OnyxProjects'
    }
  })

  // Modals
  const [previewVideoId, setPreviewVideoId] = useState(null)
  const [trimModalItem, setTrimModalItem] = useState(null)
  const [trimStart, setTrimStart] = useState('')
  const [trimEnd, setTrimEnd] = useState('')
  const [ytPlayer, setYtPlayer] = useState(null)

  useEffect(() => {
    localStorage.setItem('onyx_dirs', JSON.stringify(directories))
  }, [directories])

  // Dynamic Server Port Auto-Discovery
  const [serverPort, setServerPort] = useState(8000)

  useEffect(() => {
    let cancelled = false
    const discoverPort = async () => {
      const candidatePorts = [8000, 8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010]
      for (const p of candidatePorts) {
        if (cancelled) break
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 800)
          const res = await fetch(`http://localhost:${p}/api/health`, { signal: controller.signal })
          clearTimeout(timeoutId)
          if (res.ok) {
            setServerPort(p)
            break
          }
        } catch (e) {
          // Searching
        }
      }
    }
    discoverPort()
    const pollInterval = setInterval(discoverPort, 5000)
    return () => {
      cancelled = true
      clearInterval(pollInterval)
    }
  }, [])

  // Auto Check for Yt-dlp Updates
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const res = await fetch(`http://localhost:${serverPort}/api/check-updates`)
        if (res.ok) {
          const data = await res.json()
          if (data.update_available) setUpdatesAvailable(true)
        }
      } catch (err) {
        console.error('Failed to check yt-dlp updates:', err)
      }
    }
    checkUpdates()
  }, [serverPort])

  const handleUpdatePlugins = async () => {
    setUpdating(true)
    try {
      await fetch(`http://localhost:${serverPort}/api/update-plugins`, { method: 'POST' })
      setTimeout(() => {
        setUpdating(false)
        setUpdatesAvailable(false)
      }, 3000)
    } catch (err) {
      console.error(err)
      setUpdating(false)
    }
  }

  const activeJobsRef = useRef(activeJobs)
  useEffect(() => {
    activeJobsRef.current = activeJobs
  }, [activeJobs])

  // Polling for active jobs
  useEffect(() => {
    const interval = setInterval(async () => {
      const currentJobs = activeJobsRef.current
      const activeEntries = Object.entries(currentJobs).filter(([_, job]) => {
        const status = job?.status_data?.status
        return status !== 'completed' && status !== 'error' && job?.job_id
      })

      if (activeEntries.length === 0) return

      for (const [id, job] of activeEntries) {
        try {
          const res = await fetch(`http://localhost:${serverPort}/api/download/${job.job_id}`)
          if (res.ok) {
            const data = await res.json()
            setActiveJobs(prev => ({
              ...prev,
              [id]: { ...prev[id], status_data: data }
            }))
          }
        } catch (e) {
          // Ignore
        }
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [serverPort])

  const handleOpenPath = async (path) => {
    if (!path) return
    try {
      await fetch(`http://localhost:${serverPort}/api/open-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
    } catch (err) {
      console.error('Failed to open path', err)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`http://localhost:${serverPort}/api/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(Array.isArray(data) ? data : data.results || [])
      setVideoInfo(null)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const handleUrlLoad = async () => {
    if (!url.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`http://localhost:${serverPort}/api/info?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (data.entries) {
        setSearchResults(data.entries)
        setVideoInfo(null)
      } else {
        setVideoInfo(data)
        setSearchResults([])
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          setUrl(text)
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err)
    }
  }

  const toggleDefaultFormat = (key) => {
    setDefaultFormats(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const extractVideoId = (vidUrl) => {
    try {
      const u = new URL(vidUrl)
      return u.searchParams.get("v") || u.pathname.split("/").pop()
    } catch {
      return vidUrl
    }
  }

  // --- Queue Logic ---
  const generateId = () => Math.random().toString(36).substr(2, 9)

  const addToQueue = (item) => {
    const internalId = generateId()
    const targetUrl = item.webpage_url || item.original_url || item.url || `https://youtube.com/watch?v=${item.id}`
    
    const newItem = {
      internalId,
      url: targetUrl,
      title: item.title,
      uploader: item.uploader || 'YouTube',
      thumbnail: item.thumbnail || (item.thumbnails && item.thumbnails[0]?.url) || '',
      formats: { ...defaultFormats },
      trimStart: '',
      trimEnd: ''
    }
    setQueue(prev => [...prev, newItem])
  }

  const removeFromQueue = (internalId) => {
    setQueue(prev => prev.filter(item => item.internalId !== internalId))
    setActiveJobs(prev => {
      const newJobs = { ...prev }
      delete newJobs[internalId]
      return newJobs
    })
  }

  const toggleQueueItemFormat = (internalId, formatKey) => {
    setQueue(prev => prev.map(item => {
      if (item.internalId === internalId) {
        return { ...item, formats: { ...item.formats, [formatKey]: !item.formats[formatKey] } }
      }
      return item
    }))
  }

  const openTrimModal = (item) => {
    setTrimModalItem(item)
    setTrimStart(item.trimStart || '')
    setTrimEnd(item.trimEnd || '')
  }

  const saveTrimSettings = () => {
    if (trimModalItem) {
      setQueue(prev => prev.map(item => {
        if (item.internalId === trimModalItem.internalId) {
          return { ...item, trimStart, trimEnd }
        }
        return item
      }))
    }
    setTrimModalItem(null)
    setYtPlayer(null)
  }

  const formatTimeWithMs = (secondsFloat) => {
    if (!secondsFloat) return '00:00.000'
    const m = Math.floor(secondsFloat / 60)
    const s = Math.floor(secondsFloat % 60)
    const ms = Math.floor((secondsFloat % 1) * 1000)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  const captureTime = (target) => {
    if (ytPlayer) {
      const timeStr = formatTimeWithMs(ytPlayer.getCurrentTime())
      if (target === 'start') setTrimStart(timeStr)
      if (target === 'end') setTrimEnd(timeStr)
    }
  }

  const applyToAll = (formatKey) => {
    setQueue(prev => prev.map(item => ({
      ...item,
      formats: { ...item.formats, [formatKey]: true }
    })))
  }

  const clearAllFormats = () => {
    setQueue(prev => prev.map(item => ({
      ...item,
      formats: { mp3: false, video: false, onyx: false, playlist: false, shazam: false, spotify: false, prefix: false, suffix: false, autoSplit: false }
    })))
  }

  const startBatchDownload = async () => {
    const unstartedItems = queue.filter(item => !activeJobs[item.internalId])
    
    for (const item of unstartedItems) {
      const selectedFormats = []
      if (item.formats.video) selectedFormats.push('video')
      if (item.formats.mp3) selectedFormats.push('mp3')
      if (item.formats.onyx) selectedFormats.push('onyx')
      if (item.formats.playlist) selectedFormats.push('playlist')
      if (item.formats.shazam) selectedFormats.push('shazam')
      
      if (selectedFormats.length === 0) continue

      setActiveJobs(prev => ({
        ...prev,
        [item.internalId]: { job_id: null, status_data: { status: 'queued', progress: 'Initializing...' } }
      }))

      try {
        const res = await fetch(`http://localhost:${serverPort}/api/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: item.url,
            formats: selectedFormats,
            audio_dir: directories.audio_dir,
            video_dir: directories.video_dir,
            onyx_dir: directories.onyx_dir,
            spotify: item.formats.spotify,
            bpm_prefix: item.formats.prefix,
            bpm_suffix: item.formats.suffix,
            trim_start: item.trimStart || null,
            trim_end: item.trimEnd || null,
            auto_split: item.formats.autoSplit,
            playlist: item.formats.playlist,
            shazam_extract: item.formats.shazam,
            shazam_sample_duration: parseInt(shazamSettings.sampleDuration) || 10,
            shazam_sample_interval: parseInt(shazamSettings.sampleInterval) || 90
          })
        })
        const data = await res.json()
        setActiveJobs(prev => ({
          ...prev,
          [item.internalId]: { job_id: data.job_id, status_data: { status: 'queued', progress: 'Waiting in backend queue...' } }
        }))
      } catch(e) {
        setActiveJobs(prev => ({
          ...prev,
          [item.internalId]: { job_id: null, status_data: { status: 'error', progress: 'Network error submitting job' } }
        }))
      }
    }
  }

  const getProgressPercent = (statusData) => {
    if (!statusData) return 0
    if (statusData.status === 'completed') return 100
    if (!statusData.progress) return 0
    const match = statusData.progress.match(/(\d+\.?\d*)%/)
    if (match) return parseFloat(match[1])
    return 0
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans pb-16 md:pb-8 select-none">
      {/* macOS Window Drag Bar */}
      <div className="h-6 shrink-0 bg-slate-950" style={{ WebkitAppRegion: 'drag' }}></div>

      <div className="flex-1 max-w-[1400px] w-full mx-auto px-3 md:px-8 space-y-4 md:space-y-6" style={{ WebkitAppRegion: 'no-drag' }}>
        
        {/* Pro DJ Studio Header & Spectrum Visualizer */}
        <header className="glass-panel p-4 md:p-6 space-y-3 relative overflow-hidden">
          <div className="flex justify-between items-center z-10">
            <div className="flex items-center gap-3">
              <img 
                src="/logo_concept_2_transparent.png" 
                alt="Onyx Logo" 
                className="w-9 h-9 md:w-12 md:h-12 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.8)] shrink-0" 
              />
              <div>
                <h1 className="text-lg md:text-2xl font-black tracking-wider bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent uppercase">
                  ONYX <span className="font-light text-slate-300">STUDIO</span>
                </h1>
                <p className="text-[9px] md:text-xs text-slate-400 font-mono tracking-widest hidden sm:block">PRO AUDIO & VIDEO EXTRACTOR</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => alert("Google OAuth Login will open here")} 
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-semibold border border-slate-800 transition-all"
              >
                <UserCircle className="w-4 h-4 text-purple-400" /> Connect Account
              </button>
              <button 
                onClick={() => setShowSettings(true)} 
                className="p-2 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition-all active:scale-95"
              >
                <Settings className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          </div>

          {/* Animated Spectrum Waveform Header */}
          <div className="w-full h-10 bg-slate-950/80 rounded-xl border border-slate-800/80 p-1.5 flex items-center justify-between gap-1 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-cyan-500/10 to-emerald-500/10 pointer-events-none"></div>
            {[35, 70, 45, 90, 60, 100, 50, 85, 65, 95, 40, 80, 55, 75, 90, 45, 85, 60, 95, 50, 75, 35, 85, 65, 100, 45, 90, 55, 70, 40, 85, 60, 95, 50].map((h, i) => (
              <div 
                key={i} 
                className="flex-1 bg-gradient-to-t from-purple-600 via-pink-500 to-cyan-400 rounded-full transition-all duration-300"
                style={{ height: `${h}%`, opacity: 0.7 + (i % 3) * 0.1 }}
              ></div>
            ))}
          </div>
        </header>

        {/* Plugin Update Banner */}
        {updatesAvailable && (
          <div className="bg-gradient-to-r from-purple-900/90 to-indigo-900/90 border border-purple-400/50 rounded-xl p-3.5 shadow-lg flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-2 rounded-lg">
                <Sparkles className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <h3 className="text-white font-bold text-xs md:text-sm">yt-dlp Core Plugin Update</h3>
                <p className="text-purple-100 text-[11px]">Keep download engine updated for uninterrupted streaming.</p>
              </div>
            </div>
            <button 
              onClick={handleUpdatePlugins} 
              disabled={updating}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md ${updating ? 'bg-purple-400 text-white cursor-wait' : 'bg-white text-purple-950 hover:bg-purple-50 hover:scale-105'}`}
            >
              {updating ? 'Updating...' : 'Update Engine'}
            </button>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="glass-panel p-5 w-full max-w-md space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-purple-400" /> Download Preferences
                </h2>
                <button onClick={() => setShowSettings(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Audio Directory</label>
                  <input type="text" value={directories.audio_dir} onChange={e => setDirectories({...directories, audio_dir: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs focus:border-purple-500 outline-none mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Video Directory</label>
                  <input type="text" value={directories.video_dir} onChange={e => setDirectories({...directories, video_dir: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs focus:border-purple-500 outline-none mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">ONYX Projects Directory</label>
                  <input type="text" value={directories.onyx_dir} onChange={e => setDirectories({...directories, onyx_dir: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs focus:border-purple-500 outline-none mt-1" />
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider">Shazam Auto-Extract Settings 🎙️</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400">Sample Duration (sec)</label>
                      <input type="number" min="5" max="30" value={shazamSettings.sampleDuration} onChange={e => setShazamSettings({...shazamSettings, sampleDuration: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-purple-500 outline-none mt-1" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Sample Interval (sec)</label>
                      <input type="number" min="30" max="600" value={shazamSettings.sampleInterval} onChange={e => setShazamSettings({...shazamSettings, sampleInterval: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-purple-500 outline-none mt-1" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button onClick={() => setShowSettings(false)} className="glow-button py-2 text-xs">Save & Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Video Preview Modal */}
        {previewVideoId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="glass-panel p-4 w-full max-w-3xl space-y-3">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm font-bold text-white">Video Preview</h2>
                <button onClick={() => setPreviewVideoId(null)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
              </div>
              <div className="aspect-video w-full bg-black rounded-xl overflow-hidden">
                <iframe 
                  width="100%" 
                  height="100%" 
                  src={`https://www.youtube.com/embed/${previewVideoId}?autoplay=1`}
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          </div>
        )}

        {/* Trimmer Modal (With YouTube Player & Start/End Capture) */}
        {trimModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="glass-panel p-5 w-full max-w-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h2 className="text-sm md:text-base font-bold flex items-center gap-2 text-purple-300 truncate">
                  <Scissors className="w-5 h-5 text-purple-400" /> Trimmer: {trimModalItem.title}
                </h2>
                <button onClick={() => {setTrimModalItem(null); setYtPlayer(null)}}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
              </div>
              
              <div className="aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner">
                <YouTube 
                  videoId={extractVideoId(trimModalItem.url)} 
                  opts={{
                    width: '100%', 
                    height: '100%', 
                    playerVars: { autoplay: 1 }
                  }} 
                  onReady={(e) => setYtPlayer(e.target)}
                  className="w-full h-full"
                />
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] text-slate-400 font-bold uppercase">Start Time</label>
                    <button onClick={() => captureTime('start')} className="text-[10px] flex items-center gap-1 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 px-2 py-0.5 rounded-lg border border-purple-500/30 transition-colors">
                      <MapPin className="w-3 h-3" /> Capture
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={trimStart}
                    onChange={(e) => setTrimStart(e.target.value)}
                    placeholder="00:00.000"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-sm font-mono text-center focus:border-purple-500 outline-none text-purple-200" 
                  />
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] text-slate-400 font-bold uppercase">End Time</label>
                    <button onClick={() => captureTime('end')} className="text-[10px] flex items-center gap-1 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 px-2 py-0.5 rounded-lg border border-purple-500/30 transition-colors">
                      <MapPin className="w-3 h-3" /> Capture
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(e.target.value)}
                    placeholder="03:45.000"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-sm font-mono text-center focus:border-purple-500 outline-none text-purple-200" 
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => {setTrimModalItem(null); setYtPlayer(null)}} className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-900 text-slate-300 text-xs font-semibold">Cancel</button>
                <button onClick={saveTrimSettings} className="glow-button py-2 px-5 text-xs">Save Trims</button>
              </div>
            </div>
          </div>
        )}

        {/* Main Application Layout (Responsive Tabs on Mobile, 2-Columns on Desktop) */}
        <div className="flex flex-col lg:flex-row gap-6 flex-1">
          
          {/* Search & Inputs Panel */}
          <div className={`flex-1 flex-col space-y-6 ${mobileTab === 'search' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="glass-panel p-4 md:p-6 space-y-5">
              <div className="flex flex-col xl:flex-row gap-4">
                {/* Search YouTube Query */}
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search YouTube</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      placeholder="e.g. Synthwave Mix 2026..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs md:text-sm text-white focus:border-purple-500 outline-none"
                    />
                    <button onClick={handleSearch} className="glow-button flex items-center justify-center min-w-[48px]">
                      <Search className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="hidden xl:flex items-center justify-center">
                  <span className="text-slate-600 font-bold text-xs mt-6">OR</span>
                </div>

                {/* Direct Link Input */}
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Direct Link (Video/Playlist)</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs md:text-sm text-white focus:border-purple-500 outline-none"
                    />
                    <button 
                      onClick={handlePasteClipboard} 
                      className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 rounded-2xl text-xs font-bold border border-purple-500/40 flex items-center gap-1 shrink-0 transition-all active:scale-95"
                    >
                      <Clipboard className="w-3.5 h-3.5 text-purple-300" /> Paste
                    </button>
                    <button onClick={handleUrlLoad} className="glow-button px-5 whitespace-nowrap text-xs">
                      Load
                    </button>
                  </div>
                </div>
              </div>

              {/* Default Target Format Toggles (All 9 Features) */}
              <div className="pt-4 border-t border-slate-800/80">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Default Target Formats</h3>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => toggleDefaultFormat('video')} className={`pill-tab ${defaultFormats.video ? 'pill-tab-active-cyan' : 'pill-tab-inactive'}`}>
                    <Video className="w-3.5 h-3.5" /> HQ Video
                  </button>
                  <button onClick={() => toggleDefaultFormat('mp3')} className={`pill-tab ${defaultFormats.mp3 ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}>
                    <Music className="w-3.5 h-3.5" /> Audio (MP3 320k)
                  </button>
                  <button onClick={() => toggleDefaultFormat('onyx')} className={`pill-tab ${defaultFormats.onyx ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}>
                    <Sparkles className="w-3.5 h-3.5" /> ONYX Stems
                  </button>
                  <button onClick={() => toggleDefaultFormat('playlist')} className={`pill-tab ${defaultFormats.playlist ? 'pill-tab-active-emerald' : 'pill-tab-inactive'}`}>
                    <ListMusic className="w-3.5 h-3.5" /> DJ Playlist 🎧
                  </button>
                  <button onClick={() => toggleDefaultFormat('shazam')} className={`pill-tab ${defaultFormats.shazam ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}>
                    <Radio className="w-3.5 h-3.5" /> Shazam Extract 🎙️
                  </button>
                  <button onClick={() => toggleDefaultFormat('spotify')} className={`pill-tab ${defaultFormats.spotify ? 'pill-tab-active-emerald' : 'pill-tab-inactive'}`}>
                    Spotify 🟢
                  </button>
                  <button onClick={() => toggleDefaultFormat('prefix')} className={`pill-tab ${defaultFormats.prefix ? 'pill-tab-active-cyan' : 'pill-tab-inactive'}`}>
                    Prefix BPM
                  </button>
                  <button onClick={() => toggleDefaultFormat('suffix')} className={`pill-tab ${defaultFormats.suffix ? 'pill-tab-active-cyan' : 'pill-tab-inactive'}`}>
                    Suffix BPM
                  </button>
                  <button onClick={() => toggleDefaultFormat('autoSplit')} className={`pill-tab ${defaultFormats.autoSplit ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}>
                    Auto-Split 🔪
                  </button>
                </div>
              </div>
            </div>

            {loading && <div className="text-center py-6 text-purple-300 text-xs font-mono animate-pulse">Fetching video info & track metadata...</div>}

            {/* Single Loaded Video Info Card */}
            {videoInfo && !loading && (
              <div className="glass-panel p-4 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative group cursor-pointer w-full md:w-56 aspect-video shrink-0 bg-slate-950 rounded-xl overflow-hidden border border-slate-800" onClick={() => setPreviewVideoId(extractVideoId(videoInfo.webpage_url || videoInfo.original_url || videoInfo.url || videoInfo.id))}>
                  <img src={videoInfo.thumbnail} alt="thumb" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-10 h-10 text-white drop-shadow-lg" />
                  </div>
                </div>
                <div className="flex flex-col justify-between flex-1 space-y-2 w-full">
                  <div>
                    <h3 className="text-sm font-bold text-white line-clamp-2">{videoInfo.title}</h3>
                    <p className="text-xs text-slate-400">{videoInfo.uploader || 'YouTube'}</p>
                  </div>
                  <button onClick={() => addToQueue(videoInfo)} className="glow-button w-fit flex items-center gap-1.5 py-2 text-xs">
                    <ListPlus className="w-4 h-4" /> Add to Queue
                  </button>
                </div>
              </div>
            )}

            {/* Search Results Grid */}
            {searchResults.length > 0 && !loading && (
              <div className="space-y-3">
                <h3 className="font-bold text-xs text-purple-300 uppercase tracking-wider border-b border-slate-800 pb-2">Results ({searchResults.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {searchResults.map((item, idx) => {
                    const vidId = extractVideoId(item.webpage_url || item.original_url || item.url || item.id)
                    return (
                      <div key={item.id || idx} className="glass-card p-3 flex gap-3 items-center">
                        <div className="relative group cursor-pointer w-24 h-16 bg-slate-950 rounded-lg overflow-hidden shrink-0 border border-slate-800" onClick={() => setPreviewVideoId(vidId)}>
                          {item.thumbnail || (item.thumbnails && item.thumbnails[0]?.url) ? (
                            <img src={item.thumbnail || item.thumbnails[0].url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                          ) : null}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-6 h-6 text-white drop-shadow-lg" />
                          </div>
                        </div>
                        <div className="flex flex-col justify-between flex-1 overflow-hidden space-y-1">
                          <p className="text-xs font-bold text-white truncate" title={item.title}>{item.title}</p>
                          <button 
                            onClick={() => addToQueue(item)}
                            className="text-[11px] font-bold bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 px-2.5 py-1 rounded-xl w-fit transition-all flex items-center gap-1 active:scale-95"
                          >
                            <ListPlus className="w-3.5 h-3.5" /> Add to Queue
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Download Queue & Batch Actions */}
          <div className={`w-full lg:w-96 shrink-0 flex-col bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl relative ${mobileTab === 'queue' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="p-3.5 border-b border-slate-800 flex justify-between items-center bg-slate-950/80">
              <h2 className="font-bold text-xs text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <Download className="w-4 h-4 text-cyan-400" />
                Download Queue ({queue.length})
              </h2>
            </div>

            {/* Batch Actions Bar (Apply to Entire List) */}
            {queue.length > 0 && (
              <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-col gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Apply to entire list:</span>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => applyToAll('video')} className="text-[10px] font-semibold bg-slate-900 hover:bg-blue-500/20 text-slate-300 hover:text-blue-300 px-2 py-0.5 rounded-md border border-slate-800">
                    + MP4
                  </button>
                  <button onClick={() => applyToAll('mp3')} className="text-[10px] font-semibold bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 px-2 py-0.5 rounded-md border border-slate-800">
                    + MP3
                  </button>
                  <button onClick={() => applyToAll('onyx')} className="text-[10px] font-semibold bg-slate-900 hover:bg-purple-500/20 text-slate-300 hover:text-purple-300 px-2 py-0.5 rounded-md border border-slate-800">
                    + ONYX
                  </button>
                  <button onClick={() => applyToAll('playlist')} className="text-[10px] font-semibold bg-slate-900 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 px-2 py-0.5 rounded-md border border-slate-800">
                    + Playlist 🎧
                  </button>
                  <button onClick={() => applyToAll('spotify')} className="text-[10px] font-semibold bg-slate-900 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 px-2 py-0.5 rounded-md border border-slate-800">
                    + Spotify
                  </button>
                  <button onClick={() => applyToAll('prefix')} className="text-[10px] font-semibold bg-slate-900 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 px-2 py-0.5 rounded-md border border-slate-800">
                    + Prefix
                  </button>
                  <button onClick={() => applyToAll('suffix')} className="text-[10px] font-semibold bg-slate-900 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 px-2 py-0.5 rounded-md border border-slate-800">
                    + Suffix
                  </button>
                  <button onClick={() => applyToAll('autoSplit')} className="text-[10px] font-semibold bg-slate-900 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 px-2 py-0.5 rounded-md border border-slate-800">
                    + Auto-Split 🔪
                  </button>
                  <button onClick={clearAllFormats} className="text-[10px] font-semibold bg-slate-900 hover:bg-red-500/20 text-slate-300 hover:text-red-300 px-2 py-0.5 rounded-md border border-slate-800 ml-auto">
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Queued Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
              {queue.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 space-y-2 text-center">
                  <ListPlus className="w-8 h-8 opacity-20" />
                  <p className="text-xs">Queue is empty. Search YouTube or paste a URL to extract tracks.</p>
                </div>
              ) : (
                queue.map((item) => {
                  const job = activeJobs[item.internalId]
                  const statusData = job?.status_data
                  const percent = getProgressPercent(statusData)
                  
                  return (
                    <div key={item.internalId} className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 shadow-sm relative overflow-hidden">
                      
                      {job && (
                        <div 
                          className={`absolute inset-0 opacity-15 ${statusData?.status === 'completed' ? 'bg-emerald-500' : statusData?.status === 'error' ? 'bg-rose-500' : 'bg-purple-500'}`}
                          style={{ width: `${percent}%`, transition: 'width 0.3s ease' }}
                        />
                      )}

                      <div className="relative z-10">
                        <div className="flex gap-2.5 mb-2">
                          <img src={item.thumbnail} className="w-14 h-9 object-cover rounded bg-black shrink-0 border border-slate-800" />
                          <div className="flex-1 overflow-hidden flex flex-col justify-center">
                            <h4 className="text-xs font-bold line-clamp-1 text-slate-200">{item.title}</h4>
                            {(item.trimStart || item.trimEnd) && (
                              <span className="text-[10px] text-emerald-400 font-mono mt-0.5">
                                ✂️ {item.trimStart || '00:00'} - {item.trimEnd || 'End'}
                              </span>
                            )}
                          </div>
                          {!job && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openTrimModal(item)} className="text-slate-400 hover:text-purple-400 transition-colors p-1 rounded" title="Trim Segment">
                                <Scissors className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => removeFromQueue(item.internalId)} className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded" title="Remove">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Inline Item Format Badges Toggle */}
                        {!job ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-1">
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'video')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.video ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                MP4
                              </button>
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'mp3')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.mp3 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                MP3
                              </button>
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'onyx')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.onyx ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                ONYX
                              </button>
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'playlist')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.playlist ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                Playlist 🎧
                              </button>
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'shazam')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.shazam ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                Shazam 🎙️
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'spotify')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.spotify ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                Spotify
                              </button>
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'prefix')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.prefix ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                Prefix
                              </button>
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'suffix')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.suffix ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                Suffix
                              </button>
                              <button onClick={() => toggleQueueItemFormat(item.internalId, 'autoSplit')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${item.formats.autoSplit ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}>
                                Auto-Split 🔪
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="text-purple-300 font-medium truncate pr-2">{statusData?.progress || 'Processing...'}</span>
                              {statusData?.status === 'completed' ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {statusData.result_file && (
                                    <button onClick={() => handleOpenPath(statusData.result_file)} className="text-[10px] bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors">
                                      <Play className="w-3 h-3" /> Play
                                    </button>
                                  )}
                                  {statusData.result_dir && (
                                    <button onClick={() => handleOpenPath(statusData.result_dir)} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors">
                                      <FolderOpen className="w-3 h-3" /> Folder
                                    </button>
                                  )}
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                </div>
                              ) : <span className="font-mono text-cyan-300 font-bold">{percent.toFixed(0)}%</span>}
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                              <div className={`h-full rounded-full transition-all duration-300 ${statusData?.status === 'completed' ? 'bg-emerald-400' : 'bg-purple-500'}`} style={{ width: `${percent}%` }}></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {queue.length > 0 && (
              <div className="p-3 bg-slate-950/90 border-t border-slate-800">
                <button 
                  onClick={startBatchDownload}
                  className="w-full glow-button py-2.5 font-bold text-xs flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download All Tracks ({queue.length})
                </button>
              </div>
            )}
          </div>
          
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-6 py-2 flex justify-around items-center z-40 lg:hidden">
        <button 
          onClick={() => setMobileTab('search')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors ${mobileTab === 'search' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
        >
          <Search className="w-4 h-4" /> Search
        </button>

        <button 
          onClick={() => setMobileTab('queue')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors ${mobileTab === 'queue' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
        >
          <Download className="w-4 h-4" /> Queue ({queue.length})
        </button>

        <button 
          onClick={() => setShowSettings(true)}
          className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-300"
        >
          <Settings className="w-4 h-4" /> Settings
        </button>
      </nav>
    </div>
  )
}

export default App
