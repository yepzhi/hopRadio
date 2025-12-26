import os
import time
import threading
import glob
import random
import requests
import subprocess
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from queue import Queue, Full, Empty

from collections import deque

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
    {"id": "j1", "title": "Station ID", "artist": "hopRadio", "file": "Intro.mp3", "weight": 2}
]

CLIENTS = []
# Global Circular Buffer for Burst-on-Connect
# Stores last ~30 seconds of audio to fast-fill client buffer
# 192kbps = 24KB/s. 4KB chunks. 6 chunks/s. 200 chunks = ~33 seconds.
BURST_BUFFER = deque(maxlen=200)
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
    total_weight = sum(t['weight'] for t in PLAYLIST)
    r = random.uniform(0, total_weight)
    uptime = 0
    for t in PLAYLIST:
        if r < uptime + t['weight']:
            return t
        uptime += t['weight']
    return PLAYLIST[0]

# Broadcast Thread using FFmpeg subprocess
def broadcast_stream():
    global CURRENT_TRACK_INFO
    print("Starting FFmpeg broadcast loop...")
    
    # 4KB chunks for smooth streaming
    CHUNK_SIZE = 4096 
    
    while True:
        track = select_next_track()
        local_path = download_track(track['file'])
        
        if not local_path:
            time.sleep(1)
            continue
            
        print(f"Now Playing: {track['title']}")
        CURRENT_TRACK_INFO = track
        
        # FFmpeg Command
        cmd = [
            'ffmpeg',
            '-re', 
            '-i', local_path,
            '-f', 'mp3',
            '-b:a', '192k',
            '-bufsize', '384k', # Increase internal buffer
            '-ac', '2',
            '-ar', '44100',
            '-loglevel', 'error',
            'pipe:1'
        ]
        
        try:
            # Popen allows us to read stdout in real-time
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            while True:
                # Read chunk from FFmpeg stdout
                chunk = process.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                
                # Update Burst Buffer
                BURST_BUFFER.append(chunk)

                # Send to active clients
                dead_clients = []
                for q in CLIENTS:
                    try:
                        # Drop old if full (shouldn't happen often if clients read fast)
                        if q.full():
                            try:
                                q.get_nowait()
                            except Empty:
                                pass
                        q.put_nowait(chunk)
                    except Exception:
                        dead_clients.append(q)
                
                # Cleanup dead clients
                for q in dead_clients:
                    if q in CLIENTS:
                        CLIENTS.remove(q)
                        
            # Wait for process to finish ensuring file is done
            process.wait()
            
        except Exception as e:
            print(f"Streaming error: {e}")
            time.sleep(1)

# Background Loop
threading.Thread(target=setup_tracks).start()
threading.Thread(target=broadcast_stream, daemon=True).start()

@app.get("/")
def index():
    return {
        "status": "radio_active", 
        "quality": "192kbps CBR",
        "listeners": len(CLIENTS),
        "now_playing": CURRENT_TRACK_INFO
    }

@app.get("/stream")
def stream_audio():
    def event_stream():
        # Client Queue
        # Size = Burst Size + some headroom
        q = Queue(maxsize=300) 
        
        # BURST: Pre-fill queue with recent history so client buffer fills instantly
        # This prevents the "start starved" issue with -re streams
        backlog = list(BURST_BUFFER)
        for chunk in backlog:
            try:
                q.put_nowait(chunk)
            except Full:
                break
                
        CLIENTS.append(q)
        print(f"Client connected. Burst: {len(backlog)} chunks. Total Clients: {len(CLIENTS)}")
        
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
