import { useState, useEffect, useRef } from 'react'
import { 
  Search, Download, Music, Video, Sparkles, Settings, UserCircle, Play, X, Trash2, 
  FolderOpen, ListMusic, Clipboard, Disc, Radio, Activity, Check, Volume2, ShieldCheck
} from 'lucide-react'
import YouTube from 'react-youtube'

function App() {
  const [url, setUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('home') // 'home', 'search', 'downloads', 'settings'
  
  // Default formats for searching & downloading
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

  // Queue & Jobs
  const [queue, setQueue] = useState([])
  const [activeJobs, setActiveJobs] = useState({})

  // Updates & Settings
  const [updatesAvailable, setUpdatesAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [directories, setDirectories] = useState(() => {
    const saved = localStorage.getItem('onyx_dirs')
    return saved ? JSON.parse(saved) : {
      audio_dir: '~/Downloads/OnyxAudio',
      video_dir: '~/Downloads/OnyxVideo',
      onyx_dir: '~/Downloads/OnyxProjects'
    }
  })

  // Preview & Trimmer
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
          // Continue searching
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
          console.error(e)
        }
      }
    }, 1500)
    return () => clearInterval(interval)
  }, [serverPort])

  // One-Tap Clipboard Paste Handler
  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          setUrl(text)
          if (text.includes('youtube.com') || text.includes('youtu.be')) {
            handleLoadUrl(text)
          }
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err)
    }
  }

  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    if (!searchQuery.trim()) return
    setLoading(true)
    setSearchResults([])
    try {
      const res = await fetch(`http://localhost:${serverPort}/api/search?q=${encodeURIComponent(searchQuery)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.results || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadUrl = async (inputUrl = url) => {
    if (!inputUrl.trim()) return
    setLoading(true)
    setVideoInfo(null)
    try {
      const res = await fetch(`http://localhost:${serverPort}/api/video-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl })
      })
      if (res.ok) {
        const data = await res.json()
        setVideoInfo(data)
        addToQueue(data, inputUrl)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const addToQueue = (info, targetUrl) => {
    const newItem = {
      internalId: Date.now() + Math.random().toString(36).substring(2, 5),
      title: info.title,
      uploader: info.uploader || 'YouTube',
      thumbnail: info.thumbnail,
      duration: info.duration_string || info.duration || '3:45',
      url: targetUrl,
      formats: { ...defaultFormats }
    }
    setQueue(prev => [newItem, ...prev])
  }

  const removeFromQueue = (internalId) => {
    setQueue(prev => prev.filter(i => i.internalId !== internalId))
    setActiveJobs(prev => {
      const updated = { ...prev }
      delete updated[internalId]
      return updated
    })
  }

  const toggleFormat = (internalId, formatKey) => {
    setQueue(prev => prev.map(item => {
      if (item.internalId === internalId) {
        return {
          ...item,
          formats: { ...item.formats, [formatKey]: !item.formats[formatKey] }
        }
      }
      return item
    }))
  }

  const startSingleDownload = async (item) => {
    const selectedFormats = []
    if (item.formats.video) selectedFormats.push('video')
    if (item.formats.mp3) selectedFormats.push('mp3')
    if (item.formats.onyx) selectedFormats.push('onyx')
    if (item.formats.playlist) selectedFormats.push('playlist')
    if (item.formats.shazam) selectedFormats.push('shazam')

    if (selectedFormats.length === 0) selectedFormats.push('mp3')

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
        [item.internalId]: { job_id: data.job_id, status_data: { status: 'queued', progress: 'Downloading audio stream...' } }
      }))
    } catch (e) {
      setActiveJobs(prev => ({
        ...prev,
        [item.internalId]: { job_id: null, status_data: { status: 'error', progress: 'Network error submitting job' } }
      }))
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
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans pb-20 md:pb-8 select-none">
      {/* Window Drag Bar for macOS */}
      <div className="h-6 shrink-0 bg-slate-950/80 backdrop-blur-md" style={{ WebkitAppRegion: 'drag' }}></div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 md:px-8 space-y-6" style={{ WebkitAppRegion: 'no-drag' }}>
        
        {/* Pro DJ Studio Header */}
        <header className="glass-panel p-4 md:p-6 flex flex-col gap-4 relative overflow-hidden">
          <div className="flex justify-between items-center z-10">
            <div className="flex items-center gap-3">
              <img 
                src="/logo_concept_2_transparent.png" 
                alt="Onyx Logo" 
                className="w-10 h-10 md:w-12 md:h-12 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.8)]"
              />
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-wider bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent uppercase">
                  ONYX <span className="font-light text-slate-300">STUDIO</span>
                </h1>
                <p className="text-[10px] md:text-xs text-slate-400 font-mono tracking-widest">PRO AUDIO & VIDEO EXTRACTOR</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="bpm-badge px-3 py-1 rounded-full text-xs font-mono font-bold text-purple-300 border border-purple-500/80 bg-purple-950/40 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                128 BPM
              </span>
              <button 
                onClick={() => setShowSettings(true)} 
                className="p-2.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700/60 transition-all active:scale-95"
              >
                <Settings className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          </div>

          {/* Animated Waveform Visualizer Display */}
          <div className="w-full h-12 bg-slate-950/70 rounded-xl border border-slate-800/80 p-2 flex items-center justify-between gap-1 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-cyan-500/10 to-emerald-500/10 pointer-events-none"></div>
            {[40, 75, 30, 90, 60, 100, 45, 80, 65, 95, 35, 85, 55, 70, 90, 40, 85, 60, 95, 50, 75, 30, 85, 65, 100, 40, 90, 55, 70, 45, 80, 60, 95, 50].map((h, i) => (
              <div 
                key={i} 
                className="flex-1 bg-gradient-to-t from-purple-600 via-pink-500 to-cyan-400 rounded-full transition-all duration-300"
                style={{ height: `${h}%`, opacity: 0.7 + (i % 3) * 0.1 }}
              ></div>
            ))}
          </div>
        </header>

        {/* Plugin Updates Banner */}
        {updatesAvailable && (
          <div className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 border border-purple-500/50 rounded-2xl p-4 shadow-xl flex items-center justify-between backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="bg-purple-500/20 p-2.5 rounded-xl border border-purple-400/30">
                <Sparkles className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">yt-dlp Core Plugin Update</h3>
                <p className="text-purple-200 text-xs mt-0.5">Keep download engine up to date for uninterrupted streaming.</p>
              </div>
            </div>
            <button 
              onClick={handleUpdatePlugins} 
              disabled={updating}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-500 hover:bg-purple-400 text-white shadow-lg shadow-purple-500/30 transition-all active:scale-95"
            >
              {updating ? 'Updating...' : 'Update Engine'}
            </button>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="glass-panel p-6 w-full max-w-lg space-y-4 relative">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-purple-400" /> Download Preferences
                </h2>
                <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs font-semibold text-slate-400">Audio Directory</label>
                  <input type="text" value={directories.audio_dir} onChange={e => setDirectories({...directories, audio_dir: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 mt-1 focus:border-purple-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400">Video Directory</label>
                  <input type="text" value={directories.video_dir} onChange={e => setDirectories({...directories, video_dir: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 mt-1 focus:border-purple-500 outline-none" />
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider">Shazam Auto-Extract Settings 🎙️</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400">Sample Duration (sec)</label>
                      <input type="number" value={shazamSettings.sampleDuration} onChange={e => setShazamSettings({...shazamSettings, sampleDuration: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-purple-200 mt-1" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Sample Interval (sec)</label>
                      <input type="number" value={shazamSettings.sampleInterval} onChange={e => setShazamSettings({...shazamSettings, sampleInterval: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-purple-200 mt-1" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Smart Search & URL Paste Input Bar */}
        <section className="glass-panel p-4 md:p-6 space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-500" />
              <input 
                type="text" 
                placeholder="Paste YouTube Link or Search Songs..."
                value={url || searchQuery}
                onChange={e => {
                  setUrl(e.target.value)
                  setSearchQuery(e.target.value)
                }}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-12 pr-28 py-3.5 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
              />
              <button 
                type="button" 
                onClick={handlePasteClipboard}
                className="absolute right-2 top-2 px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Clipboard className="w-3.5 h-3.5 text-purple-300" /> Paste
              </button>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="glow-button flex items-center justify-center gap-2 py-3.5 min-w-[120px]"
            >
              {loading ? <Activity className="w-5 h-5 animate-spin" /> : <><Search className="w-4 h-4" /> Fetch</>}
            </button>
          </form>

          {/* Quick Target Format Selector Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
            <span className="text-xs font-mono font-bold text-slate-400 mr-2 uppercase">Quick Target:</span>
            
            <button 
              onClick={() => setDefaultFormats(f => ({ ...f, mp3: !f.mp3 }))}
              className={`pill-tab ${defaultFormats.mp3 ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}
            >
              <Music className="w-3.5 h-3.5" /> MP3 320k
            </button>

            <button 
              onClick={() => setDefaultFormats(f => ({ ...f, video: !f.video }))}
              className={`pill-tab ${defaultFormats.video ? 'pill-tab-active-cyan' : 'pill-tab-inactive'}`}
            >
              <Video className="w-3.5 h-3.5" /> 4K Video
            </button>

            <button 
              onClick={() => setDefaultFormats(f => ({ ...f, playlist: !f.playlist }))}
              className={`pill-tab ${defaultFormats.playlist ? 'pill-tab-active-emerald' : 'pill-tab-inactive'}`}
            >
              <ListMusic className="w-3.5 h-3.5" /> DJ Pack
            </button>

            <button 
              onClick={() => setDefaultFormats(f => ({ ...f, shazam: !f.shazam }))}
              className={`pill-tab ${defaultFormats.shazam ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}
            >
              <Radio className="w-3.5 h-3.5" /> Shazam Set
            </button>

            <button 
              onClick={() => setDefaultFormats(f => ({ ...f, suffix: !f.suffix }))}
              className={`pill-tab ${defaultFormats.suffix ? 'pill-tab-active-cyan' : 'pill-tab-inactive'}`}
            >
              <Disc className="w-3.5 h-3.5" /> BPM Suffix (128 BPM)
            </button>
          </div>
        </section>

        {/* Search Results List */}
        {searchResults.length > 0 && (
          <section className="glass-panel p-4 md:p-6 space-y-4">
            <h2 className="text-sm font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
              <Search className="w-4 h-4 text-purple-400" /> Search Results ({searchResults.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {searchResults.map((item, idx) => (
                <div key={idx} className="glass-card p-3 flex gap-3 items-center hover:bg-slate-800/40">
                  <img src={item.thumbnail} alt={item.title} className="w-16 h-16 rounded-lg object-cover bg-slate-950 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-white truncate">{item.title}</h3>
                    <p className="text-[11px] text-slate-400 truncate">{item.uploader || 'YouTube'}</p>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-purple-300 inline-block mt-1">
                      {item.duration || '3:45'}
                    </span>
                  </div>
                  <button 
                    onClick={() => addToQueue(item, item.url || `https://www.youtube.com/watch?v=${item.id}`)}
                    className="p-2.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/50 rounded-xl transition-all active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Download Queue / Tracks List */}
        <section className="glass-panel p-4 md:p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
            <h2 className="text-sm font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Download className="w-4 h-4 text-cyan-400" /> Active Downloads & Queue ({queue.length})
            </h2>
          </div>

          {queue.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Disc className="w-12 h-12 text-slate-700 mx-auto animate-spin" style={{ animationDuration: '8s' }} />
              <p className="text-xs text-slate-500">No active downloads in queue. Paste a YouTube link to extract audio/video.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map(item => {
                const job = activeJobs[item.internalId]
                const status = job?.status_data?.status
                const progressPercent = getProgressPercent(job?.status_data)

                return (
                  <div key={item.internalId} className="glass-card p-4 space-y-3 relative overflow-hidden">
                    <div className="flex gap-3 items-center">
                      <img src={item.thumbnail} alt={item.title} className="w-16 h-16 rounded-xl object-cover bg-slate-950 shrink-0 border border-slate-800" />
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs md:text-sm font-bold text-white truncate">{item.title}</h3>
                        <p className="text-[11px] text-slate-400 truncate">{item.uploader} • {item.duration}</p>
                        
                        {/* Track Quality Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-500/40">
                            MP3 320k
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                            128 BPM
                          </span>
                          {status === 'completed' && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                              <Check className="w-3 h-3 text-cyan-400" /> Complete
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => startSingleDownload(item)}
                          disabled={status === 'queued' || status === 'downloading'}
                          className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-md disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        <button 
                          onClick={() => removeFromQueue(item.internalId)}
                          className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Live Progress Bar */}
                    {job && (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-purple-300">{job.status_data?.progress || 'Processing...'}</span>
                          <span className="text-cyan-300 font-bold">{progressPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-400 transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>

      {/* Mobile Touch Navigation Bottom Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/80 px-6 py-2.5 flex justify-around items-center z-40 md:hidden">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${activeTab === 'home' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
        >
          <Music className="w-5 h-5" /> Home
        </button>

        <button 
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${activeTab === 'search' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
        >
          <Search className="w-5 h-5" /> Search
        </button>

        <button 
          onClick={() => setActiveTab('downloads')}
          className={`flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${activeTab === 'downloads' ? 'text-purple-400 font-bold' : 'text-slate-500'}`}
        >
          <Download className="w-5 h-5" /> Queue ({queue.length})
        </button>

        <button 
          onClick={() => setShowSettings(true)}
          className="flex flex-col items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-300"
        >
          <Settings className="w-5 h-5" /> Settings
        </button>
      </nav>
    </div>
  )
}

export default App
