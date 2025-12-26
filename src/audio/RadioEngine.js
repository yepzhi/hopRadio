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
        console.log("RadioEngine: Initializing Stream Mode");
        // Initial fake metadata
        this._updateMetadata();
    }

    _updateMetadata() {
        if (this.onTrackChange) {
            this.onTrackChange({
                title: "Live Radio",
                artist: "hopRadio",
                src: this.streamUrl,
                type: "stream",
                id: "stream"
            });
        }
    }

    play() {
        if (this.isPlaying) return;

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
            autoplay: true,
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
    }

    pause() {
        console.log("RadioEngine: Stopping Stream");
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

        // Hook into Howler HTML5 Audio Node
        // Note: This works because backend sends CORS headers
        try {
            if (this.howl && this.howl._sounds.length > 0) {
                const node = this.howl._sounds[0]._node;
                if (node) {
                    node.crossOrigin = "anonymous";
                    if (!node._source) {
                        const source = ctx.createMediaElementSource(node);
                        source.connect(this.analyser);
                        this.analyser.connect(ctx.destination);
                        node._source = source; // Cache it
                    }
                }
            }
        } catch (e) {
            console.warn("Visualizer connect failed (CORS?):", e);
        }
    }

    _setupMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: "Live Stream",
                artist: "hopRadio",
                artwork: [{ src: 'https://yepzhi.com/hopRadio/logo.svg', sizes: '512x512', type: 'image/svg+xml' }]
            });
            navigator.mediaSession.playbackState = 'playing';
            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
        }
    }
};
