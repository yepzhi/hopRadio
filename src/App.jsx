import { useState, useEffect, useRef } from 'react';
import { radio } from './audio/RadioEngine';
import { WifiOff, Play, Pause, User } from 'lucide-react';
import AdSpace from './components/AdSpace';
import './App.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isReady, setIsReady] = useState(false); // Radio ready state

  // Offline Mode State
  const [offlineProgress, setOfflineProgress] = useState(0); // 0-100
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [hasOfflineData, setHasOfflineData] = useState(false);
  const [nextTrack, setNextTrack] = useState(null); // "Playing next" indicator


  // PWA State removed

  // Visualizer Ref
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const particles = useRef([]);

  // Listeners Count State
  const [listeners, setListeners] = useState(0);

  // Poll for listener count
  useEffect(() => {
    const fetchListeners = async () => {
      // Don't overwrite metadata if we are offline
      if (isOfflineMode) return;

      try {
        const res = await fetch('https://yepzhi-hopradio-sync.hf.space/');
        if (res.ok) {
          const data = await res.json();
          setListeners(data.listeners || 0);
          // Auto-update track info from server (Metadata Sync)
          if (data.now_playing) {
            setTrack(data.now_playing);
          }
          // Update next track for live mode
          // Update next track for live mode
          if (data.next_playing) {
            setNextTrack(data.next_playing);
          }
        }
      } catch (e) {
        // Silent fail
      }
    };

    fetchListeners();
    const interval = setInterval(fetchListeners, 5000); // Poll every 5s for faster metadata updates
    return () => clearInterval(interval);
  }, [isOfflineMode]);

  // Check for existing offline data on load
  useEffect(() => {
    caches.open('hopradio-v1').then(async (cache) => {
      const keys = await cache.keys();
      if (keys.length > 5) { // Arbitrary check for "enough" songs
        setHasOfflineData(true);
      }
    });
  }, []);

  // Offline Download Logic
  const downloadOfflineTracks = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setOfflineProgress(0);

    try {
      // 1. Get List
      const res = await fetch('https://yepzhi-hopradio-sync.hf.space/api/offline-queue');
      const data = await res.json();
      const queue = data.queue; // Array of { download_url, ... }

      const cache = await caches.open('hopradio-v1');
      let completed = 0;

      const metadata = [];

      // 2. Download & Cache
      // We process sequentially to be nice to the network, or small batches
      for (const item of queue) {
        try {
          // Check if already cached
          const existingMatches = await cache.match(item.download_url);
          if (!existingMatches) {
            const trackRes = await fetch(item.download_url);
            if (trackRes.ok) {
              await cache.put(item.download_url, trackRes);
            }
          }

          metadata.push(item);
          completed++;
          setOfflineProgress(Math.round((completed / queue.length) * 100));
        } catch (e) {
          console.error("Download failed for track", item.title, e);
        }
      }

      // Save Metadata Map
      localStorage.setItem('hopradio-offline-meta', JSON.stringify(metadata));
      setHasOfflineData(true);
      alert("Download Complete! You can now listen offline.");
    } catch (e) {
      alert("Download Failed: " + e.message);
    } finally {
      setIsDownloading(false);
      setOfflineProgress(0);
    }
  };

  const toggleOfflineMode = async () => {
    if (!isOfflineMode) {
      // Switch TO Offline
      const metaStr = localStorage.getItem('hopradio-offline-meta');
      if (!metaStr) return;
      const metadata = JSON.parse(metaStr);

      const cache = await caches.open('hopradio-v1');
      const playlist = [];

      for (const item of metadata) {
        const response = await cache.match(item.download_url);
        if (response) {
          const blob = await response.blob();
          playlist.push({
            ...item,
            blobUrl: URL.createObjectURL(blob)
          });
        }
      }

      if (playlist.length > 0) {
        radio.playOffline(playlist);
        setIsOfflineMode(true);
        setIsLive(false);
        setIsPlaying(true);
      }
    } else {
      // Switch TO Live
      radio.switchToLive();
      setIsOfflineMode(false);
      setIsLive(true);
    }
  };


  // Update Media Session Metadata
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track ? track.title : "hopRadio Live",
        artist: track ? track.artist : `${listeners} listeners`,
        artwork: [{ src: 'https://yepzhi.com/hopRadio/logo.svg', sizes: '512x512', type: 'image/svg+xml' }]
      });
    }
  }, [listeners, track]);


  useEffect(() => {
    // Network Status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // PWA Install Prompt - Removed

    // Initialize Audio Engine (async)
    const initRadio = async () => {
      // Failsafe: Force entry after 5 seconds no matter what
      const failsafeTimer = setTimeout(() => {
        console.warn("RadioEngine init timed out, forcing start");
        setIsReady(true);
      }, 5000);

      try {
        await radio.init();
      } catch (err) {
        console.error("RadioEngine init failed:", err);
      }

      clearTimeout(failsafeTimer);
      setIsReady(true);
    };
    initRadio();

    // Hook radio events
    radio.onTrackChange = (newTrack) => {
      console.log("App: onTrackChange", newTrack);
      setTrack(newTrack);
    };

    // Buffering Events
    radio.onLoadStart = () => {
      setIsBuffering(true);
      setIsLive(false);
    };

    radio.onPlay = () => {
      setIsBuffering(false);
      setIsLive(true);
    };

    // Watchdog Buffering Hook
    radio.onBufferingChange = (state) => {
      setIsBuffering(state);
    };

    // Next Track Update (for "Playing next" indicator)
    radio.onNextTrackUpdate = (next) => {
      setNextTrack(next);
    };

    // Initialize Particles Logic
    const initParticles = (width, height) => {
      const count = 60;
      const newParticles = [];
      for (let i = 0; i < count; i++) {
        newParticles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          baseRadius: Math.random() * 2 + 0.5,
          speedX: (Math.random() - 0.5) * 0.5,
          speedY: (Math.random() - 0.5) * 0.5,
          phase: Math.random() * Math.PI * 2
        });
      }
      particles.current = newParticles;
    };


    // Audio Visualizer Animation Loop
    const renderVisualizer = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;

      // Init particles on first run or resize
      if (particles.current.length === 0) {
        initParticles(width, height);
      }

      // Get Data
      const data = radio.getAudioData();

      // Calculate Bass Energy (reaction factor)
      let bassEnergy = 0;
      if (data) {
        // Sum first 10 bins (low freq)
        for (let i = 0; i < 10; i++) bassEnergy += data[i];
        bassEnergy /= 10; // Average 0-255
        bassEnergy /= 255; // Normalize 0-1
      }

      // Idle movement if no audio
      const reaction = isPlaying && !isBuffering ? bassEnergy : 0.05;

      ctx.clearRect(0, 0, width, height);

      // Draw Particles
      particles.current.forEach(p => {
        // Update Position
        p.x += p.speedX;
        p.y += p.speedY;

        // Wrap around
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // React to Audio
        // Size pulses with bass
        const boost = reaction * 3;
        const radius = p.baseRadius + boost;

        // Color based on intensity
        // Idle: White/Gold faint. Active: Red/Gold bright.
        const alpha = 0.3 + reaction * 0.7;

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`; // Gold stars
        ctx.shadowBlur = reaction * 10;
        ctx.shadowColor = '#ef4444'; // Red glow
        ctx.fill();

        // Draw connections for "Antigravity" web effect
        // Only connect nearby particles if loud enough
        if (reaction > 0.2) {
          particles.current.forEach(p2 => {
            const dx = p.x - p2.x;
            const dy = p.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 50) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(239, 68, 68, ${0.1 + reaction * 0.2})`; // faint red lines
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          });
        }
      });

      animationRef.current = requestAnimationFrame(renderVisualizer);
    };

    renderVisualizer();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);

  const togglePlay = () => {
    // Resume Audio Context (Browser Policy)
    radio.resumeContext();

    if (isPlaying) {
      radio.pause();
    } else {
      radio.play();
    }
    setIsPlaying(!isPlaying);
  };




  return (
    <div className="container min-h-[100dvh] flex flex-col items-center justify-center p-4 md:p-5 pb-16 md:pb-20 relative z-10 w-full max-w-4xl mx-auto">

      {/* Loading Screen - Waking Radio */}
      {!isReady && (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
          <h1 className="logo-text text-5xl font-black tracking-tighter mb-4 text-white">hopRadio</h1>
          <div className="text-red-500 animate-pulse text-lg mb-4">Waking up the radio...</div>
          <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-8"></div>

          {/* Failsafe Button - shows after 3s */}
          <button
            onClick={() => setIsReady(true)}
            className="text-gray-500 text-xs hover:text-white underline animate-in fade-in duration-1000 delay-3000 opacity-0 fill-mode-forwards"
            style={{ animationDelay: '3s', animationFillMode: 'forwards' }}
          >
            Taking too long? Start anyway
          </button>
        </div>
      )}

      {/* Network Warning */}
      {!isOnline && (
        <div className="fixed top-0 left-0 w-full bg-red-900/90 text-white z-50 text-center py-2 text-sm font-bold flex items-center justify-center gap-2 backdrop-blur-md">
          <WifiOff size={16} />
          <span>Connection Lost</span>
        </div>
      )}

      {/* Logo Section */}
      <div className="flex flex-col items-center mb-6 mt-4">
        {/* Logo Container for Relative Positioning */}
        <div className="relative mb-1">
          <h1 className="logo-text text-6xl md:text-8xl font-black tracking-tighter cursor-default">hopRadio</h1>

          {/* Attribution Badge - Positioned under "dio" */}
          <div className="absolute -bottom-3 -right-1 md:-right-2 flex items-center gap-1">
            <span className="text-gray-500 font-bold text-[10px] md:text-xs tracking-wide lowercase">by </span>
            <a href="https://yepzhi.com" target="_blank" rel="noreferrer" className="text-red-500 font-bold text-[10px] md:text-xs hover:text-white transition-all lowercase">yepzhi</a>
          </div>
        </div>

        {/* Slogan (Simplified & Closer) */}
        <div className="flex flex-col items-center gap-0 max-w-lg mx-auto px-4 mt-2 mb-2">
          <h2 className="text-xs md:text-sm text-gray-500 font-normal tracking-tight leading-tight text-center">
            We don't play what you want, we play what you need.
          </h2>
          <p className="text-[10px] md:text-xs font-medium bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 tracking-tight opacity-90 mt-1">
            From New York to H City! Live 24/7. No Ads.
          </p>
        </div>
      </div>

      {/* Live Status & Listeners - REMOVED (Moved below) */}

      {/* Player Card (Glass - Extra Foggy) */}
      <div className="glass-panel backdrop-blur-3xl rounded-[30px] p-6 md:p-8 lg:p-10 w-full md:w-auto min-w-[300px] md:min-w-[450px] flex flex-col items-center gap-4 md:gap-5 mb-1 transition-all duration-500 relative overflow-hidden">

        {/* Real-Time Visualizer (Canvas Background) */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 z-0 h-32">
          <canvas ref={canvasRef} width={450} height={150} className="w-full h-full object-contain"></canvas>
        </div>

        {/* Top Right Status & Logo */}
        <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-1">
          <div className={`text-xs uppercase tracking-[2px] font-bold flex items-center gap-2 ${isLive ? 'text-red-500' : 'text-gray-500'}`}>
            {isPlaying && isLive && <span className="w-2 h-2 rounded-full bg-red-600 live-dot-anim"></span>}
            {isOfflineMode ? 'OFFLINE MODE' : (isPlaying ? (isBuffering ? 'BUFFERING...' : 'LIVE') : '')}
          </div>
          {/* HD Radio Logo - Top Right */}
          <img src="/hopRadio/hd-logo.png" alt="HD Radio" className={`h-5 opacity-90 mt-1 ${isOfflineMode ? 'grayscale brightness-50' : ''}`} />
        </div>


        {/* Play Button Container with Offline Controls */}
        <div className="flex items-center justify-center gap-6 mt-4 relative z-10">

          {/* Offline Prev (Hidden if Online) */}
          {isOfflineMode && (
            <button
              onClick={() => radio.playPrevOffline()}
              className="text-white hover:text-red-400 transition-colors p-3 bg-white/10 rounded-full backdrop-blur-sm active:scale-95"
              title="Previous Song"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
            </button>
          )}

          {/* Main Play Button */}
          <button
            onClick={togglePlay}
            className={`play-btn-glow w-28 h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center text-red-500 hover:text-white transition-colors cursor-pointer relative group ${isBuffering ? 'animate-pulse' : ''}`}
          >
            {/* Spinner Ring if buffering */}
            {isBuffering && isPlaying ? (
              <div className="absolute inset-0 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin"></div>
            ) : null}
            <div className="relative z-10">
              {isPlaying ? (
                isBuffering ? null : <Pause size={48} fill="currentColor" />
              ) : (
                <Play size={48} fill="currentColor" className="ml-2" />
              )}
            </div>
          </button>

          {/* Offline Next (Hidden if Online) */}
          {isOfflineMode && (
            <button
              onClick={() => radio.playNextOffline()}
              className="text-white hover:text-red-400 transition-colors p-3 bg-white/10 rounded-full backdrop-blur-sm active:scale-95"
              title="Next Song"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
            </button>
          )}
        </div>

        {/* Scratch Button Removed (v2.3.8) */}

        {/* Now Playing Info */}
        <div className="text-center min-h-[60px] flex flex-col items-center justify-center z-10">
          {!isPlaying && (
            <div className="text-sm uppercase tracking-[2px] mb-2 font-medium text-gray-500">
              {isOfflineMode ? 'OFFLINE READY' : 'CLICK TO START'}
            </div>
          )}


          <div className={`transition-all duration-500 ${isPlaying ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-2'}`}>
            <h2 className="text-2xl font-bold text-white mb-1 drop-shadow-md">
              {track ? track.title : 'hopRadio Live'}
            </h2>
            <p className="text-gray-400 font-light text-lg mb-1">
              {track ? track.artist : 'HQ Audio Stream'}
            </p>
            {/* Next Playing - Right Aligned & Small */}
            {nextTrack && (
              <div className="w-full flex justify-end mt-1">
                <div className="text-[10px] md:text-xs font-medium text-gray-500 bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm border border-white/5 animate-in fade-in slide-in-from-bottom-1">
                  <span className="text-red-500 font-bold mr-1 uppercase tracking-wider text-[9px]">Next:</span>
                  <span className="text-gray-300 truncate max-w-[150px] inline-block align-bottom">{nextTrack.title}</span>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Listeners Info (Bottom Right of Player) */}
      <div className="w-full md:w-auto min-w-[300px] md:min-w-[450px] flex justify-end px-4 mb-2 md:mb-3">
        <div className="text-gray-500 text-[10px] uppercase tracking-wider font-bold flex items-center space-x-1">
          <User size={10} />
          <span>{listeners} Listening</span>
        </div>
      </div>


      {/* AdSpace */}
      <div className="w-full flex justify-center mb-2 md:mb-4">
        {isOfflineMode ? (
          <div className="text-center text-gray-500 text-xs tracking-widest uppercase py-4">
            Local Playback Active
          </div>
        ) : (
          <AdSpace />
        )}
      </div>


      {/* Cross Link: Hub */}
      <div className="w-full flex justify-center mb-4 pointer-events-auto z-30">
        <a href="https://yepzhi.com/SERGRadio/" className="group relative px-6 py-2.5 bg-black/40 backdrop-blur-xl border border-blue-900/50 rounded-full flex items-center gap-3 hover:bg-black/80 transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(59,130,246,0.3)]">
          <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold group-hover:text-gray-300">Listen</span>
          <h1 className="logo-base text-xl font-black tracking-tight mb-0 leading-none">
            <span className="text-blue-700 tracking-tighter serg-blue-text">SERG</span><span className="radio-gradient-text">Radio</span>
          </h1>
          <svg className="w-5 h-5 text-gray-400 group-hover:text-white transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
        </a>
      </div>

      {/* Flex Column Container for Bottom Elements to avoid cramping */}
      <div className="w-full max-w-[450px] flex flex-col items-center gap-4 mt-2 pb-6 z-20 pointer-events-auto">

        {/* Offline Controls */}
        <div className="flex items-center gap-2">
          {isDownloading ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900/80 border border-gray-700 text-xs font-mono text-green-400">
              <span>Downloading {offlineProgress}%</span>
            </div>
          ) : (
            <>
              <button
                onClick={downloadOfflineTracks}
                className="px-4 py-2 rounded-full bg-black/40 border border-gray-700 hover:bg-gray-800 text-gray-400 hover:text-white transition-all text-[10px] tracking-wide font-bold backdrop-blur-md"
              >
                {hasOfflineData ? 'Update Offline' : 'Download 1-hour offline'}
              </button>

              {hasOfflineData && (
                <button
                  onClick={toggleOfflineMode}
                  className={`px-4 py-2 rounded-full border transition-all text-[10px] uppercase tracking-wider font-bold backdrop-blur-md ${isOfflineMode ? 'bg-red-600 border-red-500 text-white' : 'bg-black/40 border-gray-700 text-gray-400 hover:text-white'}`}
                >
                  {isOfflineMode ? 'Go Live' : 'Go Offline'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Invest Button */}
        <a href="https://yepzhi.com" target="_blank" rel="noreferrer" className="w-full max-w-[300px] px-4 py-2 rounded-full bg-gradient-to-br from-gray-900 to-black border border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700 transition-all text-[10px] font-medium block text-center leading-tight shadow-lg backdrop-blur-md">
          Do you like this? 💙 <span className="font-bold text-gray-400 group-hover:text-white">Lets make this a real radio 📡</span>
        </a>

        {/* Footer info inline (mobile friendly) */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-gray-500 text-[10px] tracking-wide font-medium mr-1">Created by</span>
          <a href="https://yepzhi.com" target="_blank" rel="noreferrer" className="px-3 py-1 rounded-full bg-gradient-to-br from-gray-900 to-black border border-gray-800 text-red-500 hover:text-red-400 hover:border-red-900 transition-all font-bold shadow-sm text-[10px]">
            @yepzhi
          </a>
          <div className="text-gray-600 text-[9px] font-mono tracking-widest opacity-80 ml-2">
            v2.6.0
          </div>
        </div>

      </div>

    </div>

  );
}

export default App;
