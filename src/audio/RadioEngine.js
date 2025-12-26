import { Howl, Howler } from 'howler';
import { getSilentAudioDataUrl } from './silentAudio.js';
import { set, get } from 'idb-keyval'; // Persistent storage for blobs

// Initial mocked playlist for development
// Helper to generate full path based on environment
const BASE = import.meta.env.BASE_URL || '/';
const getPath = (filename) => `${BASE}tracks/${filename}`;

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
        this.volume = 0.6; // Reduced from 0.8
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

        // Audio Graph Components
        this.context = null;
        this.masterGain = null;
        this.analyser = null;
        this.filters = {};
        this.isGraphInit = false;
        this.inputGain = null; // New input gain node for our graph
        this.masterGainHooked = false; // To track if Howler.masterGain has been redirected

        // iOS Silent Audio Persistence
        this.silentHowl = null;
        this.videoTrickElement = null;
        this.pipStreamDestination = null;
    }

    // --- Public API ---

    init() {
        // Prepare initial queue
        this._fillQueue();
        // Setup iOS-specific audio persistence
        this._setupIOSAudioPersistence();
    }

    // New Method: Real Offline Download
    async downloadOfflineMix(onProgress) {
        let completed = 0;
        const total = this.playlist.length;
        console.log(`RadioEngine: Starting offline download for ${total} tracks...`);

        for (const track of this.playlist) {
            try {
                // Check if already exists
                const existing = await get(track.src);
                if (!existing) {
                    const response = await fetch(track.src);
                    const blob = await response.blob();
                    await set(track.src, blob);
                }
                completed++;
                if (onProgress) onProgress(Math.floor((completed / total) * 100));
            } catch (err) {
                console.error(`RadioEngine: Failed to download ${track.title}`, err);
            }
        }
        console.log("RadioEngine: Offline download complete!");
    }

    _initAudioGraph() {
        if (this.isGraphInit) return;
        if (!Howler.ctx) return;

        console.log("RadioEngine: Initializing Static Audio Graph...");
        const ctx = Howler.ctx;
        this.context = ctx;

        // Create EQ Filters
        const lowBass = ctx.createBiquadFilter();
        lowBass.type = 'lowshelf';
        lowBass.frequency.value = 60;
        lowBass.gain.value = 5.5; // Reduced from 6.5 to prevent distortion

        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.gain.value = 0;
        mid.Q.value = 1;

        const treble = ctx.createBiquadFilter();
        treble.type = 'highshelf';
        treble.frequency.value = 8000;
        treble.gain.value = 7.5; // Reduced from 9.1

        // Analyser
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 128;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        // Input Point (for routing sources into)
        this.inputGain = ctx.createGain();

        // Connect Chain: input -> lowBass -> mid -> treble -> analyser -> destination
        this.inputGain.connect(lowBass);
        lowBass.connect(mid);
        mid.connect(treble);
        treble.connect(this.analyser);
        this.analyser.connect(ctx.destination);

        this.isGraphInit = true;
    }

    play() {
        // Attempt to setup EQ on user interaction
        this._initAudioGraph();
        this.resumeContext();

        // iOS 26: Start silent audio loop to keep audio session alive
        this._startSilentLoop();

        if (!this.currentTrack && this.queue.length === 0) {
            this._fillQueue();
        }

        if (this.howl && !this.howl.playing()) {
            this.howl.play();
        } else if (!this.howl) {
            this._playNext(true);
        }

        this.isPlaying = true;
    }

    pause() {
        if (this.howl) {
            this.howl.pause();
        }
        this.isPlaying = false;
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
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

    async _playNext(isTuneIn = false) {
        if (this.howl) {
            this.howl.unload();
            if (this.currentTrack && this.currentTrack.blobUrl) {
                URL.revokeObjectURL(this.currentTrack.blobUrl); // Cleanup
            }
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

        // Load Audio - Check Offline Cache First
        let src = track.src;
        try {
            const blob = await get(track.src);
            if (blob) {
                const blobUrl = URL.createObjectURL(blob);
                src = blobUrl;
                track.blobUrl = blobUrl; // Tracking for cleanup
                console.log("RadioEngine: Playing from Offline Cache!", track.title);
            } else {
                console.log("RadioEngine: Playing from Network:", track.src);
            }
        } catch (e) {
            console.warn("RadioEngine: Cache check failed, using network", e);
        }

        this.howl = new Howl({
            src: [src],
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

                // Connect Audio to Graph
                this._connectToGraph();

                // Preload next track for gapless feel
                this._preloadNext();
            },
            onload: () => {
                // DIRECT DOM MANIPULATION FOR iOS 26
                // Howler creates an HTML5 Audio element but doesn't expose strict attributes we need for background video-like behavior
                try {
                    const audioNode = this.howl._sounds[0]._node;
                    if (audioNode) {
                        audioNode.setAttribute('playsinline', 'true');
                        audioNode.setAttribute('webkit-playsinline', 'true');
                        audioNode.setAttribute('x-webkit-airplay', 'allow');
                        audioNode.preload = 'auto'; // Force buffer
                        console.log("RadioEngine: Injected iOS attributes into audio node");
                    }
                } catch (e) {
                    console.warn("RadioEngine: Failed to inject iOS attributes", e);
                }
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
        new Howl({
            src: [nextTrack.src],
            html5: true,
            preload: true,
            volume: 0 // Muted, just loading
        });
        // We don't play it, just let it load into cache
        // Howler caches by URL, so the next 'new Howl' with same SRC should be instant.
    }

    _fillQueue() {
        // Simple weighted random selection
        if (this.rules.songsSinceAd >= this.rules.adFrequency) {
            const ads = this.playlist.filter(t => t.type === 'ad');
            if (ads.length > 0) {
                this.queue.push(ads[Math.floor(Math.random() * ads.length)]);
                this.rules.songsSinceAd = 0;
                return;
            }
        }

        const music = this.playlist.filter(t => t.type === 'music');
        let pool = [];
        music.forEach(track => {
            for (let i = 0; i < track.weight; i++) pool.push(track);
        });

        for (let i = 0; i < 5; i++) {
            const randomTrack = pool[Math.floor(Math.random() * pool.length)];
            if (this.queue.length > 0 && this.queue[this.queue.length - 1].id === randomTrack.id) {
                i--; continue;
            }
            this.queue.push(randomTrack);

            if (Math.random() < 0.3) {
                const jingles = this.playlist.filter(t => t.type === 'jingle');
                if (jingles.length > 0) {
                    this.queue.push(jingles[Math.floor(Math.random() * jingles.length)]);
                }
            }
        }
    }

    // --- Equalizer & Graph Connection ---
    _connectToGraph() {
        this._initAudioGraph(); // Ensure graph exists
        if (!this.inputGain) return; // Should exist

        try {
            const ctx = Howler.ctx;
            // 1. Get HTML5 Node
            let sourceNode = null;
            if (this.howl && this.howl._sounds.length > 0) {
                const sound = this.howl._sounds[0];
                if (sound._node && sound._node.tagName === 'AUDIO') {
                    // Check if we already attached a source to this element
                    if (!sound._node._webAudioSource) {
                        sound._node.crossOrigin = "anonymous";
                        try {
                            sound._node._webAudioSource = ctx.createMediaElementSource(sound._node);
                        } catch (e) {
                            console.warn("RadioEngine: Failed to create source (already exists?)", e);
                        }
                    }
                    sourceNode = sound._node._webAudioSource;
                }
            }

            // 2. Connect
            if (sourceNode) {
                // Connect to our graph
                // Note: MediaElementSource can fan out, but we just need one connection to our InputGain.
                // We disconnect first to be safe? No, disconnect() disconnects ALL.
                // It's safe to connect multiple times, but let's avoid it.
                // We can't easily check connection.
                try {
                    sourceNode.connect(this.inputGain);
                } catch (e) {
                    // ignore
                }
            } else {
                // Web Audio Mode fallback (Howler.masterGain)
                // If we are in Web Audio mode (html5: false), sound flows through masterGain.
                // We want to redirect masterGain -> our graph.
                if (!this.masterGainHooked) {
                    Howler.masterGain.disconnect();
                    Howler.masterGain.connect(this.inputGain);
                    this.masterGainHooked = true;
                }
            }
            // console.log("RadioEngine: Connected to Graph");

        } catch (e) {
            console.error("RadioEngine: Audio Graph Error:", e);
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
                    { src: 'https://yepzhi.com/hopRadio/logo.svg', sizes: '512x512', type: 'image/svg+xml' }
                ]
            });

            // CRITICAL for iOS: Set playback state explicitly
            navigator.mediaSession.playbackState = 'playing';

            // Set position state (helps iOS understand track duration)
            if (this.howl && this.howl.duration()) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: this.howl.duration(),
                        playbackRate: 1,
                        position: this.howl.seek() || 0
                    });
                } catch (e) {
                    console.log('Position state not supported');
                }
            }

            // Action handlers - bound to this instance
            const self = this;
            navigator.mediaSession.setActionHandler('play', () => {
                console.log('MediaSession: play action received');
                self.resumeContext();
                if (self.howl) {
                    self.howl.play();
                    self.isPlaying = true;
                    navigator.mediaSession.playbackState = 'playing';
                    if (self.onPlay) self.onPlay();
                }
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                console.log('MediaSession: pause action received');
                if (self.howl) {
                    self.howl.pause();
                    self.isPlaying = false;
                    navigator.mediaSession.playbackState = 'paused';
                }
            });
            navigator.mediaSession.setActionHandler('previoustrack', null);
            navigator.mediaSession.setActionHandler('nexttrack', () => self.next());
            navigator.mediaSession.setActionHandler('seekbackward', null);
            navigator.mediaSession.setActionHandler('seekforward', null);
            navigator.mediaSession.setActionHandler('seekto', null);
        }
    }

    // iOS-specific: Keep audio context alive
    _setupIOSAudioPersistence() {
        // Resume context on visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isPlaying) {
                this.resumeContext();
                // Try to resume playback if it was interrupted
                if (this.howl && !this.howl.playing()) {
                    this.howl.play();
                }
            }
        });

        // Periodic keepalive to prevent iOS from killing the audio context
        setInterval(() => {
            if (this.isPlaying && Howler.ctx) {
                this.resumeContext();
            }
        }, 5000); // Every 5 seconds
    }

    // iOS 26: Silent audio loop to trick iOS into keeping audio session alive
    _startSilentLoop() {
        if (this.silentHowl) return; // Already running

        console.log("RadioEngine: Starting silent audio loop for iOS 26 persistence");
        this.silentHowl = new Howl({
            src: [getSilentAudioDataUrl()],
            html5: true,
            loop: true,
            volume: 0.001, // Nearly inaudible but not zero (iOS may ignore zero volume)
            preload: true
        });
        this.silentHowl.play();

        // iOS 26 Extra: Create a MediaStream video element trick
        this._setupMediaStreamVideoTrick();
    }

    // iOS 26: Route audio through MediaStreamDestination -> video element
    // Safari treats video media elements more favorably for background audio
    _setupMediaStreamVideoTrick() {
        if (this.videoTrickElement) return; // Already setup

        try {
            const ctx = Howler.ctx;
            if (!ctx) return;

            // Create a MediaStreamDestination
            const destination = ctx.createMediaStreamDestination();
            this.pipStreamDestination = destination; // Store for cleanup

            // Connect our audio graph output to it (in addition to speakers)
            if (this.analyser) {
                this.analyser.connect(destination);
            }

            // Create a video element and set its srcObject to the stream
            // We make it 1x1 pixel and visible (opacity 0) so it's technically "visible" to the DOM, which helps PiP
            const video = document.createElement('video');
            video.width = 1;
            video.height = 1;
            video.style.position = 'fixed';
            video.style.bottom = '0';
            video.style.right = '0';
            video.style.opacity = '0.01'; // Not display:none
            video.style.pointerEvents = 'none';
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.muted = false; // Important: NOT muted
            video.srcObject = destination.stream;

            document.body.appendChild(video);

            // Start the video (this registers as "media playback" to iOS)
            video.play().catch(() => console.log("Video trick play failed"));

            this.videoTrickElement = video;
            console.log("RadioEngine: MediaStream video trick initialized for iOS 26");

        } catch (e) {
            console.warn("RadioEngine: MediaStream video trick failed:", e);
        }
    }

    _stopSilentLoop() {
        if (this.silentHowl) {
            this.silentHowl.stop();
            this.silentHowl.unload();
            this.silentHowl = null;
        }

        // Cleanup Video Trick to prevents feedback loops
        if (this.videoTrickElement) {
            this.videoTrickElement.pause();
            this.videoTrickElement.srcObject = null;
            this.videoTrickElement.remove();
            this.videoTrickElement = null;
        }

        // Disconnect analyser from destination
        if (this.analyser && this.pipStreamDestination) {
            try {
                this.analyser.disconnect(this.pipStreamDestination);
            } catch (e) {
                console.warn("RadioEngine: Failed to disconnect analyser", e);
            }
            this.pipStreamDestination = null;
        }
    }

    // Public method for UI to trigger PiP (Must be called from user gesture)
    requestPiP() {
        // Ensure video element exists
        if (!this.videoTrickElement) {
            console.log('RadioEngine: Creating video element for PiP request');
            this._setupMediaStreamVideoTrick();
        }

        if (this.videoTrickElement && this.videoTrickElement.requestPictureInPicture) {
            this.videoTrickElement.requestPictureInPicture()
                .then(() => console.log('PiP activated!'))
                .catch(e => {
                    console.error('PiP failed:', e);
                    // Fallback: alert user
                    alert('Background mode not available. Try installing the app to your home screen.');
                });
        } else {
            console.warn('RadioEngine: PiP not supported');
            alert('Background mode not supported on this device/browser.');
        }
    }
}

export const radio = new RadioEngine();
