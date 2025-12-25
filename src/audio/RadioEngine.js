import { Howl, Howler } from 'howler';

// Initial mocked playlist for development
// Weights: 1 (rare) to 10 (frequent)
const INITIAL_PLAYLIST = [
    { id: 1, type: 'music', artist: 'T-Pain', title: "Can't Believe It", src: '/hopRadio/tracks/CantBelieveItTPain.mp3', weight: 8 },
    { id: 2, type: 'music', artist: 'Pop Smoke', title: 'Dior', src: '/hopRadio/tracks/POPSMOKEDIOR.mp3', weight: 9 },
    { id: 3, type: 'music', artist: 'GloRilla', title: 'Typa', src: '/hopRadio/tracks/GloRillaTypa.mp3', weight: 7 },
    { id: 4, type: 'music', artist: 'Lil Uzi Vert', title: 'Just Wanna Rock', src: '/hopRadio/tracks/JustWannaR.mp3', weight: 8 },
    { id: 5, type: 'music', artist: 'Unknown', title: '30 For 30', src: '/hopRadio/tracks/30For30.mp3', weight: 6 },
    { id: 6, type: 'music', artist: 'Unknown', title: 'Help Me', src: '/hopRadio/tracks/HelpMe.mp3', weight: 6 },
    { id: 7, type: 'music', artist: 'Unknown', title: 'Holy Blindfold', src: '/hopRadio/tracks/HolyBlindfold.mp3', weight: 6 },
    { id: 8, type: 'music', artist: 'Unknown', title: 'Jan 31st', src: '/hopRadio/tracks/Jan31st.mp3', weight: 6 },
    { id: 9, type: 'music', artist: 'Unknown', title: 'Ring Ring Ring', src: '/hopRadio/tracks/RingRingRing.mp3', weight: 5 },
    { id: 10, type: 'music', artist: 'Unknown', title: 'She Ready', src: '/hopRadio/tracks/SheReady.mp3', weight: 6 },
    { id: 11, type: 'music', artist: 'Unknown', title: 'Went Legit', src: '/hopRadio/tracks/WentLegit.mp3', weight: 6 },
    // Keep placeholder Jingle/Ad for logic to not break, but point to a real file or leave as mock for now (logic handles error)
    { id: 99, type: 'jingle', artist: 'hopRadio', title: 'Station ID', src: '/hopRadio/tracks/Intro.mp3', weight: 0 },
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
            this._playNext();
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

    _playNext() {
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
        // Note: For now using placeholders or real files if they exist
        // We will catch load errors to simulate generic radio if files missing
        this.howl = new Howl({
            src: [track.src],
            html5: true,
            volume: this.volume,
            onend: () => {
                this._playNext();
            },
            onloaderror: (id, err) => {
                console.warn("Load Error, skipping:", track.title, err);
                // Simulate playing for 2 seconds then skip (so UI doesn't crash in loop)
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

            // Chain: masterGain -> lowBass -> mid -> treble -> destination
            // First, disconnect masterGain from destination
            Howler.masterGain.disconnect();

            // Connect chain
            Howler.masterGain.connect(lowBass);
            lowBass.connect(mid);
            mid.connect(treble);
            treble.connect(ctx.destination);

            this.equalizerSetup = true;
            console.log("Equalizer Initialized: Punchy Bass & Crystal Clear Highs");

        } catch (e) {
            console.error("Equalizer setup failed:", e);
        }
    }
}

export const radio = new RadioEngine();
