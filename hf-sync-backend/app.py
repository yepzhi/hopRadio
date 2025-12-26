import os
import time
import threading
import glob
import random
import requests
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from queue import Queue, Full, Empty

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TRACKS_DIR = "tracks"
os.makedirs(TRACKS_DIR, exist_ok=True)

# Correct Playlist with Weights
# Source: https://yepzhi.com/hopRadio/tracks/
PLAYLIST = [
    {"id": "t1", "title": "Can't Believe It", "artist": "T-Pain", "file": "CantBelieveItTPain.mp3", "weight": 8},
    {"id": "t2", "title": "Dior", "artist": "Pop Smoke", "file": "POPSMOKEDIOR.mp3", "weight": 9},
    {"id": "t3", "title": "Typa", "artist": "GloRilla", "file": "GloRillaTypa.mp3", "weight": 7},
    {"id": "t4", "title": "Just Wanna Rock", "artist": "Lil Uzi Vert", "file": "JustWannaR.mp3", "weight": 8},
    {"id": "t5", "title": "30 For 30", "artist": "Unknown", "file": "30For30.mp3", "weight": 6},
    {"id": "t6", "title": "Help Me", "artist": "Unknown", "file": "HelpMe.mp3", "weight": 6},
    {"id": "t7", "title": "Holy Blindfold", "artist": "Unknown", "file": "HolyBlindfold.mp3", "weight": 6},
    {"id": "t8", "title": "Jan 31st", "artist": "Unknown", "file": "Jan31st.mp3", "weight": 6},
    {"id": "t9", "title": "Ring Ring Ring", "artist": "Unknown", "file": "RingRingRing.mp3", "weight": 5},
    {"id": "t10", "title": "She Ready", "artist": "Unknown", "file": "SheReady.mp3", "weight": 6},
    {"id": "t11", "title": "Went Legit", "artist": "Unknown", "file": "WentLegit.mp3", "weight": 6},
    {"id": "j1", "title": "Station ID", "artist": "hopRadio", "file": "Intro.mp3", "weight": 2} # Low weight but present
]

CLIENTS = []
CURRENT_TRACK_INFO = {"title": "Connecting...", "artist": "hopRadio"}

def download_track(filename):
    url = f"https://yepzhi.com/hopRadio/tracks/{filename}"
    local_path = os.path.join(TRACKS_DIR, filename)
    
    if os.path.exists(local_path):
        return local_path
        
    print(f"Downloading {filename}...")
    try:
        r = requests.get(url, stream=True)
        if r.status_code == 200:
            with open(local_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=65536):
                    f.write(chunk)
            return local_path
        else:
            print(f"Failed to download {url}: {r.status_code}")
    except Exception as e:
        print(f"Error downloading {filename}: {e}")
    return None

def setup_tracks():
    print("Pre-loading tracks...")
    for t in PLAYLIST:
        download_track(t['file'])

def select_next_track():
    # Weighted Random Selection
    total_weight = sum(t['weight'] for t in PLAYLIST)
    r = random.uniform(0, total_weight)
    uptime = 0
    for t in PLAYLIST:
        if r < uptime + t['weight']:
            return t
        uptime += t['weight']
    return PLAYLIST[0]

# Broadcast Thread
def broadcast_stream():
    global CURRENT_TRACK_INFO
    print("Starting broadcast loop...")
    
    # 64KB chunks for network efficiency
    CHUNK_SIZE = 64 * 1024 
    # MP3 128kbps = 16KB/s. 64KB = ~4 seconds of audio.
    # WAIT! 4 seconds is too choppy for latency updates.
    # Let's use smaller chunks for smoother flow?
    # 4KB = 0.25s. Good balance.
    CHUNK_SIZE = 4096 
    BITRATE_BYTES_PER_SEC = 16000 # Approx for 128kbps, but MP3 VBR varies.
    # We shouldn't rely on bitrate math. We should flood user buffer slightly.
    # But if we flood too much, server memory explodes? No.
    # We control the rate.
    
    # Precise Timing Variables
    target_time = time.time()
    
    while True:
        track = select_next_track()
        local_path = download_track(track['file']) # Ensure exists
        
        if not local_path:
            time.sleep(1)
            continue
            
        print(f"Now Playing: {track['title']}")
        CURRENT_TRACK_INFO = track
        
        try:
            with open(local_path, 'rb') as f:
                while True:
                    # Drift Correction: Calculate when we SHOULD be done sending this chunk
                    # But we don't know exact duration of chunk in seconds easily without parsing MP3.
                    # Approximation: 4096 bytes / 16000 B/s = ~0.256s
                    # We will speed up slightly (play 0.95x duration) to ensure buffer fill.
                    
                    chunk = f.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    
                    # Approximate duration of this chunk
                    # 128kbps = 16KB/s. 
                    # Duration = len(chunk) / 16000
                    chunk_duration = len(chunk) / 16000.0
                    
                    # Send to clients
                    dead_clients = []
                    for q in CLIENTS:
                        try:
                            if q.full():
                                # Client lagging. Drop oldest to make room for new (Live Sync)
                                try:
                                    q.get_nowait()
                                except Empty:
                                    pass
                            q.put_nowait(chunk)
                        except Exception:
                            dead_clients.append(q)
                    
                    # Cleanup
                    for q in dead_clients:
                        if q in CLIENTS:
                            CLIENTS.remove(q)

                    # Timing
                    target_time += (chunk_duration * 0.95) # Go 5% faster than realtime to fill buffers
                    
                    # Sleep until target time
                    now = time.time()
                    delay = target_time - now
                    
                    if delay > 0:
                        time.sleep(delay)
                    else:
                        # We are behind! Don't sleep, just catch up.
                        # If we are WAY behind, reset target to now to avoid burst
                        if delay < -5.0:
                            target_time = now
                            
        except Exception as e:
            print(f"Playback error: {e}")
            time.sleep(1)

# Background Loop
threading.Thread(target=setup_tracks).start()
threading.Thread(target=broadcast_stream, daemon=True).start()

@app.get("/")
def index():
    return {
        "status": "radio_active", 
        "listeners": len(CLIENTS),
        "now_playing": CURRENT_TRACK_INFO
    }

@app.get("/stream")
def stream_audio():
    def event_stream():
        # Large buffer (approx 60s of audio) to absorb network jitter
        # 4096 bytes * 250 = ~1MB
        q = Queue(maxsize=250) 
        CLIENTS.append(q)
        print(f"Client connected. Total: {len(CLIENTS)}")
        try:
            while True:
                chunk = q.get()
                yield chunk
        except Exception as e:
            print(f"Client disconnected: {e}")
        finally:
            if q in CLIENTS:
                CLIENTS.remove(q)

    return StreamingResponse(event_stream(), media_type="audio/mpeg")
