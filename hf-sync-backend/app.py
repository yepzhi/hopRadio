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
# Track Manager Queue
READY_TRACKS = Queue(maxsize=3)

def download_track(filename):
    url = f"https://yepzhi.com/hopRadio/tracks/{filename}"
    local_path = os.path.join(TRACKS_DIR, filename)
    
    # Check if exists and valid
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return local_path
        
    print(f"Downloading {filename}...")
    try:
        r = requests.get(url, stream=True, timeout=15)
        if r.status_code == 200:
            with open(local_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=65536):
                    f.write(chunk)
            print(f"Downloaded {filename}")
            return local_path
        else:
            print(f"Failed to download {url}: {r.status_code}")
    except Exception as e:
        print(f"Error downloading {filename}: {e}")
    return None

def track_manager_loop():
    """Background thread to keep READY_TRACKS full of local files"""
    print("Track Manager started...")
    while True:
        try:
            if not READY_TRACKS.full():
                # Weighted Random Selection
                total = sum(t['weight'] for t in PLAYLIST)
                r = random.uniform(0, total)
                upto = 0
                selected_track = PLAYLIST[0]
                for t in PLAYLIST:
                    if r < upto + t['weight']:
                        selected_track = t
                        break
                    upto += t['weight']
                
                # Download (Blocking, but in this separate thread)
                path = download_track(selected_track['file'])
                if path:
                    READY_TRACKS.put({'track': selected_track, 'path': path})
                else:
                    time.sleep(2) # Retry delay if download fails
            else:
                time.sleep(1) # Wait for consumer
        except Exception as e:
            print(f"Track Manager Error: {e}")
            time.sleep(1)

# Broadcast Thread using FFmpeg subprocess
def broadcast_stream():
    global CURRENT_TRACK_INFO
    print("Starting FFmpeg broadcast loop...")
    
    # 16KB chunks to reduce overhead
    CHUNK_SIZE = 16384 
    
    while True:
        # Get next ready track (blocking if empty, but manager should keep it full)
        item = READY_TRACKS.get()
        track = item['track']
        local_path = item['path']
            
        print(f"Now Playing: {track['title']}")
        CURRENT_TRACK_INFO = track
        
        # FFmpeg Command
        cmd = [
            'ffmpeg',
            '-re', 
            '-i', local_path,
            '-f', 'mp3',
            '-b:a', '192k',
            '-bufsize', '512k',
            '-ac', '2',
            '-ar', '44100',
            '-loglevel', 'error',
            'pipe:1'
        ]
        
        try:
            # Popen allows us to read stdout in real-time
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            while True:
                # Read chunk
                chunk = process.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                
                # Update Burst Buffer
                BURST_BUFFER.append(chunk)

                # Send to active clients
                dead_clients = []
                for q in CLIENTS:
                    try:
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
                        
            process.wait()
            
        except Exception as e:
            print(f"Streaming error: {e}")
            time.sleep(1)

# Start Background Threads
threading.Thread(target=track_manager_loop, daemon=True).start()
threading.Thread(target=broadcast_stream, daemon=True).start()

@app.get("/")
def index():
    return {
        "status": "radio_active", 
        "quality": "192kbps CBR",
        "listeners": len(CLIENTS),
        "now_playing": CURRENT_TRACK_INFO,
        "queue": READY_TRACKS.qsize()
    }

@app.get("/stream")
def stream_audio():
    def event_stream():
        # Large Client Queue to absorb jitters
        q = Queue(maxsize=500) 
        
        # BURST: Pre-fill
        backlog = list(BURST_BUFFER)
        for chunk in backlog:
            try:
                q.put_nowait(chunk)
            except Full:
                break
                
        CLIENTS.append(q)
        print(f"Client connected. Burst: {len(backlog)}. Total: {len(CLIENTS)}")
        
        try:
            while True:
                chunk = q.get()
                yield chunk
        except Exception as e:
            print(f"Client disconnected: {e}")
        finally:
            if q in CLIENTS:
                CLIENTS.remove(q)

    # Headers to prevent buffering by NGINX/Proxies
    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    }

    return StreamingResponse(event_stream(), media_type="audio/mpeg", headers=headers)
