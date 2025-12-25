import { useState, useEffect, useRef } from 'react';
import { radio } from './audio/RadioEngine';
import { WifiOff, Download } from 'lucide-react';
import AdSpace from './components/AdSpace';
import './App.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Visualizer Ref
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

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
      // Even if we don't have the prompt event yet, we want to show the banner 
      // so user can click it and get instructions (iOS) or prompt (if ready)
      setShowInstallBanner(true);
    }

    // Initialize Audio Engine
    radio.init();

    // ... (rest of useEffect)

    return () => {
      // ... (cleanup)
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
    // Mock download action
    alert("Starting download: hopRadio Mock Mix (84MB)...");
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
        {/* Placed behind content but inside glass card for depth */}
        <div className="absolute inset-0 pointer-events-none opacity-60 z-0">
          <canvas ref={canvasRef} width={450} height={100} className="w-full h-full object-cover"></canvas>
        </div>

        {/* Live Status - Upper Right */}
        <div className={`absolute top-6 right-6 text-xs uppercase tracking-[2px] font-bold flex items-center gap-2 z-20 ${isLive ? 'text-red-500' : 'text-gray-500'}`}>
          {isPlaying && isLive && <span className="w-2 h-2 rounded-full bg-red-600 live-dot-anim"></span>}
          {isPlaying ? (isLive ? 'LIVE' : 'BUFFERING...') : ''}
        </div>

        {/* Play Button */}
        <button
          onClick={togglePlay}
          className="play-btn-glow w-28 h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center text-red-500 hover:text-gold-400 text-5xl transition-colors cursor-pointer relative group mt-4 z-10"
        >
          <span className="ml-2">{isPlaying ? '⏸' : '▶'}</span>
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
        <div className="w-full max-w-[550px] mb-6 bg-red-900/10 backdrop-blur-md border border-red-500/20 rounded-2xl p-4 md:px-6 md:py-4 flex flex-col md:flex-row items-center gap-4 shadow-lg animate-pulse-slow">
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
      <div className="w-full flex justify-center mb-6">
        <AdSpace />
      </div>

      {/* Offline Mix Button (New Feature) */}
      <button
        onClick={handleDownload}
        className="glass-panel px-8 py-4 rounded-full flex items-center gap-3 text-sm font-medium hover:bg-white/5 hover:border-red-500/30 hover:text-white transition-all group"
      >
        <Download size={18} className="text-gray-400 group-hover:text-red-400 transition-colors" />
        <span className="text-gray-300">Download Offline Mix (84MB)</span>
      </button>

      {/* Footer */}
      <div className="absolute bottom-6 right-8 text-xs text-gray-600 font-medium">
        Created by <a href="https://yepzhi.com" target="_blank" rel="noreferrer" className="text-red-600 hover:text-red-400 transition-colors">@yepzhi</a>
      </div>

    </div>
  );
}

export default App;
