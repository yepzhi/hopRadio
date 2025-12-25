import { useState, useEffect, useRef } from 'react';
import { radio } from './audio/RadioEngine';
import { WifiOff, Download, Play, Pause } from 'lucide-react';
import AdSpace from './components/AdSpace';
import './App.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Download State
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Visualizer Ref
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const particles = useRef([]);

  useEffect(() => {
    // Network Status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // PWA Install Prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Initial check for PWA button visibility (Legacy behavior)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!isStandalone) {
      setShowInstallBanner(true);
    }

    // Initialize Audio Engine
    radio.init();

    radio.onTrackChange = (newTrack) => {
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

    // Visualizer Loop
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
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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

  const handleDownload = () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress(0);

    // Simulate Download
    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsDownloading(false);
            setDownloadProgress(0);
            alert("Download Completed: hopRadio Mix saved!");
          }, 500);
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      // Manual instructions for iOS or if prompt unavailable
      alert('Para instalar:\n\niOS: Toca el botón Compartir y selecciona "Agregar a pantalla de inicio"\n\nAndroid: Toca el menú (⋮) y selecciona "Instalar app"');
    }
  };

  return (
    <div className="container min-h-[100dvh] flex flex-col items-center justify-center p-5 pb-20 relative z-10 w-full max-w-4xl mx-auto">

      {/* Network Warning */}
      {!isOnline && (
        <div className="fixed top-0 left-0 w-full bg-red-900/90 text-white z-50 text-center py-2 text-sm font-bold flex items-center justify-center gap-2 backdrop-blur-md">
          <WifiOff size={16} />
          <span>Connection Lost</span>
        </div>
      )}

      {/* Logo Section */}
      <div className="text-center mb-2">
        <h1 className="logo-text text-6xl md:text-8xl font-black tracking-tighter mb-2">hopRadio</h1>
        <div className="text-gray-400 font-light tracking-widest text-sm md:text-base max-w-lg mx-auto mb-6">
          We don't play what you want, we play what you need
        </div>
      </div>

      {/* Player Card (Glass) */}
      <div className="glass-panel rounded-[30px] p-8 md:p-10 w-full md:w-auto min-w-[300px] md:min-w-[450px] flex flex-col items-center gap-5 mb-6 transition-all duration-500 relative overflow-hidden">

        {/* Real-Time Visualizer (Canvas Background) */}
        {/* Centered Vertically */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 z-0 h-32">
          <canvas ref={canvasRef} width={450} height={150} className="w-full h-full object-contain"></canvas>
        </div>

        {/* Top Left Status / Countdown */}
        <div className="absolute top-6 left-6 z-20 flex flex-col items-start">
          {downloadProgress === 100 && (
            <div className="text-xs font-bold tracking-[2px] text-green-400 animate-pulse">
              OFFLINE MODE <br />
              <span className="text-white text-base">59:59 REMAINING</span>
            </div>
          )}
        </div>

        {/* Live Status - Upper Right */}
        <div className={`absolute top-6 right-6 text-xs uppercase tracking-[2px] font-bold flex items-center gap-2 z-20 ${isLive ? 'text-red-500' : 'text-gray-500'}`}>
          {isPlaying && isLive && <span className="w-2 h-2 rounded-full bg-red-600 live-dot-anim"></span>}
          {isPlaying ? (isBuffering ? 'BUFFERING...' : (downloadProgress === 100 ? <span className="text-green-500">OFFLINE</span> : 'LIVE')) : ''}
        </div>

        {/* Play Button */}
        <button
          onClick={togglePlay}
          className={`play-btn-glow w-28 h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center text-red-500 hover:text-gold-400 transition-colors cursor-pointer relative group mt-4 z-10 ${isBuffering ? 'animate-pulse' : ''}`}
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

        {/* Now Playing Info */}
        <div className="text-center min-h-[60px] flex flex-col items-center justify-center z-10">

          {/* Status Text (Click to Start) - Only show if NOT playing */}
          {!isPlaying && (
            <div className="text-sm uppercase tracking-[2px] mb-2 font-medium text-gray-500">
              CLICK TO START
            </div>
          )}

          <div className={`transition-all duration-500 ${isPlaying ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-2'}`}>
            <h2 className="text-2xl font-bold text-white mb-1 drop-shadow-md">
              {track ? track.title : 'hopRadio Live'}
            </h2>
            <p className="text-gray-400 font-light text-lg">
              {track ? track.artist : 'HQ Audio Stream'}
            </p>
          </div>
        </div>
      </div>

      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div className="w-full max-w-[550px] mb-1.5 bg-red-900/10 backdrop-blur-md border border-red-500/20 rounded-2xl p-4 md:px-6 md:py-4 flex flex-col md:flex-row items-center gap-4 shadow-lg animate-pulse-slow">
          <div className="text-2xl filter drop-shadow-[0_0_10px_rgba(220,20,60,0.6)]">📱</div>
          <div className="flex-1 text-center md:text-left">
            <div className="font-bold text-sm text-white mb-0.5">Instala la App en tu pantalla de inicio</div>
            <div className="text-xs text-gray-400">Para que la música siga sonando al salir de la App</div>
          </div>
          <button
            onClick={handleInstallClick}
            className="bg-gradient-to-br from-red-600/40 to-red-800/40 border border-red-500/50 hover:from-red-600/60 hover:to-red-800/60 text-white text-sm font-bold py-2 px-5 rounded-full transition-all shadow-[0_4px_12px_rgba(220,20,60,0.3)] hover:-translate-y-0.5"
          >
            Instalar
          </button>
        </div>
      )}

      {/* AdSpace */}
      <div className="w-full flex justify-center mb-1.5">
        <AdSpace />
      </div>

      {/* Offline Mix Button / Progress */}
      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="glass-panel px-8 py-3 rounded-full flex items-center gap-3 text-sm font-medium hover:bg-white/5 hover:border-red-500/30 hover:text-white transition-all group relative overflow-hidden mb-8"
      >
        {isDownloading ? (
          <>
            <div className="absolute inset-0 bg-red-900/40 transition-all duration-100" style={{ width: `${downloadProgress}%` }}></div>
            <span className="relative z-10">{downloadProgress === 100 ? 'Offline Ready' : `Downloading Mix... ${downloadProgress}%`}</span>
          </>
        ) : (
          <>
            <Download size={18} className="text-gray-400 group-hover:text-red-400 transition-colors" />
            <span className="text-gray-300">Download Offline Mix (84MB)</span>
          </>
        )}
      </button>

      {/* Footer */}
      <div className="absolute bottom-2 w-full flex flex-col md:flex-row justify-between items-end px-8 z-20 pointer-events-none gap-2 md:gap-0">
        <div className="pointer-events-auto">
          <a href="https://yepzhi.com" target="_blank" rel="noreferrer" className="text-gray-600 hover:text-gray-400 transition-colors text-xs font-medium block max-w-md text-left leading-tight">
            Do you like this? 💙 <span className="text-red-700 hover:text-red-500 font-normal transition-colors">Invest in this project, make this a real radio station. click here to know more.</span>
          </a>
        </div>
        <div className="pointer-events-auto">
          <div className="text-gray-600 text-[10px] tracking-wide">
            Created by <a href="https://yepzhi.com" target="_blank" rel="noreferrer" className="text-red-700 hover:text-red-500 transition-colors font-bold">@yepzhi</a>
          </div>
        </div>
      </div>

    </div>
  );
}

export default App;
