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

        // Notify UI
        if (this.onTrackChange) this.onTrackChange(track);

        // Load Audio
        console.log("RadioEngine: Playing:", track.src);

        this.howl = new Howl({
            src: [track.src],
            html5: false, // Must be false for Web Audio API (Analyser/Visualizer) to work
            volume: this.volume,
            onplay: () => {
                // If this is the first "Tune In", seek to a random point to simulate live radio
                if (isTuneIn && track.type === 'music') {
                    const duration = this.howl.duration();
                    // Seek to random point between 10% and 80%
                    const randomSeek = duration * (0.1 + Math.random() * 0.7);
                    console.log(`RadioEngine: Tuning in live... skipping to ${randomSeek.toFixed(1)}s`);
                    this.howl.seek(randomSeek);
                }
                // Ensure EQ is attached
                this.setupEqualizer();
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

    _fillQueue() {
        // Simple weighted random selection
        // 1. Filter candidates (respecting rules could go here, e.g. no repeat artist)
        // 2. Select based on weight

        // If due for Ad
        if (this.rules.songsSinceAd >= this.rules.adFrequency) {
            const ads = this.playlist.filter(t => t.type === 'ad');
            if (ads.length > 0) {
                this.queue.push(ads[Math.floor(Math.random() * ads.length)]);
                this.rules.songsSinceAd = 0; // Reset counter anticipating the ad
                return;
            }
        }

        const music = this.playlist.filter(t => t.type === 'music');

        // Generate a weighted pool
        let pool = [];
        music.forEach(track => {
            for (let i = 0; i < track.weight; i++) {
                pool.push(track);
            }
        });

        // Add 5 songs to queue
        for (let i = 0; i < 5; i++) {
            const randomTrack = pool[Math.floor(Math.random() * pool.length)];
            // Basic "No back-to-back" check
            if (this.queue.length > 0 && this.queue[this.queue.length - 1].id === randomTrack.id) {
                i--; // retry
                continue;
            }
            this.queue.push(randomTrack);

            // 3. Random DJ Drop / Jingle Injection (e.g. 30% chance after a song)
            if (Math.random() < 0.3) {
                const jingles = this.playlist.filter(t => t.type === 'jingle');
                if (jingles.length > 0) {
                    const randomJingle = jingles[Math.floor(Math.random() * jingles.length)];
                    // Don't play jingle if next is Ad (optional rule)
                    this.queue.push(randomJingle);
                }
            }
        }
    }
    // --- Equalizer Logic ---
    setupEqualizer() {
        // Only run once and if audio context exists
        if (this.equalizerSetup || !Howler.ctx) return;

        try {
            const ctx = Howler.ctx;

            // Create Filters
            // Bass: LowShelf @ 60Hz. User asked for 4.5/6. 
            // Scale: 6 -> ~10dB. 4.5 -> ~7.5dB
            const lowBass = ctx.createBiquadFilter();
            lowBass.type = 'lowshelf';
            lowBass.frequency.value = 60;
            lowBass.gain.value = 7.5; // Punchy Bass

            // Mids: Peaking @ 1000Hz. User asked for 0.
            const mid = ctx.createBiquadFilter();
            mid.type = 'peaking';
            mid.frequency.value = 1000;
            mid.gain.value = 0;
            mid.Q.value = 1;

            // Highs: HighShelf @ 8000Hz. User asked for 5.5/6.
            // Scale: 6 -> ~10dB. 5.5 -> ~9.1dB
            const treble = ctx.createBiquadFilter();
            treble.type = 'highshelf';
            treble.frequency.value = 8000;
            treble.gain.value = 9.1; // Crystal Clear

            // Analyser for Visualizer
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 128; // 64 bars
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);

            // Chain: masterGain -> lowBass -> mid -> treble -> analyser -> destination
            // First, disconnect masterGain from destination
            Howler.masterGain.disconnect();

            // Connect chain
            Howler.masterGain.connect(lowBass);
            lowBass.connect(mid);
            mid.connect(treble);
            treble.connect(this.analyser);
            this.analyser.connect(ctx.destination);

            this.equalizerSetup = true;
            console.log("Equalizer & Analyser Initialized");

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
}

export const radio = new RadioEngine();

