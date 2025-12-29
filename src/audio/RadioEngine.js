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

        // Synthesizing the Classic Hip-Hop "Ahhh" Scratch
        // To make it sound like a record and not just noise, we need FORMANT FILTERS.
        // The "Ahhh" vowel has specific resonance peaks (F1: ~700Hz, F2: ~1200Hz, F3: ~2500Hz).

        const t = ctx.currentTime;

        const playScratchSlice = (startTime, duration, startRate, endRate, volume) => {
            // Source: Pink Noise (better spectrum for vinyl than white noise)
            const bufferSize = ctx.sampleRate * duration;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);

            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                data[i] *= 0.8; // Normalize pink noise
                b6 = white * 0.115926;
            }

            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            // --- FORMANT FILTER BANK ("Voice" Shaping) ---
            // F1 (Ahhh - 700Hz)
            const f1 = ctx.createBiquadFilter();
            f1.type = 'bandpass';
            f1.frequency.value = 700;
            f1.Q.value = 3.0;

            // F2 (Ahhh - 1200Hz)
            const f2 = ctx.createBiquadFilter();
            f2.type = 'bandpass';
            f2.frequency.value = 1200;
            f2.Q.value = 3.5;

            // F3 (Ahhh - 2600Hz)
            const f3 = ctx.createBiquadFilter();
            f3.type = 'bandpass';
            f3.frequency.value = 2600;
            f3.Q.value = 4.0;

            // Parallel connection for formants
            const formantInput = ctx.createGain();
            const formantOutput = ctx.createGain();

            formantInput.connect(f1);
            formantInput.connect(f2);
            formantInput.connect(f3);
            f1.connect(formantOutput);
            f2.connect(formantOutput);
            f3.connect(formantOutput);

            // Resonant Filter (Vinyl Movement "Wah") - Applied AFTER formants
            const movementFilter = ctx.createBiquadFilter();
            movementFilter.type = 'lowpass';
            movementFilter.Q.value = 1.0;

            const gainNode = ctx.createGain();

            // --- ENVELOPES ---

            // 1. Playback Rate (The actual scratch push/pull)
            // Simulates the hand stopping the record and pushing it
            noise.playbackRate.setValueAtTime(startRate, startTime);
            noise.playbackRate.linearRampToValueAtTime(endRate, startTime + duration);

            // 2. Filter Sweep (Vinyl speed effect on formants)
            // As playing faster, formants shift up slightly
            movementFilter.frequency.setValueAtTime(startRate * 800, startTime);
            movementFilter.frequency.exponentialRampToValueAtTime(endRate * 800, startTime + duration);

            // 3. Volume (Crossfader cut)
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
            gainNode.gain.linearRampToValueAtTime(volume * 0.6, startTime + (duration * 0.6));
            gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

            // Connect Graph
            noise.connect(formantInput);
            formantOutput.connect(movementFilter);
            movementFilter.connect(gainNode);
            gainNode.connect(ctx.destination);

            noise.start(startTime);
        };

        // "Wiki-Wiki" Pattern:
        // 1. "Forward" (Sharp)
        playScratchSlice(t, 0.09, 1.2, 2.8, 0.5);
        // 2. "Back" (Drag)
        playScratchSlice(t + 0.10, 0.14, 2.2, 0.4, 0.5);
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
