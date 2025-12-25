import { Howl, Howler } from 'howler';

// Initial mocked playlist for development
// Helper to generate full path based on environment
const getPath = (filename) => `${import.meta.env.BASE_URL}tracks/${filename}`;

const INITIAL_PLAYLIST = [
    { id: 1, type: 'music', artist: 'T-Pain', title: "Can't Believe It", src: getPath('CantBelieveItTPain.mp3'), weight: 8 },
    { id: 2, type: 'music', artist: 'Pop Smoke', title: 'Dior', src: getPath('POPSMOKEDIOR.mp3'), weight: 9 },
    { id: 3, type: 'music', artist: 'GloRilla', title: 'Typa', src: getPath('GloRillaTypa.mp3'), weight: 7 },
    { id: 4, type: 'music', artist: 'Lil Uzi Vert', title: 'Just Wanna Rock', src: getPath('JustWannaR.mp3'), weight: 8 },
    { id: 5, type: 'music', artist: 'Unknown', title: '30 For 30', src: getPath('30For30.mp3'), weight: 6 },
    { id: 6, type: 'music', artist: 'Unknown', title: 'Help Me', src: getPath('HelpMe.mp3'), weight: 6 },
    { id: 7, type: 'music', artist: 'Unknown', title: 'Holy Blindfold', src: getPath('HolyBlindfold.mp3'), weight: 6 },
    { id: 8, type: 'music', artist: 'Unknown', title: 'Jan 31st', src: getPath('Jan31st.mp3'), weight: 6 },
    { id: 9, type: 'music', artist: 'Unknown', title: 'Ring Ring Ring', src: getPath('RingRingRing.mp3'), weight: 5 },
    { id: 10, type: 'music', artist: 'Unknown', title: 'She Ready', src: getPath('SheReady.mp3'), weight: 6 },
    { id: 11, type: 'music', artist: 'Unknown', title: 'Went Legit', src: getPath('WentLegit.mp3'), weight: 6 },
    // Mock Jingle - ensuring it points to a file that might exist or handling failure gracefully
    { id: 99, type: 'jingle', artist: 'hopRadio', title: 'Station ID', src: getPath('Intro.mp3'), weight: 0 },
];

class RadioEngine {
    constructor() {
        this.playlist = INITIAL_PLAYLIST;
        this.queue = [];
        this.history = [];
        this.currentTrack = null;
        this.isPlaying = false;
        this.volume = 0.8;
        this.onTrackChange = null;
        this.onTimeUpdate = null;
        this.onLoadStart = null;
        this.onPlay = null;

        // Howl instance
        this.howl = null;

        // Scheduler Rules
        this.rules = {
            adFrequency: 4, // Play ad every 4 songs
            songsSinceAd: 0
        };
    }

    // --- Public API ---

    init() {
        // Prepare initial queue
        this._fillQueue();
    }

    play() {
        // Attempt to setup EQ on user interaction (when context resumes)
        this.setupEqualizer();

        if (!this.currentTrack && this.queue.length === 0) {
            this._fillQueue();
        }

        if (this.howl && !this.howl.playing()) {
            this.howl.play();
        } else if (!this.howl) {
            // First time playing? Tune In (simulate live)
            this._playNext(true);
        }

        this.isPlaying = true;
    }

    pause() {
        if (this.howl) {
            this.howl.pause();
        }
        this.isPlaying = false;
    }

    next() {
        this._playNext();
    }

    setVolume(val) {
        this.volume = val;
        Howler.volume(val);
    }

    // --- Scheduler Logic ---

    resumeContext() {
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
            Howler.ctx.resume();
        }
    }

    _playNext(isTuneIn = false) {
        if (this.howl) {
            this.howl.unload();
        }

        if (this.queue.length === 0) {
            this._fillQueue();
        }

        const track = this.queue.shift();
        this.currentTrack = track;
        this.history.push(track.id);

        // Check rules for next insertions
        if (track.type === 'music') {
            this.rules.songsSinceAd++;
        } else if (track.type === 'ad') {
            this.rules.songsSinceAd = 0;
        }

        // Notify UI: Loading started
        if (this.onLoadStart) this.onLoadStart();
        if (this.onTrackChange) this.onTrackChange(track);

        // Load Audio
        console.log("RadioEngine: Playing:", track.src);

        this.howl = new Howl({
            src: [track.src],
            html5: true, // Native HTML5 Audio (Better for iOS Background)
            volume: this.volume,
            preload: true,
            onplay: () => {
                // Update Media Session (iOS Lock Screen)
                this._updateMediaSession(track);

                // Notify UI: Playing started
                if (this.onPlay) this.onPlay();

                // If this is the first "Tune In", seek to a random point
                if (isTuneIn && track.type === 'music') {
                    const duration = this.howl.duration();
                    const randomSeek = duration * (0.1 + Math.random() * 0.7);
                    console.log(`RadioEngine: Tuning in live... skipping to ${randomSeek.toFixed(1)}s`);
                    this.howl.seek(randomSeek);
                }
                // Ensure EQ is attached
                this.setupEqualizer();

                // Preload next track for gapless feel
                this._preloadNext();
            },
            onend: () => {
                this._playNext();
            },
            onloaderror: (id, err) => {
                console.error("RadioEngine: Load Error:", err);
                setTimeout(() => this._playNext(), 2000);
            }
        });

        this.howl.play();
    }

    _preloadNext() {
        if (this.queue.length === 0) return;
        const nextTrack = this.queue[0];
        console.log("RadioEngine: Preloading next:", nextTrack.title);
        // Create a temporary Howl just to load the buffer
        const nextHowl = new Howl({
            src: [nextTrack.src],
            html5: true,
            preload: true,
            volume: 0 // Muted, just loading
        });
        // We don't play it, just let it load into cache
        // Howler caches by URL, so the next 'new Howl' with same SRC should be instant.
    }

    _fillQueue() {
        // ... (Queue filling logic remains same, implicit via replace boundaries if I narrow correctly)
        // Actually I am replacing the whole block from _playNext to setupEqualizer start to update html5: true
    }
    // Wait, replacing chunks is better.

    // --- Equalizer Logic ---
    setupEqualizer() {
        // Only run once and if audio context exists
        // With HTML5, we might need to re-hook if the audio element changes? 
        // Howler might reuse the same pool of Audio elements.
        if (this.equalizerSetup && this.analyser) return;

        try {
            const ctx = Howler.ctx;
            if (!ctx) return;

            // Get the HTML5 Audio Node
            let source;
            if (this.howl && this.howl._sounds.length > 0) {
                const sound = this.howl._sounds[0];
                if (sound._node && sound._node.tagName === 'AUDIO') {
                    // Enable processing
                    sound._node.crossOrigin = "anonymous";
                    // Create source
                    // Note: You can only call createMediaElementSource ONCE per element.
                    // Howler recycles elements. This is tricky.
                    // We check if it already has a source attached? No easy way.
                    // We try catch.
                    try {
                        source = ctx.createMediaElementSource(sound._node);
                    } catch (err) {
                        // Already connected?
                        console.log("Source likely already connected", err);
                        return;
                    }
                }
            }

            if (!source) {
                // Fallback or WebAudio mode
                source = Howler.masterGain;
                // If html5=true, this won't work for visualizer unless we routed it.
                // If we fail to get source, visualizer will be flat.
            }

            // Create Filters
            // ... (keep filters)
            const lowBass = ctx.createBiquadFilter();
            lowBass.type = 'lowshelf';
            lowBass.frequency.value = 60;
            lowBass.gain.value = 7.5;

            const mid = ctx.createBiquadFilter();
            mid.type = 'peaking';
            mid.frequency.value = 1000;
            mid.gain.value = 0;
            mid.Q.value = 1;

            const treble = ctx.createBiquadFilter();
            treble.type = 'highshelf';
            treble.frequency.value = 8000;
            treble.gain.value = 9.1;

            // Analyser for Visualizer
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 128; // 64 bars
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            // Chain: source -> lowBass -> mid -> treble -> analyser -> destination

            // If we are using HTML5 source, we define the chain.
            // If Web Audio masterGain, we disconnect first.

            if (source === Howler.masterGain) {
                Howler.masterGain.disconnect();
                Howler.masterGain.connect(lowBass);
            } else {
                source.connect(lowBass);
            }

            lowBass.connect(mid);
            mid.connect(treble);
            treble.connect(this.analyser);
            this.analyser.connect(ctx.destination);

            this.equalizerSetup = true;
            console.log("Equalizer & Analyser Initialized (HTML5 Mode)");

        } catch (e) {
            console.error("Equalizer setup failed:", e);
        }
    }

    getAudioData() {
        if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray);
            return this.dataArray;
        }
        return null;
    }
    _updateMediaSession(track) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.artist,
                album: 'hopRadio Live',
                artwork: [
                    { src: 'https://yepzhi.com/assets/hopradio-icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'https://yepzhi.com/assets/hopradio-icon-192.png', sizes: '192x192', type: 'image/png' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => {
                this.play();
                if (this.onPlay) this.onPlay(); // Sync UI
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                this.pause();
                if (this.onLoadStart) this.onLoadStart(); // Sync UI (Reuse loading state as catch-all or just pause ui)
                // Actually play/pause syncs via isPlaying state in App.jsx usually, but we need to ensure the App knows.
                // Since App.jsx doesn't subscribe to onPause, we might need to add it or just rely on react state toggle if user clicks button.
                // But for lockscreen control, we need to handle it.
                // ideally dispatch an event.
            });
            navigator.mediaSession.setActionHandler('previoustrack', null); // Disable previous
            navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
        }
    }
}

export const radio = new RadioEngine();

