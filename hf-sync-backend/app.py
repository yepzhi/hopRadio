import os
import time
import threading
import glob
import random
import requests
from fastapi import FastAPI, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from queue import Queue, Full

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

# Playlist configuration
PLAYLIST_URLS = [
    "https://yepzhi-hopradio-sync.hf.space/tracks/track1.mp3", # Fallback/Example
    # You should fetch real playlist or download tracks here
]
# For this demo, we assume tracks are downloaded or we download them.
# In previous steps we had a list. Let's re-use the download logic but keep it simple.
# actually, let's play what's in the folder.

CLIENTS = []
CURRENT_LISTENERS = 0

def get_local_tracks():
    return sorted(glob.glob(os.path.join(TRACKS_DIR, "*.mp3")))

def download_track(url, filename):
    if os.path.exists(filename):
        return
    print(f"Downloading {url}...")
    try:
        r = requests.get(url, stream=True)
        with open(filename, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    except Exception as e:
        print(f"Failed to download {url}: {e}")

# Initial download of some default tracks if empty
# But wait, where do we get the user's playlist? 
# The user's playlist was in the frontend code.
# The backend needs tracks. 
# We'll assume the previous `app.py` logic downloaded them?
# I will re-implement the download list locally to be safe.
# Or better: Just serve what is there.
# If nothing is there, we need to download something.
# I'll add a few known MP3s or rely on the previous run's volume? 
# Spaces are not persistent unless configured.
# I will add the playlist array.

INITIAL_PLAYLIST = [
    {"id": "t1", "url": "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112591.mp3"},
    {"id": "t2", "url": "https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a734d5.mp3?filename=spirit-blossom-15285.mp3"},
    {"id": "t3", "url": "https://cdn.pixabay.com/download/audio/2022/04/27/audio_6ebb6d9c6d.mp3?filename=abstract-fashion-pop-109699.mp3"}
]

def setup_tracks():
    for i, track in enumerate(INITIAL_PLAYLIST):
        path = os.path.join(TRACKS_DIR, f"track_{i:03d}.mp3")
        download_track(track['url'], path)

# Broadcast Thread
def broadcast_stream():
    global CURRENT_LISTENERS
    print("Starting broadcast loop...")
    
    # 128kbps approx = 16KB/s
    CHUNK_SIZE = 8192 # 0.5s worth of audio roughly
    TARGET_DELAY = 0.5 
    
    while True:
        tracks = get_local_tracks()
        if not tracks:
            print("No tracks found! Waiting...")
            time.sleep(5)
            setup_tracks()
            continue
            
        random.shuffle(tracks)
        
        for track_path in tracks:
            print(f"Playing: {track_path}")
            try:
                with open(track_path, 'rb') as f:
                    while True:
                        start_time = time.time()
                        chunk = f.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        
                        # Broadcast to all queues
                        dead_clients = []
                        for q in CLIENTS:
                            try:
                                q.put_nowait(chunk)
                            except Full:
                                # Client lagging too much, drop? or ignore
                                pass
                            except Exception:
                                dead_clients.append(q)
                        
                        # Cleanup dead clients (if any explicit errors, usually they just disconnect)
                        
                        # Throttle to simulate realtime
                        # If we send too fast, client buffers fill up (good) but we lose 'sync'
                        # If we send too slow, buffering.
                        # We want to send slightly faster than realtime to keep buffers healthy?
                        # No, for "Live Radio" we govern the clock.
                        elapsed = time.time() - start_time
                        sleep_time = max(0, TARGET_DELAY - elapsed)
                        time.sleep(sleep_time)
                        
            except Exception as e:
                print(f"Error playing track {track_path}: {e}")
                time.sleep(1)

# Background Loop
threading.Thread(target=setup_tracks).start()
threading.Thread(target=broadcast_stream, daemon=True).start()

@app.get("/")
def index():
    return {"status": "radio_active", "listeners": len(CLIENTS)}

@app.get("/stream")
def stream_audio():
    def event_stream():
        q = Queue(maxsize=10) # Small buffer per client to keep them close to live head
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
            print(f"Client removed. Total: {len(CLIENTS)}")

    return StreamingResponse(event_stream(), media_type="audio/mpeg")
