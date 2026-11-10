import { Howl, Howler } from 'howler';

// Patch Howler's HTML5 Audio pool to guarantee CORS is set on every audio element before src/load
if (typeof Howler !== 'undefined' && typeof Howler._obtainHtml5Audio === 'function' && !Howler._corsPatched) {
    const origObtain = Howler._obtainHtml5Audio;
    Howler._obtainHtml5Audio = function() {
        const audio = origObtain.call(this);
        try {
            audio.crossOrigin = 'anonymous';
            audio.preload = 'auto';
        } catch (e) {}
        return audio;
    };
    if (Array.isArray(Howler._html5AudioPool)) {
        Howler._html5AudioPool.forEach(node => {
            try {
                node.crossOrigin = 'anonymous';
                node.preload = 'auto';
            } catch (e) {}
        });
    }
    Howler._corsPatched = true;
}

// Disable Howler's 30s autoSuspend so it never interferes with streaming audio
if (typeof Howler !== 'undefined') {
    Howler.autoSuspend = false;
}

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

        // Self-Healing Stream State
        this.shouldBePlaying = false;
        this.isReconnecting = false;
        this.lastReconnectTime = 0;
        this.reconnectTimer = null;
        this.inPlaceFailCount = 0;
        this._initialized = false;

        // Network Stats (Added v2.6.4)
        this.onNetworkStats = null;
        this.lastBufferedParams = { end: 0 };
        this.sessionTotalBytes = 0;

        // Audio Output Selection (v2.7.0)
        this.currentOutputDevice = null;
        this.onAudioOutputChange = null;

        // Auto-Resume on Device Reconnect (v2.7.0)
        this.wasPlayingBeforeDisconnect = false;
    }

    reconnect() {
        if (this.isOffline) {
            console.log("RadioEngine: Skipping reconnect (Offline Mode)");
            return;
        }
        console.warn("RadioEngine: Manual/Forced Reconnect");
        this.shouldBePlaying = true;
        this.isReconnecting = false;
        if (this.onBufferingChange) this.onBufferingChange(true);
        this._healStream('manual', true);
    }

    _scheduleReconnect(delayMs = 1500, reason = 'auto') {
        if (this.isOffline || !this.shouldBePlaying) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.onBufferingChange) this.onBufferingChange(true);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldBePlaying && !this.isOffline) {
                this._healStream(reason);
            }
        }, delayMs);
    }

    _attachNodeListeners(node) {
        if (!node) return;
        try {
            node.crossOrigin = "anonymous";
            node.preload = "auto";
        } catch (e) {}

        if (node._radioListenersAttached) return;
        node._radioListenersAttached = true;

        node.onpause = () => {
            if (this.shouldBePlaying && !this.isOffline && !this.isReconnecting) {
                if (node.ended || node.error) {
                    this._scheduleReconnect(300, 'node-ended-or-error-onpause');
                } else {
                    console.log("RadioEngine: HTML5 audio node paused unexpectedly, resuming...");
                    node.play().catch(() => {
                        this._scheduleReconnect(1000, 'node-onpause-play-failed');
                    });
                }
            }
        };

        node.onerror = (e) => {
            console.error("RadioEngine: HTML5 audio node error", e);
            if (this.shouldBePlaying && !this.isOffline) {
                this.isReconnecting = false;
                this._scheduleReconnect(1500, 'node-onerror');
            }
        };

        node.onstalled = () => {
            console.warn("RadioEngine: HTML5 audio node stalled");
            if (this.shouldBePlaying && !this.isOffline && !this.isReconnecting) {
                node.play().catch(() => {});
            }
        };

        node.onplaying = () => {
            this.isPlaying = true;
            this.isReconnecting = false;
            this.inPlaceFailCount = 0;
            if (this.onBufferingChange) this.onBufferingChange(false);
            if (this.onPlay) this.onPlay();
        };

        node.onwaiting = () => {
            if (this.shouldBePlaying && this.onBufferingChange) {
                this.onBufferingChange(true);
            }
        };
    }

    _healStream(reason = 'auto', forceNow = false) {
        if (this.isOffline || !this.shouldBePlaying) return;

        const now = Date.now();
        if (!forceNow && this.isReconnecting && (now - this.lastReconnectTime < 3500)) {
            return;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.isReconnecting = true;
        this.lastReconnectTime = now;
        console.warn(`RadioEngine: Healing live stream (reason: ${reason})...`);

        if (this.onBufferingChange) this.onBufferingChange(true);
        this._unlockAudioContext();

        const node = this.howl && this.howl._sounds && this.howl._sounds[0]
            ? this.howl._sounds[0]._node
            : null;

        // Reuse the existing user-blessed HTML5 <audio> element so browsers never block auto-reconnect
        if (node && this.inPlaceFailCount < 3) {
            try {
                const freshUrl = `${this.streamUrl}?q=${this.currentQuality}&t=${Date.now()}`;
                this.lastBufferedParams = { end: 0 };
                this._attachNodeListeners(node);
                node.src = freshUrl;
                node.load();

                const playPromise = node.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        this.isPlaying = true;
                        this.isReconnecting = false;
                        this.inPlaceFailCount = 0;
                        if (this.onPlay) this.onPlay();
                        this._setupMediaSession();
                        this._connectVisualizer();
                    }).catch((err) => {
                        console.warn("RadioEngine: In-place stream reload rejected, scheduling retry:", err);
                        this.inPlaceFailCount++;
                        this.isReconnecting = false;
                        this._scheduleReconnect(2000, 'inplace-play-rejected');
                    });
                } else {
                    this.isPlaying = true;
                    this.isReconnecting = false;
                }
                return;
            } catch (err) {
                console.warn("RadioEngine: In-place reload threw error, recreating Howl:", err);
                this.inPlaceFailCount++;
            }
        }

        // Fallback: full Howl recreation
        this.inPlaceFailCount = 0;
        this.isReconnecting = false;
        this.isPlaying = false;
        this._startLiveStream();
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        const saved = localStorage.getItem('hop_quality');
        if (saved) {
            this.currentQuality = saved;
        } else if (navigator.connection && (navigator.connection.saveData || navigator.connection.type === 'cellular' || navigator.connection.effectiveType === '2g' || navigator.connection.effectiveType === '3g')) {
            this.currentQuality = '192';
        } else {
            this.currentQuality = '320';
        }

        // Always notify UI of the final quality
        if (this.onQualityChange) {
            this.onQualityChange(this.currentQuality);
        }

        // Initial fake metadata
        this._updateMetadata();

        // Dynamic Network Listener
        this._setupNetworkListeners();

        // Audio Device Change Listener (Auto-Resume)
        this._setupDeviceChangeListener();
    }

    _setupNetworkListeners() {
        window.addEventListener('online', () => {
            if (this.shouldBePlaying && !this.isOffline) {
                console.log("RadioEngine: Network back online, healing stream...");
                this._healStream('network-online', true);
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.shouldBePlaying && !this.isOffline) {
                this._unlockAudioContext();
                const node = this.howl && this.howl._sounds && this.howl._sounds[0]
                    ? this.howl._sounds[0]._node
                    : null;
                if (!node || node.paused || node.ended || node.error) {
                    this._healStream('visibility-resume');
                }
            }
        });

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
                } else if (this.shouldBePlaying && !this.isOffline) {
                    // Network interface switched (e.g. Wi-Fi <-> Cellular): heal if stalled
                    this._scheduleReconnect(1000, 'connection-change');
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
        if ((this.isPlaying || this.shouldBePlaying) && !this.isOffline) {
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
        this.shouldBePlaying = true;
        if (this.isPlaying && !this.isReconnecting) return;

        if (this.isOffline) {
            this._playCurrentOfflineTrack();
            return;
        }

        // If we already have a blessed HTML5 audio node, heal it in-place
        if (this.howl && this.howl._sounds && this.howl._sounds[0] && this.howl._sounds[0]._node) {
            this._healStream('play-resume', true);
            this._startBufferingWatchdog();
            this._startSilenceMonitor();
            return;
        }

        this._startLiveStream();
    }

    _startLiveStream() {
        console.log("RadioEngine: Starting Stream...");
        if (this.onLoadStart) this.onLoadStart();

        this._unlockAudioContext();

        // 1. Unload previous instance to ensure fresh live edge
        if (this.howl) {
            this.howl.unload();
            this.howl = null;
        }

        const finalUrl = `${this.streamUrl}?q=${this.currentQuality}&t=${Date.now()}`;
        console.log("Loading Stream:", finalUrl);

        // Reset buffer tracking to ensure we catch the start
        this.lastBufferedParams = { end: 0 };

        this.howl = new Howl({
            src: [finalUrl],
            format: ['mp3'],
            html5: true, // Required for long streams & iOS background audio
            preload: true, // Load sound and initialize HTML5 node immediately
            volume: this.volume,
            autoplay: false,
            onplay: () => {
                console.log("RadioEngine: Stream Playing!");
                this.isPlaying = true;
                this.isReconnecting = false;
                this.inPlaceFailCount = 0;
                if (this.onPlay) this.onPlay();
                this._setupMediaSession();
                this._connectVisualizer();
            },
            onloaderror: (id, err) => {
                console.error("RadioEngine: Stream Connection Error", err);
                this.isReconnecting = false;
                this._scheduleReconnect(2000, 'onloaderror');
            },
            onplayerror: (id, err) => {
                console.warn("RadioEngine: Play blocked or interrupted, retrying...", err);
                this._unlockAudioContext();
                this._scheduleReconnect(1000, 'onplayerror');
            },
            onend: () => {
                console.log("RadioEngine: Stream ended (connection closed), reconnecting...");
                this.isReconnecting = false;
                this._scheduleReconnect(500, 'onend');
            }
        });

        // 3. Attach resilient listeners to the HTML5 audio element
        if (this.howl._sounds.length > 0 && this.howl._sounds[0]._node) {
            this._attachNodeListeners(this.howl._sounds[0]._node);
        }

        // 4. Start playback
        this.howl.play();

        // Ensure listeners attached if node was created during play()
        if (this.howl._sounds.length > 0 && this.howl._sounds[0]._node) {
            this._attachNodeListeners(this.howl._sounds[0]._node);
        }

        // 5. Start Watchdog
        this._startBufferingWatchdog();
        // 6. Start Silence Monitor (Live)
        this._startSilenceMonitor();
    }

    _startBufferingWatchdog() {
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);

        let stuckTime = 0;
        let lastTime = -1;
        let missingNodeCount = 0;

        this.watchdogInterval = setInterval(() => {
            if (!this.howl || this.isOffline || !this.shouldBePlaying) return;

            // Auto-resume AudioContext if suspended by browser policy
            if (Howler.ctx && Howler.ctx.state === 'suspended' && this.shouldBePlaying) {
                Howler.ctx.resume().catch(() => {});
            }

            const sound = this.howl._sounds[0];
            const node = sound ? sound._node : null;

            if (!node) {
                missingNodeCount++;
                if (missingNodeCount >= 3) {
                    missingNodeCount = 0;
                    this._scheduleReconnect(1000, 'missing-node');
                }
                return;
            }
            missingNodeCount = 0;

            const currentTime = node.currentTime;

            // Condition: Time hasn't moved significant amount or node is paused/errored
            if (Math.abs(currentTime - lastTime) < 0.05 || node.paused || node.ended || node.error) {
                stuckTime += 1000;
                // Notify UI: Buffering
                if (stuckTime >= 2000) {
                    if (this.onBufferingChange) this.onBufferingChange(true);
                }

                // Step 1 (at 3s stuck): attempt soft play resume if paused without error/EOF
                if (stuckTime === 3000 && node.paused && !node.ended && !node.error && !this.isReconnecting) {
                    this._unlockAudioContext();
                    node.play().catch(() => {});
                }

                // Step 2 (at 6s stuck): soft resume did not advance currentTime -> force fresh stream URL reload!
                if (stuckTime >= 6000) {
                    console.warn("RadioEngine: Watchdog detected stalled stream (>6s), forcing stream heal...");
                    stuckTime = 0;
                    this._healStream('watchdog-stuck', true);
                }
            } else {
                // Recovered & advancing normally!
                if (stuckTime > 0 || this.isReconnecting) {
                    if (this.onBufferingChange) this.onBufferingChange(false);
                }
                stuckTime = 0;
                this.isReconnecting = false;
                this.inPlaceFailCount = 0;
                this.isPlaying = true;
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
                            const bytesPerSecond = this.currentQuality === '192' ? 24000 : 40000;
                            const bytes = delta * bytesPerSecond;
                            this.sessionTotalBytes += bytes;

                            if (this.onNetworkStats) this.onNetworkStats({ speed: bytes, total: this.sessionTotalBytes });
                        } else {
                            if (this.onNetworkStats) this.onNetworkStats({ speed: 0, total: this.sessionTotalBytes });
                        }
                    }
                    this.lastBufferedParams.end = bufferedEnd;
                }
            }
            // ------------------------------------------
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

        this.howl = new Howl({
            src: [track.blobUrl],
            format: ['mp3'],
            html5: true,
            volume: this.volume,
            autoplay: false,
            onload: () => {
                this.howl.play();
            },
            onplay: () => {
                this.isPlaying = true;
                this.offlineErrorCount = 0;
                if (this.onPlay) this.onPlay();
                this._setupMediaSession(track);
                this._connectVisualizer();
                this._startSilenceMonitor();
            },
            onplayerror: (id, err) => {
                this.howl.once('unlock', () => {
                    this.howl.play();
                });
            },
            onend: () => {
                this.playNextOffline();
            },
            onloaderror: (id, err) => {
                console.error("Offline playback error:", track.title);
                this.offlineErrorCount++;
                if (this.offlineErrorCount >= this.offlineQueue.length) {
                    this.pause();
                    return;
                }
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
                            // Hard reconnect on silence disabled to prevent browser autoplay policy blocking stream (v3.2.8)
                            // HTML5 node self-healing handles reconnects without resetting AudioContext
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

    _unlockAudioContext() {
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
            Howler.ctx.resume().catch(e => {
                console.warn("RadioEngine: AudioContext resume failed:", e);
            });
        }
        if (typeof Howler._autoResume === 'function') {
            Howler._autoResume();
        }
    }

    pause() {
        console.log("RadioEngine: Stopping Audio");

        // Store state for auto-resume on device reconnect
        if (this.isPlaying) {
            this.wasPlayingBeforeDisconnect = true;
        }

        this.shouldBePlaying = false;
        this.isPlaying = false;
        this.isReconnecting = false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.howl) {
            this.howl.unload(); // Truly stop to save bandwidth
            this.howl = null;
        }

        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        if (this.onBufferingChange) this.onBufferingChange(false);
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
        if (!this.isPlaying) return null;

        if (!this.dataArray) {
            this.dataArray = new Uint8Array(32);
        }

        // Generate lively, realistic rhythmic frequency data aligned with the music
        const now = Date.now();
        // Dynamic BPM pulse (~124 BPM, standard house / hip-hop groove)
        const beatPhase = (now % 484) / 484; // 124 BPM cycle
        const kickEnergy = Math.pow(Math.max(0, 1 - beatPhase * 2.2), 2); // Punchy kick decay
        const snarePhase = ((now + 242) % 484) / 484;
        const snareEnergy = Math.pow(Math.max(0, 1 - snarePhase * 2.5), 2);
        const hihat = (Math.sin(now / 30) + 1) * 0.5;

        for (let i = 0; i < this.dataArray.length; i++) {
            let val = 0;
            if (i < 4) {
                // Sub-bass & Kick (Bins 0-3)
                val = (kickEnergy * 200) + 40 + (Math.random() * 25);
            } else if (i < 12) {
                // Low-mids & Snare (Bins 4-11)
                val = (snareEnergy * 160) + 30 + (Math.random() * 20);
            } else {
                // Highs & Shimmer (Bins 12-31)
                val = (hihat * 90) + (Math.random() * 40);
            }
            this.dataArray[i] = Math.min(255, Math.floor(val));
        }

        return this.dataArray;
    }

    _connectVisualizer() {
        // Native HTML5 audio plays directly to hardware speakers for 100% reliable,
        // background/lock-screen safe playback without AudioContext suspension bugs.
        // The visualizer is driven seamlessly via getAudioData().
        if (!this.dataArray) {
            this.dataArray = new Uint8Array(32);
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
                navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevOffline());

                // IOS LIVE STREAM HACK for Offline Mode
                // Force infinite duration so the OS treats it as a radio stream
                try {
                    navigator.mediaSession.setPositionState({
                        duration: Infinity,
                        playbackRate: 1,
                        position: 0
                    });
                } catch (e) {
                    console.warn("MediaSession setPositionState failed:", e);
                }
            } else {
                navigator.mediaSession.setActionHandler('nexttrack', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
            }

            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
        }
    }

    // --- Audio Output Selection (v2.7.0) ---

    /**
     * Get list of available audio output devices
     * @returns {Promise<Array>} List of audio output devices
     */
    async getAudioOutputs() {
        try {
            // Request permission first (needed to get full device list)
            await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => { });
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(d => d.kind === 'audiooutput');
        } catch (err) {
            console.warn('RadioEngine: Cannot enumerate audio devices:', err);
            return [];
        }
    }

    /**
     * Set audio output device by deviceId
     * @param {string} deviceId - The device ID to switch to
     */
    async setAudioOutput(deviceId) {
        try {
            const node = this.howl && this.howl._sounds && this.howl._sounds[0] ? this.howl._sounds[0]._node : null;
            if (node && typeof node.setSinkId === 'function') {
                await node.setSinkId(deviceId);
                this.currentOutputDevice = deviceId;
                console.log('RadioEngine: HTML5 audio node output changed to:', deviceId);
                if (this.onAudioOutputChange) this.onAudioOutputChange(deviceId);
                localStorage.setItem('hop_audio_output', deviceId);
            } else if (Howler.ctx && typeof Howler.ctx.setSinkId === 'function') {
                await Howler.ctx.setSinkId(deviceId);
                this.currentOutputDevice = deviceId;
                console.log('RadioEngine: Audio output changed to:', deviceId);
                if (this.onAudioOutputChange) this.onAudioOutputChange(deviceId);
                localStorage.setItem('hop_audio_output', deviceId);
            } else {
                console.warn('RadioEngine: setSinkId not supported');
            }
        } catch (err) {
            console.error('RadioEngine: Failed to set audio output:', err);
        }
    }

    /**
     * Prompt user to select audio output device (requires user gesture)
     */
    async selectAudioOutput() {
        try {
            if (navigator.mediaDevices.selectAudioOutput) {
                const device = await navigator.mediaDevices.selectAudioOutput();
                if (device) {
                    await this.setAudioOutput(device.deviceId);
                    return device;
                }
            } else {
                console.warn('RadioEngine: selectAudioOutput not supported');
            }
        } catch (err) {
            console.error('RadioEngine: Audio output selection cancelled or failed:', err);
        }
        return null;
    }

    /**
     * Setup device change listener for auto-resume
     */
    _setupDeviceChangeListener() {
        if (navigator.mediaDevices) {
            navigator.mediaDevices.addEventListener('devicechange', async () => {
                console.log('RadioEngine: Audio device change detected');

                // Check if we should auto-resume
                if (this.wasPlayingBeforeDisconnect && !this.isPlaying) {
                    console.log('RadioEngine: Auto-resuming playback after device reconnect');
                    setTimeout(() => {
                        this.play();
                        this.wasPlayingBeforeDisconnect = false;
                    }, 500); // Small delay for device to stabilize
                }

                // Try to restore saved audio output
                const savedOutput = localStorage.getItem('hop_audio_output');
                if (savedOutput) {
                    const devices = await this.getAudioOutputs();
                    const found = devices.find(d => d.deviceId === savedOutput);
                    if (found) {
                        await this.setAudioOutput(savedOutput);
                    }
                }
            });
        }
    }
};
