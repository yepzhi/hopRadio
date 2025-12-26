
import os
import time
import requests
import queue
import threading
import subprocess
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
PLAYLIST_URLS = [
    "https://yepzhi.com/hopRadio/assets/30For30.mp3",
    "https://yepzhi.com/hopRadio/assets/HelpMe.mp3",
    "https://yepzhi.com/hopRadio/assets/HolyBlindfold.mp3",
    "https://yepzhi.com/hopRadio/assets/Jan31st.mp3",
    "https://yepzhi.com/hopRadio/assets/RingRingRing.mp3",
    "https://yepzhi.com/hopRadio/assets/SheReady.mp3",
    "https://yepzhi.com/hopRadio/assets/WentLegit.mp3",
    "https://yepzhi.com/hopRadio/assets/Intro.mp3"
]

TRACKS_DIR = "tracks"
os.makedirs(TRACKS_DIR, exist_ok=True)

# Global audio buffer (for broadcasting)
AUDIO_BUFFER = queue.Queue(maxsize=100)  # ~10 seconds buffer
CLIENTS = [] # List of queues for connected clients

def download_tracks():
    print("Downloading tracks...")
    local_files = []
    for url in PLAYLIST_URLS:
        filename = os.path.join(TRACKS_DIR, url.split('/')[-1])
        if not os.path.exists(filename):
            print(f"Downloading {url}...")
            r = requests.get(url)
            with open(filename, 'wb') as f:
                f.write(r.content)
        local_files.append(filename)
    print("All tracks ready.")
    return local_files

def broadcast_loop():
    """
    Continuous DJ loop:
    1. Reads playlist
    2. Feeds files to FFmpeg
    3. Output is piped to global buffer
    """
    local_files = download_tracks()
    
    # Infinite loop of playlist
    while True:
        # Create a concat list file
        with open("playlist.txt", "w") as f:
            for track in local_files:
                f.write(f"file '{os.path.abspath(track)}'\n")
        
        # FFmpeg command: Concat -> MP3 Stream -> Stdout
        # -re : Read input at native frame rate (simulates live stream)
        # -f concat : Use concat demuxer
        # -safe 0 : Allow absolute paths
        # -i playlist.txt : Input file list
        # -c:a libmp3lame : Re-encode to ensure consistent format
        # -b:a 128k : Constant bitrate
        # -f mp3 : Output format
        # pipe:1 : Output to stdout
        
        process = subprocess.Popen(
            [
                "ffmpeg",
                "-re",
                "-f", "concat",
                "-safe", "0",
                "-i", "playlist.txt",
                "-c:a", "libmp3lame",
                "-b:a", "128k",
                "-ac", "2",      # Stereo
                "-ar", "44100",  # 44.1kHz
                "-f", "mp3",
                "pipe:1"
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, # Hide logs
            bufsize=1024*16 # 16kb buffer
        )
        
        print("Broadcaster: Started FFmpeg stream")
        
        # Read chunks and broadcast to all connected clients
        chunk_size = 4096
        while True:
            data = process.stdout.read(chunk_size)
            if not data:
                break
                
            # Distribute to all listeners
            # We iterate backwards to safely remove disconnected clients if needed (handled in generator though)
            for client_queue in list(CLIENTS):
                try:
                    client_queue.put_nowait(data)
                except queue.Full:
                    # Client too slow, drop them or skip chunk? 
                    # For simplicity, we skip chunk for them (audio glitch but prevents server memory leak)
                    pass
        
        process.wait()
        print("Broadcaster: Playlist finished, looping...")

# Start Broadcaster in background
t = threading.Thread(target=broadcast_loop, daemon=True)
t.start()

@app.get("/")
def home():
    return {"status": "Radio is ON AIR", "listeners": len(CLIENTS)}

@app.get("/stream")
async def stream():
    def event_stream():
        # Create a client queue
        client_queue = queue.Queue(maxsize=20) # Small buffer per client
        CLIENTS.append(client_queue)
        print(f"Client connected. Total: {len(CLIENTS)}")
        
        try:
            while True:
                # Wait for data from broadcaster
                data = client_queue.get()
                yield data
        except Exception as e:
            print(f"Client disconnected: {e}")
        finally:
            if client_queue in CLIENTS:
                CLIENTS.remove(client_queue)
                print(f"Client removed. Total: {len(CLIENTS)}")

    return StreamingResponse(event_stream(), media_type="audio/mpeg")
