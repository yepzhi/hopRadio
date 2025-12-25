import { useState, useEffect } from 'react';
import { radio } from './audio/RadioEngine';
import { Play, Pause, SkipForward, Radio, Zap, Activity, WifiOff } from 'lucide-react';
import AdSpace from './components/AdSpace';
import './App.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState(null);
  const [volume, setVolume] = useState(0.8);
  const [isLive, setIsLive] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Network Status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initialize Audio Engine
    radio.init();

    // Subscribe to engine events
    radio.onTrackChange = (newTrack) => {
      setTrack(newTrack);
    };

    // Simulated "Live" connection checking
    setTimeout(() => setIsLive(true), 1500);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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

  const skip = () => {
    radio.next();
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    radio.setVolume(v);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-black text-white overflow-x-hidden overflow-y-auto relative font-sans selection:bg-blue-500 selection:text-white flex flex-col">
      {/* Animated Background - Fixed coverage */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-red-900 rounded-full blur-[120px] animate-pulse-slow delay-1000"></div>
      </div>

      {/* Network Offline Warning */}
      {!isOnline && (
        <div className="fixed top-0 left-0 w-full bg-red-600/90 text-white z-50 text-center py-2 text-sm font-bold flex items-center justify-center gap-2 backdrop-blur-md">
          <WifiOff size={16} />
          <span>Internet connection unstable. Reconnecting...</span>
        </div>
      )}

      {/* Main Content Container - Scrollable */}
      <div className="relative z-10 container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[100dvh]">

        {/* Header / Logo */}
        <div className="mb-8 text-center relative z-20">
          {/* Logo with Glow & Padding for clipping fix */}
          <div className="relative inline-block p-4">
            {/* Glow Layer */}
            <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-2 relative z-10 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-blue-500 to-blue-400">hop</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-red-500 to-red-400">Radio</span>
            </h1>
          </div>

          <p className="text-gray-400 italic tracking-widest text-sm md:text-base uppercase mb-1">
            We don't play what you want, we play what you need
          </p>
          <p className="text-blue-500 font-bold tracking-wider text-xs md:text-sm uppercase drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]">
            Straight from New York to the H City!
          </p>
        </div>

        {/* Player Card */}
        <div className="w-full max-w-md bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden group">
          {/* Gloss Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

          {/* Status Line */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]' : 'bg-gray-600'}`}></div>
              <span className="text-xs font-bold tracking-wider text-gray-400">{isLive ? 'LIVE BROADCAST' : 'CONNECTING...'}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-blue-400">
              <Radio size={14} />
              <span>HQ AUDIO</span>
            </div>
          </div>

          {/* Album Art / Visualizer Placeholder */}
          <div className="aspect-square bg-gradient-to-b from-gray-900 to-black rounded-2xl mb-8 flex items-center justify-center relative overflow-hidden shadow-inner border border-white/5">
            {/* Simulated Visualizer Bars */}
            <div className="flex items-end gap-1 h-32 opacity-70">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className={`w-4 bg-gradient-to-t from-blue-600 to-red-600 rounded-t-full transition-all duration-300 ${isPlaying ? 'animate-music-bar' : 'h-2'}`}
                  style={{
                    height: isPlaying ? `${Math.max(20, Math.random() * 100)}%` : '10%',
                    animationDelay: `${i * 0.1}s`
                  }}
                ></div>
              ))}
            </div>

            {/* Track Info Overlay if missing art */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
              {!track ? (
                <Activity className="w-16 h-16 text-gray-800" />
              ) : (
                <div className="text-center">
                  {/* In real app, img tag here */}
                </div>
              )}
            </div>
          </div>

          {/* Track Info */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2 truncate drop-shadow-md">{track ? track.title : 'Ready to Tune In?'}</h2>
            <p className="text-blue-400 font-medium truncate">{track ? track.artist : 'Click Play to Start'}</p>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-6">
            {/* Progress Bar */}
            <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden border border-white/5">
              <div className="h-full bg-gradient-to-r from-blue-600 to-red-600 w-full animate-progress-indeterminate opacity-40 shadow-[0_0_10px_rgba(37,99,235,0.5)]"></div>
            </div>

            <div className="flex items-center justify-center gap-8">
              {/* Volume */}
              <div className="hidden md:flex items-center gap-2 w-24">
                <div className="w-full h-1 bg-gray-800 rounded-full cursor-pointer relative group/vol">
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={volume}
                    onChange={handleVolume}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="h-full bg-gray-500 rounded-full pointer-events-none" style={{ width: `${volume * 100}%` }}></div>
                </div>
              </div>

              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.4)] z-20"
              >
                {isPlaying ? <Pause fill="black" size={28} /> : <Play fill="black pl-1" size={28} />}
              </button>

              <button
                onClick={skip}
                className="w-10 h-10 rounded-full bg-gray-900 text-gray-400 flex items-center justify-center hover:bg-gray-800 hover:text-white transition-all active:scale-95 border border-white/5"
              >
                <SkipForward size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* AdSpace Component */}
        <AdSpace />

      </div>

      {/* Footer - Fixed Bottom Right */}
      <div className="fixed bottom-4 right-4 z-50 text-[10px] text-gray-500 font-medium tracking-wide">
        Created by <a href="https://yepzhi.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:text-white transition-colors">@yepzhi</a>
      </div>

    </div>
  );
}

export default App;
