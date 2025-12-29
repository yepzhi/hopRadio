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

        // Audio Graph
        this.context = null;
        this.analyser = null;
        this.dataArray = null;
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

    triggerScratch() {
        if (!Howler.ctx) return;
        const ctx = Howler.ctx;
        const now = ctx.currentTime;

        // 1. "Stop the Record" Effect (Ducking/Muffling the Music)
        // We duck the master volume briefly to simulate the DJ putting hand on the record
        const originalVolume = Howler.volume();
        Howler.volume(originalVolume * 0.2); // Drop to 20%

        // Schedule restore
        setTimeout(() => {
            Howler.volume(originalVolume); // Restore smoothly? Howler handles ramps poorly globally, instantaneous is safer for "release"
        }, 250); // 250ms mute

        // 2. Synthesize a Brighter, Cleaner Scratch (FM Chirp)
        // Instead of muddy noise, we use a Sawtooth wave with extreme pitch modulation (Chirp)
        // This cuts through clearly like a digital scratch sample.

        const playScratchChirp = (startTime, duration, startFreq, endFreq, vol) => {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth'; // Sawtooth has harmonics (buzz), clearer than noise

            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass'; // Remove mud
            filter.frequency.value = 800;

            // Pitch Envelope (The "Scratch" movement)
            osc.frequency.setValueAtTime(startFreq, startTime);
            osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

            // Volume Envelope
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
            gain.gain.linearRampToValueAtTime(0, startTime + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        // Movement 1: Forward (Sharp High Chirp) "Wiki"
        playScratchChirp(now, 0.08, 1000, 3000, 0.3);

        // Movement 2: Backward (Lower Drag) "Wiki"
        playScratchChirp(now + 0.09, 0.10, 2500, 500, 0.4);

        // Movement 3: Short Finisher
        playScratchChirp(now + 0.20, 0.05, 800, 1500, 0.2);
    }

    _playCurrentOfflineTrack() {
        if (!this.offlineQueue || this.offlineQueue.length === 0) return;

        const track = this.offlineQueue[this.offlineIndex];
        console.log("RadioEngine: Playing Offline Track", track.title);

        if (this.howl) {
            this.howl.unload();
        }

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

                        // --- EQ Restoration & "PowerHitz" Processing ---

                        // 1. Dynamics Compressor (Radio Limiter / Glue)
                        // 1. Dynamics Compressor (Radio Limiter / Glue)
                        const compressor = ctx.createDynamicsCompressor();
                        compressor.threshold.value = -12; // Standard radio threshold
                        compressor.knee.value = 10;       // Soft/Hard hybrid
                        compressor.ratio.value = 8;       // 8:1 Tight radio compression (Powerhitz style)
                        compressor.attack.value = 0.002;  // Fast attack to catch peaks
                        compressor.release.value = 0.2;

                        // 2. EQ Filters (V-Shape / "Jamz" Style)
                        // Low Shelf (Punchy Bass)
                        const lowShelf = ctx.createBiquadFilter();
                        lowShelf.type = 'lowshelf';
                        lowShelf.frequency.value = 90; // Focused punch (Kick/Bass)
                        lowShelf.gain.value = 6.0;     // +6dB (Strong but clean)

                        // Mid (Scoop - Clarity)
                        const mid = ctx.createBiquadFilter();
                        mid.type = 'peaking';
                        mid.frequency.value = 1000;
                        mid.gain.value = -4.0; // Moderate scoop to remove boxiness
                        mid.Q.value = 1.0;

                        // High Shelf (High Treble / Air - Not Harsh)
                        const highShelf = ctx.createBiquadFilter();
                        highShelf.type = 'highshelf';
                        highShelf.frequency.value = 8000; // Moved up to 8kHz for "Air" rather than 5kHz "Bite"
                        highShelf.gain.value = 7.0;       // +7dB (Sparkle without hurting ears)

                        // Master Gain (Headroom)
                        const masterGain = ctx.createGain();
                        masterGain.gain.value = 0.7; // Safe headroom after compression

                        // Connect Graph: 
                        // Source -> Low -> Mid -> High -> Compressor -> Master -> Analyser -> Destination
                        source.connect(lowShelf);
                        lowShelf.connect(mid);
                        mid.connect(highShelf);
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
