import { Howl, Howler } from 'howler';

// Initial mocked playlist for development
// Weights: 1 (rare) to 10 (frequent)
const INITIAL_PLAYLIST = [
    { id: 1, type: 'music', artist: 'Neon Dreams', title: 'Cyber Pulse', src: '/tracks/song1.mp3', weight: 8 },
    { id: 2, type: 'music', artist: 'Retro Wave', title: 'Night Drive', src: '/tracks/song2.mp3', weight: 5 },
    { id: 3, type: 'music', artist: 'Synth City', title: 'Mainframe Access', src: '/tracks/song3.mp3', weight: 3 },
    { id: 4, type: 'jingle', artist: 'hopRadio', title: 'Station ID', src: '/tracks/jingle1.mp3', weight: 0 }, // Jingles handled separately usually, or low weight
    { id: 5, type: 'ad', artist: 'Sponsor', title: 'Tech Store', src: '/tracks/ad1.mp3', weight: 0 },
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
}

export const radio = new RadioEngine();
