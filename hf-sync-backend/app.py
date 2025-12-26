from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import math

app = FastAPI(title="hopRadio Sync API")

# Enable CORS for the PWA
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (or specify yepzhi.com)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Playlist with durations (in seconds) - MUST MATCH FRONTEND
PLAYLIST = [
    {"id": 1, "title": "Can't Believe It", "artist": "T-Pain", "duration": 257},
    {"id": 2, "title": "International Love", "artist": "Pitbull", "duration": 227},
    {"id": 3, "title": "Beautiful Girls", "artist": "Sean Kingston", "duration": 234},
    {"id": 4, "title": "Blinding Lights", "artist": "The Weeknd", "duration": 200},
    {"id": 5, "title": "Wake Me Up", "artist": "Avicii", "duration": 247},
    {"id": 6, "title": "Part of Me", "artist": "Katy Perry", "duration": 235},
    {"id": 7, "title": "We Found Love", "artist": "Rihanna", "duration": 215},
    {"id": 8, "title": "Die Young", "artist": "Ke$ha", "duration": 219},
    {"id": 9, "title": "Glad You Came", "artist": "The Wanted", "duration": 198},
    {"id": 10, "title": "Good Feeling", "artist": "Flo Rida", "duration": 241},
    {"id": 11, "title": "I Knew You Were Trouble", "artist": "Taylor Swift", "duration": 219},
    {"id": 12, "title": "Treasure", "artist": "Bruno Mars", "duration": 178},
]

# Calculate total playlist duration
TOTAL_DURATION = sum(track["duration"] for track in PLAYLIST)

# Start timestamp (arbitrary anchor point - Jan 1, 2024 00:00:00 UTC)
EPOCH = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

@app.get("/")
def root():
    return {"status": "hopRadio Sync API is running", "total_duration": TOTAL_DURATION}

@app.get("/now-playing")
def now_playing():
    """
    Returns the current track and position based on server time.
    All users calling this endpoint at the same time will get the same result.
    """
    now = datetime.now(timezone.utc)
    
    # Calculate seconds since epoch
    seconds_since_epoch = (now - EPOCH).total_seconds()
    
    # Find position in the playlist cycle
    position_in_cycle = seconds_since_epoch % TOTAL_DURATION
    
    # Find which track we're on
    accumulated = 0
    current_track = PLAYLIST[0]
    track_position = 0
    
    for track in PLAYLIST:
        if accumulated + track["duration"] > position_in_cycle:
            current_track = track
            track_position = position_in_cycle - accumulated
            break
        accumulated += track["duration"]
    
    return {
        "track_id": current_track["id"],
        "title": current_track["title"],
        "artist": current_track["artist"],
        "position": round(track_position, 2),
        "duration": current_track["duration"],
        "server_time": now.isoformat(),
    }

@app.get("/playlist")
def get_playlist():
    """Returns the full playlist with durations"""
    return {"playlist": PLAYLIST, "total_duration": TOTAL_DURATION}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
