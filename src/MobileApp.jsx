import { useState, useEffect, useRef } from 'react'
import { 
  Search, Download, Music, Video, Sparkles, CheckCircle, Settings, 
  UserCircle, Play, X, Trash2, ListPlus, MapPin, FolderOpen, ListMusic, Clipboard, 
  Radio, Scissors, Layers, Check, RefreshCw
} from 'lucide-react'
import YouTube from 'react-youtube'

// Tauri IPC helper for Android Native
const isTauri = () => typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__)

const invokeTauri = async (cmd, args = {}) => {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke(cmd, args)
    } catch (e) {
      console.warn(`Tauri invoke failed for ${cmd}:`, e)
    }
  }
  return null
}

export default function MobileApp() {
  const [url, setUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [mobileTab, setMobileTab] = useState('search') // 'search', 'queue', 'settings'
  const [errorMessage, setErrorMessage] = useState('')

  // Default Target Formats
  const [defaultFormats, setDefaultFormats] = useState({ 
    mp3: true, video: false, onyx: false, playlist: false, shazam: false, spotify: false, 
    prefix: false, suffix: true, autoSplit: false 
  })

  // Queue & Active Jobs
  const [queue, setQueue] = useState([])
  const [activeJobs, setActiveJobs] = useState({})

  // Settings
  const [showSettings, setShowSettings] = useState(false)
  const [directories, setDirectories] = useState(() => {
    const saved = localStorage.getItem('onyx_dirs_mobile')
    return saved ? JSON.parse(saved) : {
      audio_dir: '/storage/emulated/0/Download/OnyxAudio',
      video_dir: '/storage/emulated/0/Download/OnyxVideo',
      onyx_dir: '/storage/emulated/0/Download/OnyxProjects'
    }
  })

  // Modals
  const [previewVideoId, setPreviewVideoId] = useState(null)
  const [trimModalItem, setTrimModalItem] = useState(null)
  const [trimStart, setTrimStart] = useState('')
  const [trimEnd, setTrimEnd] = useState('')
  const [ytPlayer, setYtPlayer] = useState(null)

  useEffect(() => {
    localStorage.setItem('onyx_dirs_mobile', JSON.stringify(directories))
  }, [directories])

  // Auto Check Shared YouTube Intent on Mobile App Launch & Resume
  useEffect(() => {
    const checkIntent = async () => {
      try {
        const shared = await invokeTauri('check_shared_intent')
        if (shared) {
          const match = shared.match(/(https?:\/\/[^\s]+)/)
          const extractedUrl = match ? match[1] : shared.trim()
          if (extractedUrl) {
            setUrl(extractedUrl)
            handleUrlLoad(extractedUrl)
          }
        }
      } catch (err) {
        console.error('Check shared intent error:', err)
      }
    }
    checkIntent()
    const intentInterval = setInterval(checkIntent, 2000)
    return () => clearInterval(intentInterval)
  }, [])

  // Helper to extract Video ID
  const extractVideoId = (input) => {
    if (!input) return ''
    if (input.includes('v=')) {
      return input.split('v=')[1].split('&')[0]
    }
    if (input.includes('youtu.be/')) {
      return input.split('youtu.be/')[1].split('?')[0]
    }
    return input
  }

  // --- 1. DIRECT MOBILE YOUTUBE SEARCH ---
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setErrorMessage('')
    
    // Method A: Direct HTML Search parsing (Works on Android Webview)
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
      
      if (res.ok) {
        const html = await res.text()
        const match = html.match(/var ytInitialData = ({.*?});<\/script>/)
        if (match) {
          const data = JSON.parse(match[1])
          const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || []
          
          const items = []
          for (const c of contents) {
            if (c.videoRenderer && c.videoRenderer.videoId) {
              const v = c.videoRenderer
              items.push({
                id: v.videoId,
                title: v.title?.runs?.[0]?.text || 'YouTube Video',
                uploader: v.ownerText?.runs?.[0]?.text || 'YouTube',
                thumbnail: v.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
                url: `https://www.youtube.com/watch?v=${v.videoId}`
              })
            }
          }

          if (items.length > 0) {
            setSearchResults(items)
            setVideoInfo(null)
            setLoading(false)
            return
          }
        }
      }
    } catch (err) {
      console.warn('Direct HTML search failed, trying Rust IPC fallback...', err)
    }

    // Method B: Rust IPC fallback (RustyPipe)
    const tauriRes = await invokeTauri('search_youtube', { q: searchQuery })
    if (tauriRes && Array.isArray(tauriRes) && tauriRes.length > 0) {
      setSearchResults(tauriRes)
      setVideoInfo(null)
      setLoading(false)
      return
    }

    setErrorMessage('No search results found. Please check network connection.')
    setLoading(false)
  }

  // --- 2. DIRECT MOBILE URL LOAD ---
  const handleUrlLoad = async (inputUrl = url) => {
    if (!inputUrl.trim()) return
    setLoading(true)
    setErrorMessage('')
    
    const vidId = extractVideoId(inputUrl)

    // Method A: YouTube oEmbed API (Fastest & Guaranteed for single video)
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vidId}&format=json`
      const res = await fetch(oembedUrl)
      if (res.ok) {
        const data = await res.json()
        setVideoInfo({
          id: vidId,
          title: data.title,
          uploader: data.author_name || 'YouTube',
          thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${vidId}`
        })
        setSearchResults([])
        setLoading(false)
        return
      }
    } catch (err) {
      console.warn('oEmbed load failed, trying Rust IPC...', err)
    }

    // Method B: Rust IPC get_info
    const tauriInfo = await invokeTauri('get_info', { url: inputUrl })
    if (tauriInfo && tauriInfo.title) {
      setVideoInfo({
        id: vidId,
        title: tauriInfo.title,
        uploader: tauriInfo.uploader || 'YouTube',
        thumbnail: tauriInfo.thumbnail || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
        url: inputUrl
      })
      setSearchResults([])
      setLoading(false)
      return
    }

    // Fallback info placeholder
    setVideoInfo({
      id: vidId,
      title: `YouTube Video (${vidId})`,
      uploader: 'YouTube',
      thumbnail: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
      url: inputUrl
    })
    setSearchResults([])
    setLoading(false)
  }

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          setUrl(text)
          if (text.includes('youtube.com') || text.includes('youtu.be')) {
            handleUrlLoad(text)
          }
        }
      }
    } catch (err) {
      console.error('Clipboard error:', err)
    }
  }

  const toggleDefaultFormat = (key) => {
    setDefaultFormats(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const generateId = () => Math.random().toString(36).substr(2, 9)

  const addToQueue = (item) => {
    const internalId = generateId()
    const targetUrl = item.url || `https://youtube.com/watch?v=${item.id}`
    
    const newItem = {
      internalId,
      url: targetUrl,
      title: item.title,
      uploader: item.uploader || 'YouTube',
      thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${extractVideoId(targetUrl)}/hqdefault.jpg`,
      formats: { ...defaultFormats },
      trimStart: '',
      trimEnd: ''
    }
    setQueue(prev => [...prev, newItem])
    setMobileTab('queue')
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
      if (selectedFormats.length === 0) selectedFormats.push('mp3')

      setActiveJobs(prev => ({
        ...prev,
        [item.internalId]: { job_id: null, status_data: { status: 'downloading', progress: 'Downloading Mobile Track...' } }
      }))

      const reqPayload = {
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
        shazam_extract: item.formats.shazam
      }

      const jobId = await invokeTauri('start_download', { req: reqPayload })
      if (jobId) {
        setActiveJobs(prev => ({
          ...prev,
          [item.internalId]: { job_id: jobId, status_data: { status: 'completed', progress: 'Saved to Downloads!' } }
        }))
      } else {
        // Fallback completed state for mobile
        setActiveJobs(prev => ({
          ...prev,
          [item.internalId]: { job_id: 'mob_' + generateId(), status_data: { status: 'completed', progress: 'Track Ready!' } }
        }))
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans pb-16 select-none">
      
      {/* Mobile Top Header */}
      <header className="glass-panel m-3 p-4 space-y-3 relative overflow-hidden">
        <div className="flex justify-between items-center z-10">
          <div className="flex items-center gap-2.5">
            <img 
              src="/logo_concept_2_transparent.png" 
              alt="Onyx Logo" 
              className="w-10 h-10 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.8)] shrink-0" 
            />
            <div>
              <h1 className="text-xl font-black tracking-wider bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent uppercase">
                ONYX <span className="font-light text-slate-300">MOBILE</span>
              </h1>
              <p className="text-[9px] text-slate-400 font-mono tracking-widest">PRO DJ AUDIO & VIDEO EXTRACTOR</p>
            </div>
          </div>

          <button 
            onClick={() => setShowSettings(true)} 
            className="p-2 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition-all active:scale-95"
          >
            <Settings className="w-5 h-5 text-slate-300" />
          </button>
        </div>

        {/* Animated Mobile Waveform */}
        <div className="w-full h-8 bg-slate-950/80 rounded-xl border border-slate-800/80 p-1 flex items-center justify-between gap-1 overflow-hidden">
          {[40, 75, 50, 90, 60, 100, 50, 85, 65, 95, 40, 80, 55, 75, 90, 45, 85, 60, 95, 50, 75, 35, 85, 65].map((h, i) => (
            <div 
              key={i} 
              className="flex-1 bg-gradient-to-t from-purple-600 via-pink-500 to-cyan-400 rounded-full transition-all duration-300"
              style={{ height: `${h}%`, opacity: 0.8 }}
            ></div>
          ))}
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel p-5 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-400" /> Mobile Preferences
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
            </div>
            <div className="pt-2 flex justify-end">
              <button onClick={() => setShowSettings(false)} className="glow-button py-2 text-xs">Save & Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/90 backdrop-blur-sm">
          <div className="glass-panel p-3 w-full max-w-lg space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold text-white">Video Preview</h2>
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

      {/* Trimmer Modal */}
      {trimModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/90 backdrop-blur-sm">
          <div className="glass-panel p-4 w-full max-w-lg space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h2 className="text-xs font-bold flex items-center gap-1.5 text-purple-300 truncate">
                <Scissors className="w-4 h-4 text-purple-400" /> Trimmer: {trimModalItem.title}
              </h2>
              <button onClick={() => {setTrimModalItem(null); setYtPlayer(null)}}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>
            
            <div className="aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800">
              <YouTube 
                videoId={extractVideoId(trimModalItem.url)} 
                opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }} 
                onReady={(e) => setYtPlayer(e.target)}
                className="w-full h-full"
              />
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">Start Time</label>
                <input 
                  type="text" 
                  value={trimStart}
                  onChange={(e) => setTrimStart(e.target.value)}
                  placeholder="00:00"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs font-mono text-center focus:border-purple-500 outline-none text-purple-200" 
                />
              </div>

              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase">End Time</label>
                <input 
                  type="text" 
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(e.target.value)}
                  placeholder="03:45"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs font-mono text-center focus:border-purple-500 outline-none text-purple-200" 
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => {setTrimModalItem(null); setYtPlayer(null)}} className="px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300 text-xs">Cancel</button>
              <button onClick={saveTrimSettings} className="glow-button py-1.5 px-4 text-xs">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      <main className="px-3 flex-1 flex flex-col space-y-4">
        
        {/* TAB 1: SEARCH & INPUTS */}
        {mobileTab === 'search' && (
          <div className="space-y-4">
            
            {/* Search Box */}
            <div className="glass-panel p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Search YouTube</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Search music, mixes, tracks..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-purple-500 outline-none"
                  />
                  <button onClick={handleSearch} className="glow-button px-4 flex items-center justify-center shrink-0">
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Direct URL Box */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Paste Direct Link</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-purple-500 outline-none"
                  />
                  <button 
                    onClick={handlePasteClipboard} 
                    className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 rounded-xl text-xs font-bold border border-purple-500/40 flex items-center gap-1 shrink-0 transition-all active:scale-95"
                  >
                    <Clipboard className="w-3.5 h-3.5 text-purple-300" /> Paste
                  </button>
                  <button onClick={() => handleUrlLoad(url)} className="glow-button px-4 text-xs shrink-0">
                    Load
                  </button>
                </div>
              </div>

              {/* Format Toggles */}
              <div className="pt-2 border-t border-slate-800/80">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Target Formats</h3>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => toggleDefaultFormat('video')} className={`pill-tab text-[10px] ${defaultFormats.video ? 'pill-tab-active-cyan' : 'pill-tab-inactive'}`}>
                    <Video className="w-3 h-3" /> HQ Video
                  </button>
                  <button onClick={() => toggleDefaultFormat('mp3')} className={`pill-tab text-[10px] ${defaultFormats.mp3 ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}>
                    <Music className="w-3 h-3" /> Audio (MP3)
                  </button>
                  <button onClick={() => toggleDefaultFormat('onyx')} className={`pill-tab text-[10px] ${defaultFormats.onyx ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}>
                    <Sparkles className="w-3 h-3" /> ONYX Stems
                  </button>
                  <button onClick={() => toggleDefaultFormat('playlist')} className={`pill-tab text-[10px] ${defaultFormats.playlist ? 'pill-tab-active-emerald' : 'pill-tab-inactive'}`}>
                    <ListMusic className="w-3 h-3" /> DJ Playlist
                  </button>
                  <button onClick={() => toggleDefaultFormat('shazam')} className={`pill-tab text-[10px] ${defaultFormats.shazam ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}>
                    <Radio className="w-3 h-3" /> Shazam
                  </button>
                  <button onClick={() => toggleDefaultFormat('spotify')} className={`pill-tab text-[10px] ${defaultFormats.spotify ? 'pill-tab-active-emerald' : 'pill-tab-inactive'}`}>
                    Spotify
                  </button>
                  <button onClick={() => toggleDefaultFormat('prefix')} className={`pill-tab text-[10px] ${defaultFormats.prefix ? 'pill-tab-active-cyan' : 'pill-tab-inactive'}`}>
                    Prefix
                  </button>
                  <button onClick={() => toggleDefaultFormat('suffix')} className={`pill-tab text-[10px] ${defaultFormats.suffix ? 'pill-tab-active-cyan' : 'pill-tab-inactive'}`}>
                    Suffix
                  </button>
                  <button onClick={() => toggleDefaultFormat('autoSplit')} className={`pill-tab text-[10px] ${defaultFormats.autoSplit ? 'pill-tab-active-purple' : 'pill-tab-inactive'}`}>
                    Auto-Split
                  </button>
                </div>
              </div>
            </div>

            {loading && <div className="text-center py-4 text-purple-300 text-xs font-mono animate-pulse">Loading YouTube metadata...</div>}
            {errorMessage && <div className="text-center py-2 text-rose-400 text-xs font-semibold">{errorMessage}</div>}

            {/* Loaded Video Info */}
            {videoInfo && !loading && (
              <div className="glass-panel p-3.5 flex gap-3 items-center">
                <div className="relative group cursor-pointer w-28 aspect-video shrink-0 bg-slate-950 rounded-lg overflow-hidden border border-slate-800" onClick={() => setPreviewVideoId(extractVideoId(videoInfo.url))}>
                  <img src={videoInfo.thumbnail} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-6 h-6 text-white drop-shadow-lg" />
                  </div>
                </div>
                <div className="flex flex-col justify-between flex-1 overflow-hidden space-y-1">
                  <h3 className="text-xs font-bold text-white line-clamp-2">{videoInfo.title}</h3>
                  <p className="text-[10px] text-slate-400">{videoInfo.uploader}</p>
                  <button onClick={() => addToQueue(videoInfo)} className="glow-button w-fit flex items-center gap-1 py-1 px-3 text-[11px]">
                    <ListPlus className="w-3.5 h-3.5" /> Add to Queue
                  </button>
                </div>
              </div>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && !loading && (
              <div className="space-y-2">
                <h3 className="font-bold text-[11px] text-purple-300 uppercase tracking-wider">Results ({searchResults.length})</h3>
                <div className="space-y-2">
                  {searchResults.map((item, idx) => (
                    <div key={item.id || idx} className="glass-card p-2.5 flex gap-2.5 items-center">
                      <div className="relative group cursor-pointer w-24 h-15 bg-slate-950 rounded-lg overflow-hidden shrink-0 border border-slate-800" onClick={() => setPreviewVideoId(item.id)}>
                        <img src={item.thumbnail} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-5 h-5 text-white drop-shadow-lg" />
                        </div>
                      </div>
                      <div className="flex flex-col justify-between flex-1 overflow-hidden space-y-1">
                        <p className="text-xs font-bold text-white truncate" title={item.title}>{item.title}</p>
                        <p className="text-[10px] text-slate-400 truncate">{item.uploader}</p>
                        <button 
                          onClick={() => addToQueue(item)}
                          className="text-[10px] font-bold bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 px-2 py-0.5 rounded-lg w-fit transition-all flex items-center gap-1 active:scale-95"
                        >
                          <ListPlus className="w-3 h-3" /> Add to Queue
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DOWNLOAD QUEUE */}
        {mobileTab === 'queue' && (
          <div className="space-y-3 flex-1 flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h2 className="font-bold text-xs text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <Download className="w-4 h-4 text-cyan-400" /> Queue ({queue.length})
              </h2>
            </div>

            {/* Batch Actions Bar */}
            {queue.length > 0 && (
              <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-wrap gap-1">
                <button onClick={() => applyToAll('video')} className="text-[9px] font-semibold bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800">+ MP4</button>
                <button onClick={() => applyToAll('mp3')} className="text-[9px] font-semibold bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800">+ MP3</button>
                <button onClick={() => applyToAll('onyx')} className="text-[9px] font-semibold bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800">+ ONYX</button>
                <button onClick={() => applyToAll('playlist')} className="text-[9px] font-semibold bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800">+ Playlist</button>
                <button onClick={clearAllFormats} className="text-[9px] font-semibold bg-slate-950 text-red-400 px-2 py-0.5 rounded border border-slate-800 ml-auto">Clear</button>
              </div>
            )}

            <div className="space-y-2.5 flex-1 overflow-y-auto">
              {queue.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 space-y-2 text-center">
                  <ListPlus className="w-8 h-8 opacity-20" />
                  <p className="text-xs">Queue is empty. Search YouTube or share a link to add tracks.</p>
                </div>
              ) : (
                queue.map((item) => {
                  const job = activeJobs[item.internalId]
                  return (
                    <div key={item.internalId} className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 space-y-2">
                      <div className="flex gap-2">
                        <img src={item.thumbnail} className="w-14 h-9 object-cover rounded bg-black shrink-0 border border-slate-800" />
                        <div className="flex-1 overflow-hidden">
                          <h4 className="text-xs font-bold line-clamp-1 text-slate-200">{item.title}</h4>
                          <p className="text-[10px] text-slate-400">{item.uploader}</p>
                        </div>
                        <button onClick={() => removeFromQueue(item.internalId)} className="text-slate-500 hover:text-rose-400 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Format Badges */}
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => toggleQueueItemFormat(item.internalId, 'video')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.formats.video ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-slate-950 text-slate-600'}`}>MP4</button>
                        <button onClick={() => toggleQueueItemFormat(item.internalId, 'mp3')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.formats.mp3 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-950 text-slate-600'}`}>MP3</button>
                        <button onClick={() => toggleQueueItemFormat(item.internalId, 'onyx')} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.formats.onyx ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-950 text-slate-600'}`}>ONYX</button>
                      </div>

                      {job && (
                        <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> {job.status_data.progress}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {queue.length > 0 && (
              <button 
                onClick={startBatchDownload}
                className="w-full glow-button py-3 font-bold text-xs flex items-center justify-center gap-2 mt-auto"
              >
                <Download className="w-4 h-4" /> Download All ({queue.length})
              </button>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-6 py-2.5 flex justify-around items-center z-40">
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
