import { Howl, Howler } from 'howler';

export const radio = new class RadioEngine {
    constructor() {
        this.streamUrl = 'https://yepzhi-hopradio-sync.hf.space/stream';
        this.howl = null;
        this.isPlaying = false;
        this.volume = 0.6;

        // Hooks
        this.onPlay = null;
        this.onLoadStart = null;
        this.onTrackChange = null;
        this.onNextTrackUpdate = null; // For "Playing next" UI

        // Audio Graph
        this.context = null;
        this.analyser = null;
        this.dataArray = null;

        // Silence Detection
        this.silenceStartTime = null;
        this.SILENCE_THRESHOLD = 4000; // 4 seconds
        this.silenceMonitorId = null;
    }

    async init() {
        console.log("RadioEngine: Initializing");
        // Initial fake metadata
        this._updateMetadata();
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
        this.howl = new Howl({
            src: [this.streamUrl],
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
        this.howl.play();
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
            html5: true, // Keep consistent for visualizer hook
            volume: this.volume,
            autoplay: true,
            onplay: () => {
                this.isPlaying = true;
                if (this.onPlay) this.onPlay();
                this._setupMediaSession(track);
                this._connectVisualizer();
                this._startSilenceMonitor(); // Start monitoring
            },
            onend: () => {
                console.log("RadioEngine: Track ended, playing next...");
                this.playNextOffline();
            },
            onloaderror: (id, err) => {
                console.error("RadioEngine: Offline Playback Error", err);
                this.playNextOffline(); // Skip bad track
            }
        });
    }

    _startSilenceMonitor() {
        if (!this.isOffline) return; // Only for offline mode

        const monitor = () => {
            if (!this.isPlaying || !this.isOffline) {
                this.silenceMonitorId = null;
                return;
            }

            const data = this.getAudioData();
            if (data) {
                const avg = data.reduce((a, b) => a + b, 0) / data.length;

                if (avg < 3) { // Near silence threshold
                    if (!this.silenceStartTime) {
                        this.silenceStartTime = Date.now();
                    } else if (Date.now() - this.silenceStartTime > this.SILENCE_THRESHOLD) {
                        console.log("RadioEngine: Silence > 5s detected, skipping...");
                        this.silenceStartTime = null;
                        this.playNextOffline();
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
        if (this.howl) {
            this.howl.unload(); // Truly stop to save bandwidth
            this.howl = null;
        }
        this.isPlaying = false;
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

                        // 1. High Pass Filter (remove sub-rumble)
                        const hpFilter = ctx.createBiquadFilter();
                        hpFilter.type = 'highpass';
                        hpFilter.frequency.value = 28;
                        hpFilter.Q.value = 0.7;

                        // 2. Low Shelf (body)
                        const lowShelf = ctx.createBiquadFilter();
                        lowShelf.type = 'lowshelf';
                        lowShelf.frequency.value = 95;
                        lowShelf.gain.value = 7.0;  // +7 dB bass

                        // 3. Bass Peak (sub-kick weight)
                        const bassPeak = ctx.createBiquadFilter();
                        bassPeak.type = 'peaking';
                        bassPeak.frequency.value = 60;
                        bassPeak.gain.value = 3.5;  // +3.5 dB peak
                        bassPeak.Q.value = 1.0;

                        // 4. Mid Scoop (clarity)
                        const mid = ctx.createBiquadFilter();
                        mid.type = 'peaking';
                        mid.frequency.value = 800;
                        mid.gain.value = -6.0;  // -6 dB scoop
                        mid.Q.value = 1.0;

                        // 5. Upper-Mid Presence (percussion clarity)
                        const upperMid = ctx.createBiquadFilter();
                        upperMid.type = 'peaking';
                        upperMid.frequency.value = 2500;
                        upperMid.gain.value = 1.5;  // +1.5 dB
                        upperMid.Q.value = 1.2;

                        // 6. High Shelf (air & treble)
                        const highShelf = ctx.createBiquadFilter();
                        highShelf.type = 'highshelf';
                        highShelf.frequency.value = 10000;
                        highShelf.gain.value = 9.0;  // +9 dB treble

                        // --- B. BUS COMPRESSOR (Glue for punch) ---
                        const compressor = ctx.createDynamicsCompressor();
                        compressor.threshold.value = -14;  // ~2-6 dB GR on peaks
                        compressor.knee.value = 6;
                        compressor.ratio.value = 3.8;      // Medium-strong
                        compressor.attack.value = 0.008;   // 8ms (transient punch)
                        compressor.release.value = 0.12;   // 120ms (fast energy)

                        // --- MASTER GAIN ---
                        const masterGain = ctx.createGain();
                        masterGain.gain.value = 0.93;  // 93% volume

                        // --- CONNECT GRAPH ---
                        // Source -> HPF -> LowShelf -> BassPeak -> Mid -> UpperMid -> HighShelf -> Compressor -> Master -> Analyser -> Out
                        source.connect(hpFilter);
                        hpFilter.connect(lowShelf);
                        lowShelf.connect(bassPeak);
                        bassPeak.connect(mid);
                        mid.connect(upperMid);
                        upperMid.connect(highShelf);
                        highShelf.connect(compressor);
                        compressor.connect(masterGain);
                        masterGain.connect(this.analyser);
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
