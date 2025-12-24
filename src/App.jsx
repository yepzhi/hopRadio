import { useState, useEffect, useRef } from 'react';
import { radio } from './audio/RadioEngine';
import { Play, Pause, SkipForward, Radio, Zap, Activity } from 'lucide-react';
import './App.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [track, setTrack] = useState(null);
  const [volume, setVolume] = useState(0.8);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    // Initialize Audio Engine
    radio.init();

    // Subscribe to events
    radio.onTrackChange = (newTrack) => {
      setTrack(newTrack);
    };

    // Simulated "Live" connection checking
    setTimeout(() => setIsLive(true), 1500);

    // Clean up? Radio usually singleton for the app session
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
    <div className="min-h-screen bg-black text-white overflow-hidden relative font-sans selection:bg-blue-500 selection:text-white">
      {/* Animated Background */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-red-600 rounded-full blur-[120px] animate-pulse-slow delay-1000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 h-screen flex flex-col items-center justify-center">

        {/* Header / Logo */}
        <div className="mb-12 text-center">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-2">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-blue-400 to-white">hop</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-600 to-red-800">Radio</span>
          </h1>
          <p className="text-gray-400 italic tracking-widest text-sm md:text-base uppercase">We don't play what you want, we play what you need</p>
        </div>

        {/* Player Card */}
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
          {/* Gloss Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

          {/* Status Line */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
              <span className="text-xs font-bold tracking-wider text-gray-400">{isLive ? 'LIVE BROADCAST' : 'CONNECTING...'}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-blue-400">
              <Radio size={14} />
              <span>HQ AUDIO</span>
            </div>
          </div>

          {/* Album Art / Visualizer Placeholder */}
          <div className="aspect-square bg-gradient-to-b from-gray-800 to-black rounded-2xl mb-8 flex items-center justify-center relative overflow-hidden shadow-inner border border-white/5">
            {/* Simulated Visualizer Bars */}
            <div className="flex items-end gap-1 h-32 opacity-50">
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
                <Activity className="w-16 h-16 text-gray-700" />
              ) : (
                <div className="text-center">
                  {/* In real app, img tag here */}
                </div>
              )}
            </div>
          </div>

          {/* Track Info */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2 truncate">{track ? track.title : 'Ready to Tune In?'}</h2>
            <p className="text-blue-400 font-medium truncate">{track ? track.artist : 'Click Play to Start'}</p>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-6">
            {/* Progress Bar (Fake for radio) */}
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-red-500 w-full animate-progress-indeterminate opacity-50"></div>
            </div>

            <div className="flex items-center justify-center gap-8">
              {/* Volume (Hidden on mobile maybe, showing here for completeness) */}
              <div className="hidden md:flex items-center gap-2 w-24">
                <div className="w-full h-1 bg-gray-700 rounded-full cursor-pointer relative group/vol">
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={volume}
                    onChange={handleVolume}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="h-full bg-gray-400 rounded-full pointer-events-none" style={{ width: `${volume * 100}%` }}></div>
                </div>
              </div>

              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.3)] z-20"
              >
                {isPlaying ? <Pause fill="black" size={28} /> : <Play fill="black pl-1" size={28} />}
              </button>

              <button
                onClick={skip}
                className="w-10 h-10 rounded-full bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 hover:text-white transition-all active:scale-95"
              >
                <SkipForward size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Ad / Info */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-900/50 px-4 py-2 rounded-full border border-gray-800">
            <Zap size={12} className="text-yellow-500" />
            <span>Powered by hopRadio Engine v1.0</span>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
