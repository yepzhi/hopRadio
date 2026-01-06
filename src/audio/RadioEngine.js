import { Howl, Howler } from 'howler';

export const radio = new class RadioEngine {
    constructor() {
        this.streamUrl = 'https://yepzhi-hopradio-sync.hf.space/stream';
        this.howl = null;
        this.isPlaying = false;
        this.volume = 0.6;
        this.currentQuality = '320'; // Default

        // Hooks
        this.onPlay = null;
        this.onLoadStart = null;
        this.onTrackChange = null;
        this.onQualityChange = null; // Sync UI with Engine
        this.onNextTrackUpdate = null; // For "Playing next" UI

        // Audio Graph
        this.context = null;
        this.analyser = null;
        this.dataArray = null;

        // Silence Detection
        this.silenceStartTime = null;
        this.SILENCE_THRESHOLD = 4000; // 4 seconds
        this.silenceMonitorId = null;

        // Watchdog & Buffering
        this.watchdogInterval = null;
        this.onBufferingChange = null; // UI Hook

        // Network Stats (Added v2.6.4)
        this.onNetworkStats = null;
        this.lastBufferedParams = { end: 0 };
        this.sessionTotalBytes = 0;
    }

    reconnect() {
        if (this.isOffline) {
            console.log("RadioEngine: Skipping reconnect (Offline Mode)");
            return;
        }
        console.warn("RadioEngine: Manual/Forced Reconnect");
        if (this.onBufferingChange) this.onBufferingChange(true);
        this.pause();
        setTimeout(() => this.play(), 100);
    }

    async init() {
        console.log("RadioEngine: Initializing");
        // Auto-detect quality preference
        const saved = localStorage.getItem('hop_quality');
        if (saved) {
            this.currentQuality = saved;
        } else if (navigator.connection && (navigator.connection.saveData || navigator.connection.type === 'cellular' || navigator.connection.effectiveType === '2g' || navigator.connection.effectiveType === '3g')) {
            this.currentQuality = '192';
            console.log("Auto-switched to Data Saver (192kbps) - Cellular/Slow Network Detected");
            if (this.onQualityChange) this.onQualityChange('192');
        } else {
            // Default to HQ on WiFi/Good Connection
            console.log("WiFi/Fast Connection Detected - Defaulting to HQ (320kbps)");
        }

        // Initial fake metadata
        this._updateMetadata();

        // Dynamic Network Listener
        this._setupNetworkListeners();
    }

    _setupNetworkListeners() {
        if (navigator.connection) {
            navigator.connection.addEventListener('change', () => {
                // Only auto-switch if user hasn't manually set a preference
                if (!localStorage.getItem('hop_quality')) {
                    const conn = navigator.connection;
                    if (conn.saveData || conn.type === 'cellular' || ['2g', '3g'].includes(conn.effectiveType)) {
                        if (this.currentQuality !== '192') {
                            console.log("Network Change: Switching to ECO (192kbps)");
                            this.setQuality('192');
                        }
                    } else {
                        if (this.currentQuality !== '320') {
                            console.log("Network Change: Switching to HQ (320kbps)");
                            this.setQuality('320');
                        }
                    }
                }
            });
        }
    }

    setQuality(q) {
        if (q === this.currentQuality) return;
        console.log(`RadioEngine: Switching Quality to ${q}kbps`);
        this.currentQuality = q;
        localStorage.setItem('hop_quality', q);

        // UI Hook
        if (this.onQualityChange) this.onQualityChange(q);

        // Reconnect stream if playing AND online
        if (this.isPlaying && !this.isOffline) {
            this.reconnect();
        }
    }

    _updateMetadata() {
        if (this.onTrackChange) {
            this.onTrackChange({
                title: this.isOffline ? "Offline Mode" : "Live Radio",
                artist: "hopRadio",
                src: this.isOffline ? "Local Cache" : this.streamUrl,
                type: this.isOffline ? "offline" : "stream",
                id: "stream"
            });
        }
    }

    play() {
        if (this.isPlaying) return;

        if (this.isOffline) {
            this._playCurrentOfflineTrack();
            return;
        }

        console.log("RadioEngine: Starting Stream...");
        if (this.onLoadStart) this.onLoadStart();

        // 1. Unload previous instance to ensure fresh live edge
        if (this.howl) {
            this.howl.unload();
        }

        // 2. Create new Howl instance
        // 2. Create new Howl instance
        const finalUrl = `${this.streamUrl}?q=${this.currentQuality}&t=${Date.now()}`;
        console.log("Loading Stream:", finalUrl);

        this.howl = new Howl({
            src: [finalUrl],
            format: ['mp3'],
            html5: true, // Required for long streams & iOS background audio
            volume: this.volume,
            autoplay: false, // We handle play manually to inject CORS
            onplay: () => {
                console.log("RadioEngine: Stream Playing!");
                this.isPlaying = true;
                if (this.onPlay) this.onPlay();
                this._setupMediaSession();
                this._connectVisualizer();
            },
            onloaderror: (id, err) => {
                console.error("RadioEngine: Stream Connection Error", err);
                // Simple retry
                setTimeout(() => this.play(), 2000);
            },
            onend: () => {
                console.log("RadioEngine: Stream ended (connection lost?)");
                this.isPlaying = false;
                // Auto-reconnect
                setTimeout(() => this.play(), 1000);
            }
        });

        // 3. Inject CORS *before* request starts (Critical for Chrome/Firefox Visualizer)
        if (this.howl._sounds.length > 0 && this.howl._sounds[0]._node) {
            this.howl._sounds[0]._node.crossOrigin = "anonymous";
        }

        // 4. Start
        // 4. Start
        this.howl.play();

        // 5. Start Watchdog
        this._startBufferingWatchdog();
        // 6. Start Silence Monitor (Live)
        this._startSilenceMonitor();
    }

    _startBufferingWatchdog() {
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);

        let stuckTime = 0;
        let lastTime = -1;

        this.watchdogInterval = setInterval(() => {
            if (!this.howl || this.isOffline || !this.isPlaying) return;

            const sound = this.howl._sounds[0];
            const node = sound ? sound._node : null;

            if (!node || node.paused) return; // Don't check if intentionally paused

            const currentTime = node.currentTime;

            // Condition: Time hasn't moved significant amount
            if (Math.abs(currentTime - lastTime) < 0.05) {
                stuckTime += 1000;
                // Notify UI: Buffering
                if (stuckTime >= 1000) { // Only show buffering if stuck > 1s
                    if (this.onBufferingChange) this.onBufferingChange(true);
                }
            } else {
                // Recovered
                if (stuckTime > 0) {
                    if (this.onBufferingChange) this.onBufferingChange(false);
                }
                stuckTime = 0;
            }

            lastTime = currentTime;

            // --- Network Stats Calculation (v2.6.4) ---
            if (this.howl && this.howl._sounds.length > 0) {
                const sound = this.howl._sounds[0];
                if (sound._node && sound._node.buffered && sound._node.buffered.length > 0) {
                    const bufferedEnd = sound._node.buffered.end(sound._node.buffered.length - 1);

                    if (this.lastBufferedParams.end > 0) {
                        const delta = bufferedEnd - this.lastBufferedParams.end;
                        if (delta > 0) {
                            // 320kbps = 40,000 bytes/sec approx (Audio Density)
                            const bytes = delta * 40000;
                            this.sessionTotalBytes += bytes;

                            // Speed = bytes per second (since interval is 1s)
                            if (this.onNetworkStats) this.onNetworkStats({ speed: bytes, total: this.sessionTotalBytes });
                        } else {
                            if (this.onNetworkStats) this.onNetworkStats({ speed: 0, total: this.sessionTotalBytes });
                        }
                    }
                    this.lastBufferedParams.end = bufferedEnd;
                }
            }
            // ------------------------------------------

            // TRIGGER: Force Reconnect if stuck > 5s
            if (stuckTime > 5000) {
                console.warn("RadioEngine: Watchdog triggered! Stream stuck > 5s. force reconnecting...");
                stuckTime = 0;

                // CRITICAL: Clean stop to reset isPlaying state so play() works
                this.pause();

                setTimeout(() => this.play(), 100); // Re-init
            }
        }, 1000);
    }

    // --- Offline Mode ---
    playOffline(playlist) {
        if (!playlist || playlist.length === 0) {
            console.error("RadioEngine: Empty playlist for offline mode");
            return;
        }

        console.log("RadioEngine: Switching to Offline Mode", playlist);
        this.pause(); // Stop stream if running

        this.isOffline = true;
        this.offlineQueue = playlist; // Array of { blobUrl, title, artist, ... }
        this.offlineIndex = 0;
        this.offlineErrorCount = 0; // Prevent infinite loops

        this._playCurrentOfflineTrack();
    }

    playNextOffline() {
        if (!this.isOffline) return;
        this.offlineIndex = (this.offlineIndex + 1) % this.offlineQueue.length;
        this._playCurrentOfflineTrack();
    }

    playPrevOffline() {
        if (!this.isOffline) return;
        // Handle wrap-around for negative index
        this.offlineIndex = (this.offlineIndex - 1 + this.offlineQueue.length) % this.offlineQueue.length;
        this._playCurrentOfflineTrack();
    }

    // Scratch functionality removed by user request (v2.3.8)

    _playCurrentOfflineTrack() {
        if (!this.offlineQueue || this.offlineQueue.length === 0) return;

        const track = this.offlineQueue[this.offlineIndex];
        console.log("RadioEngine: Playing Offline Track", track.title);

        // Notify about next track
        if (this.onNextTrackUpdate && this.offlineQueue.length > 1) {
            const nextIndex = (this.offlineIndex + 1) % this.offlineQueue.length;
            this.onNextTrackUpdate(this.offlineQueue[nextIndex]);
        }

        if (this.howl) {
            this.howl.unload();
        }

        // Stop any previous silence monitor
        if (this.silenceMonitorId) {
            cancelAnimationFrame(this.silenceMonitorId);
            this.silenceMonitorId = null;
        }
        this.silenceStartTime = null;

        if (this.onLoadStart) this.onLoadStart();
        if (this.onTrackChange) this.onTrackChange(track);

        console.log("[OFFLINE DEBUG] Creating Howl for:", track.title, "BlobURL:", track.blobUrl?.substring(0, 50) + "...");

        this.howl = new Howl({
            src: [track.blobUrl],
            format: ['mp3'],
            html5: true, // Keep consistent for visualizer hook
            volume: this.volume,
            autoplay: false, // Disabled to fix Safari autoplay issues
            onload: () => {
                console.log("[OFFLINE DEBUG] Howl LOADED successfully, now playing...");
                this.howl.play();
            },
            onplay: () => {
                console.log("[OFFLINE DEBUG] Howl PLAYING:", track.title);
                this.isPlaying = true;
                this.offlineErrorCount = 0; // Reset error counter on success
                if (this.onPlay) this.onPlay();
                this._setupMediaSession(track);
                this._connectVisualizer();
                this._startSilenceMonitor(); // Start monitoring
            },
            onplayerror: (id, err) => {
                console.error("[OFFLINE DEBUG] PLAY ERROR:", err, "Attempting unlock...");
                // Attempt to unlock audio context (Safari fix)
                this.howl.once('unlock', () => {
                    console.log("[OFFLINE DEBUG] Audio unlocked, retrying play...");
                    this.howl.play();
                });
            },
            onend: () => {
                console.log("[OFFLINE DEBUG] Track ENDED, playing next...");
                this.playNextOffline();
            },
            onloaderror: (id, err) => {
                console.error("[OFFLINE DEBUG] LOAD ERROR:", err, "Track:", track.title);

                this.offlineErrorCount++;
                if (this.offlineErrorCount >= this.offlineQueue.length) {
                    console.error("[OFFLINE DEBUG] All offline tracks failed! Stopping.");
                    this.pause();
                    return;
                }

                // Delay to prevent "spinning" UI
                setTimeout(() => this.playNextOffline(), 1000);
            }
        });
    }

    _startSilenceMonitor() {
        // Live & Offline Support
        if (this.silenceMonitorId) cancelAnimationFrame(this.silenceMonitorId);

        const monitor = () => {
            if (!this.isPlaying) {
                this.silenceMonitorId = null;
                return;
            }

            const data = this.getAudioData();
            if (data) {
                const avg = data.reduce((a, b) => a + b, 0) / data.length;

                if (avg < 3) { // Silence
                    if (!this.silenceStartTime) {
                        this.silenceStartTime = Date.now();
                    } else if (Date.now() - this.silenceStartTime > 5000) { // 5s Silence
                        console.warn("RadioEngine: Silence detected (>5s)");
                        this.silenceStartTime = null;

                        if (this.isOffline) {
                            this.playNextOffline(); // Skip track
                        } else {
                            this.reconnect(); // Reconnect stream
                        }
                        return;
                    }
                } else {
                    this.silenceStartTime = null;
                }
            }
            this.silenceMonitorId = requestAnimationFrame(monitor);
        };
        this.silenceMonitorId = requestAnimationFrame(monitor);
    }

    switchToLive() {
        console.log("RadioEngine: Switching back to Live Stream");
        this.pause();
        this.isOffline = false;
        this.offlineQueue = [];
        this.play(); // Auto-start live
    }
    // --------------------

    pause() {
        console.log("RadioEngine: Stopping Audio");
        this.isPlaying = false;

        if (this.howl) {
            this.howl.unload(); // Truly stop to save bandwidth
            this.howl = null;
        }

        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    }

    setVolume(val) {
        this.volume = val;
        if (this.howl) this.howl.volume(val);
    }

    resumeContext() {
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
            Howler.ctx.resume();
        }
    }

    getAudioData() {
        if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            return this.dataArray;
        }
        return null;
    }

    _connectVisualizer() {
        if (!Howler.ctx) return;
        const ctx = Howler.ctx;

        // Ensure Analyser exists
        if (!this.analyser) {
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 64; // Low res for performance
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }

        // Hook into Howler HTML5 Audio Node for Visualizer AND EQ
        try {
            if (this.howl && this.howl._sounds.length > 0) {
                const node = this.howl._sounds[0]._node;
                if (node) {
                    node.crossOrigin = "anonymous";
                    if (!node._source) {
                        const source = ctx.createMediaElementSource(node);

                        // === ADVANCED AUDIO PROCESSING CHAIN ===
                        // Goal: heavy bass, scooped mids, big high end, energetic transient punch

                        // --- A. FILTERS / EQ ---

                        // --- CONNECT GRAPH (Clean v2.6.5) ---
                        // Backend now handles EQ/Compression. Client just visualizes.
                        // Source -> Analyser -> Out
                        source.connect(this.analyser);
                        this.analyser.connect(ctx.destination);

                        node._source = source; // Cache it
                    }
                }
            }
        } catch (e) {
            console.warn("Audio Graph connect failed (CORS?):", e);
        }
    }

    _setupMediaSession(track = null) {
        if ('mediaSession' in navigator) {
            const title = track ? track.title : "Live Stream";
            const artist = track ? track.artist : "hopRadio";

            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                artwork: [{ src: 'https://yepzhi.com/hopRadio/logo.svg', sizes: '512x512', type: 'image/svg+xml' }]
            });
            navigator.mediaSession.playbackState = 'playing';

            if (track) {
                // Offline Controls
                navigator.mediaSession.setActionHandler('nexttrack', () => this.playNextOffline());
            } else {
                navigator.mediaSession.setActionHandler('nexttrack', null);
            }

            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
        }
    }
};
