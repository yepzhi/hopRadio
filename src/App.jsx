import { useState, useEffect } from 'react';
import { radio } from './audio/RadioEngine';
import { Play, Pause, Download, WifiOff } from 'lucide-react';
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
      // Check if already in standalone mode
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if (!isStandalone) {
        setShowInstallBanner(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Initialize Audio Engine
    radio.init();

    radio.onTrackChange = (newTrack) => {
      setTrack(newTrack);
    };

    setTimeout(() => setIsLive(true), 1500);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      radio.pause();
    } else {
      radio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
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
      // Manual instructions fallback
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
      <div className="text-center mb-4">
        <h1 className="logo-text text-6xl md:text-8xl font-black tracking-tighter mb-4">hopRadio</h1>
        <div className="text-gray-400 font-light tracking-widest text-sm md:text-base max-w-lg mx-auto mb-12">
          We don't play what you want, we play what you need
        </div>
      </div>

      {/* Player Card (Glass) */}
      <div className="glass-panel rounded-[30px] p-10 md:p-14 w-full md:w-auto min-w-[300px] md:min-w-[450px] flex flex-col items-center gap-8 mb-10 transition-all duration-500">

        {/* Play Button */}
        <button
          onClick={togglePlay}
          className="play-btn-glow w-32 h-32 md:w-36 md:h-36 rounded-full flex items-center justify-center text-red-500 hover:text-gold-400 text-5xl transition-colors cursor-pointer relative group"
        >
          <span className="ml-2">{isPlaying ? '⏸' : '▶'}</span>
        </button>

        {/* Now Playing Info */}
        <div className="text-center min-h-[80px] flex flex-col items-center justify-center">
          <div className={`text-sm uppercase tracking-[2px] mb-2 font-medium flex items-center gap-2 ${isLive ? 'text-red-500' : 'text-gray-500'}`}>
            {isPlaying && isLive && <span className="w-2 h-2 rounded-full bg-red-600 live-dot-anim"></span>}
            {isPlaying ? (isLive ? 'ON AIR' : 'BUFFERING...') : 'CLICK TO START'}
          </div>

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
        <div className="w-full max-w-[550px] mb-8 bg-red-900/10 backdrop-blur-md border border-red-500/20 rounded-2xl p-4 md:px-6 md:py-4 flex flex-col md:flex-row items-center gap-4 shadow-lg animate-pulse-slow">
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

      {/* Offline Mix Button */}
      <button
        onClick={handleDownload}
        className="glass-panel px-8 py-4 rounded-full flex items-center gap-3 text-sm font-medium hover:bg-white/5 hover:border-red-500/30 hover:text-white transition-all group"
      >
        <Download size={18} className="text-gray-400 group-hover:text-red-400 transition-colors" />
        <span className="text-gray-300">Download Offline Mix (84MB)</span>
      </button>

      {/* Footer */}
      <div className="absolute bottom-6 right-8 text-xs text-gray-600 font-medium">
        Developed by <a href="https://yepzhi.com" target="_blank" rel="noreferrer" className="text-red-600 hover:text-red-400 transition-colors">@yepzhi</a>
      </div>

    </div>
  );
}

export default App;
