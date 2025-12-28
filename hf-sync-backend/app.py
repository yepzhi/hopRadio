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
# Final Sync Trigger v2.2.2 (Syntax Fixed)

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

# Playlist (without Intro.mp3 which 404s)
# Playlist (Auto-Generated)
PLAYLIST = [
    {"id": "t1", "title": "Can't Believe It", "artist": "T-Pain", "file": "CantBelieveItTPain.mp3", "weight": 8},
    {"id": "t2", "title": "Dior", "artist": "Pop Smoke", "file": "POPSMOKEDIOR.mp3", "weight": 9},
    {"id": "t3", "title": "Typa", "artist": "GloRilla", "file": "GloRillaTypa.mp3", "weight": 7},
    {"id": "t4", "title": "Just Wanna Rock", "artist": "Lil Uzi Vert", "file": "JustWannaR.mp3", "weight": 8},
    {"id": "t5", "title": "30 For 30", "artist": "SZA", "file": "30For30.mp3", "weight": 6},
    {"id": "t6", "title": "Help Me", "artist": "Real Boston Richey", "file": "HelpMe.mp3", "weight": 6},
    {"id": "t7", "title": "Holy Blindfold", "artist": "Chris Brown", "file": "HolyBlindfold.mp3", "weight": 6},
    {"id": "t8", "title": "Jan 31st", "artist": "YFN Lucci", "file": "Jan31st.mp3", "weight": 6},
    {"id": "t9", "title": "Ring Ring Ring", "artist": "Tyler, The Creator", "file": "RingRingRing.mp3", "weight": 5},
    {"id": "t10", "title": "She Ready", "artist": "Key Glock", "file": "SheReady.mp3", "weight": 8},
    {"id": "t11", "title": "Went Legit", "artist": "G Herbo", "file": "WentLegit.mp3", "weight": 6},
    {"id": "t12", "title": "Shake Dat Ass", "artist": "Bossman Dlow", "file": "Bossman Dlow - Shake Dat _ss (Twerk Song) [CLEAN].mp3", "weight": 8},
    {"id": "t13", "title": "Shake Dat Ass (Moskeez)", "artist": "Bossman Dlow", "file": "Bossman Dlow - Shake Dat ss (Twerk Song) [CLEAN] - MOSKEEZ.mp3", "weight": 7},
    {"id": "t14", "title": "Bottoms Up", "artist": "Trey Songz ft. Nicki Minaj", "file": "Bottoms Up- Trey Songz Ft. Nicki Minaj (Clean) - EdittedSongs🤍.mp3", "weight": 8},
    {"id": "t15", "title": "Safe", "artist": "Cardi B ft. Kehlani", "file": "Cardi B - Safe feat. Kehlani (Clean Version)  Lyrics - Kids Dance Party.mp3", "weight": 7},
    {"id": "t16", "title": "Weird", "artist": "Chino", "file": "Chino Weird Clean - DecaturQ.mp3", "weight": 6},
    {"id": "t17", "title": "Residuals", "artist": "Chris Brown", "file": "Chris Brown Residuals Clean - DecaturQ.mp3", "weight": 7},
    {"id": "t18", "title": "What Did I Miss", "artist": "Drake", "file": "Drake - What Did I Miss (Clean) - XeonBeats.mp3", "weight": 9},
    {"id": "t19", "title": "Went Legit (Clean)", "artist": "G Herbo", "file": "G Herbo - Went Legit (Best Clean Version) - TheKobe1234 Records.mp3", "weight": 6},
    {"id": "t20", "title": "Sk8", "artist": "JID & Ciara", "file": "JID & Ciara & EARTHGANG Sk8 Clean - DecaturQ.mp3", "weight": 7},
    {"id": "t21", "title": "Lovin On Me", "artist": "Jack Harlow", "file": "Jack Harlow - Lovin On Me (Clean Version) (Lyrics) - Kids Dance Party.mp3", "weight": 9},
    {"id": "t22", "title": "Not Fair", "artist": "Leon Thomas", "file": "Leon Thomas Not Fair Clean - DecaturQ.mp3", "weight": 6},
    {"id": "t23", "title": "3am", "artist": "Loe Shimmy & Don Toliver", "file": "Loe Shimmy & Don Toliver - 3am [Clean] - Sock With A Glock.mp3", "weight": 7},
    {"id": "t24", "title": "Turn Yo Clic Up", "artist": "Quavo & Future", "file": "Quavo & Future - Turn Yo Clic Up [Clean] - Sock With A Glock.mp3", "weight": 8},
    {"id": "t25", "title": "Buy You A Drank", "artist": "T-Pain", "file": "T-Pain - Buy You A Drank (Shawty Snappin') (Feat. Yung Joc) (Clean) - DJRatAttack.mp3", "weight": 9},
    {"id": "t26", "title": "FE!N", "artist": "Travis Scott", "file": "Travis Scott - FE!N (Clean - Lyrics) feat. Playboi Carti - Polar Records.mp3", "weight": 10},
    {"id": "t27", "title": "IS IT", "artist": "Tyla", "file": "Tyla - IS IT (Clean) - XeonBeats.mp3", "weight": 7},
    {"id": "t28", "title": "Jan 31st (Full)", "artist": "YFN Lucci", "file": "YFN Lucci - Jan. 31st (My Truth) [Clean] - Sock With A Glock.mp3", "weight": 6},
    {"id": "t29", "title": "Uh Oh", "artist": "Zeddy Will", "file": "Zeddy Will Uh Oh Clean - DecaturQ.mp3", "weight": 7},
    {"id": "t30", "title": "Soak City (Do It)", "artist": "310Babii", "file": "310Babii Soak City (Do It) Clean - DecaturQ.mp3", "weight": 7},
    {"id": "t31", "title": "Bitch, Don't Kill My Vibe", "artist": "Kendrick Lamar", "file": "Bh Don't Kill My Vibe (Clean) - Kendrick Lamar - Anthony Lee 69.mp3", "weight": 9},
    {"id": "t32", "title": "Whatever She Wants", "artist": "Bryson Tiller", "file": "Bryson Tiller - Whatever She Wants (CLEAN) [Lyrics] - Hip Hop_R&B Lyrics.mp3", "weight": 8},
    {"id": "t33", "title": "Players", "artist": "Coi Leray", "file": "Coi Leray - Players [Clean] - Sock With A Glock.mp3", "weight": 8},
    {"id": "t34", "title": "Laffy Taffy", "artist": "D4L", "file": "D4L - Laffy Taffy (Clean - Lyrics) - Kids Dance Party.mp3", "weight": 7},
    {"id": "t35", "title": "Rockstar", "artist": "DaBaby", "file": "DaBaby - ROCKSTAR (Clean - Lyrics) feat. Roddy Ricch - Polar Records.mp3", "weight": 9},
    {"id": "t36", "title": "Damn!", "artist": "YoungBloodZ", "file": "Damn! (Radio Edit) - YoungBloodZ.mp3", "weight": 8},
    {"id": "t37", "title": "Blow My High", "artist": "Dee Mula", "file": "Dee Mula - Blow My High [Clean] - Sock With A Glock.mp3", "weight": 6},
    {"id": "t38", "title": "What It Is", "artist": "Doechii & Kodak Black", "file": "Doechii & Kodak Black - What It Is (Clean Lyrics) - Clean Recordz.mp3", "weight": 8},
    {"id": "t39", "title": "Paint The Town Red", "artist": "Doja Cat", "file": "Doja Cat - Paint The Town Red (Clean - Lyrics) - Polar Records.mp3", "weight": 9},
    {"id": "t40", "title": "No Pole", "artist": "Don Toliver", "file": "Don Toliver - No Pole (CLEAN) - Clean UK Drill.mp3", "weight": 7},
    {"id": "t41", "title": "Like That", "artist": "Future, Metro Boomin ft. K-Dot", "file": "Future, Metro Boomin - Like That (Clean) feat. Kendrick Lamar - Luke WRLD.mp3", "weight": 9},
    {"id": "t42", "title": "fukumean", "artist": "Gunna", "file": "Gunna - fukumean (Clean)  Lyrics - Throwback Hits.mp3", "weight": 8},
    {"id": "t43", "title": "White Girl", "artist": "Young Jeezy ft. USDA", "file": "Joung Jeezy Ft. USDA - White Girl - mandrgalvan.mp3", "weight": 7},
    {"id": "t44", "title": "Yeah Yeah", "artist": "Juiicy 2xs ft. Lola Brooke", "file": "Juiicy 2xs - Yeah Yeah ft. Lola Brooke (Lyrics) - Bad Bith Bops.mp3", "weight": 6},
    {"id": "t45", "title": "Not Like Us", "artist": "Kendrick Lamar", "file": "Kendrick Lamar - Not Like Us [Clean] - Sock With A Glock.mp3", "weight": 10},
    {"id": "t46", "title": "tv off", "artist": "Kendrick Lamar", "file": "Kendrick Lamar - tv off (Clean) - XeonBeats.mp3", "weight": 7},
    {"id": "t47", "title": "ZEZE", "artist": "Kodak Black ft. Travis Scott", "file": "Kodak Black - ZEZE (Clean) ft. Travis Scott & Offset - Sir Sammy.mp3", "weight": 9},
    {"id": "t48", "title": "Like A Wife", "artist": "Tre Savage", "file": "LIKE A WIFE - Tre Savage.mp3", "weight": 6},
    {"id": "t49", "title": "Big Energy", "artist": "Latto", "file": "Latto - Big Energy (Clean - Lyrics) - TrendingTracks.mp3", "weight": 8},
    {"id": "t50", "title": "All My Life", "artist": "Lil Durk ft. J. Cole", "file": "Lil Durk - All My Life (Clean - Lyrics) feat. J. Cole - Polar Records.mp3", "weight": 8},
    {"id": "t51", "title": "Love Me", "artist": "Lil Wayne ft. Drake", "file": "Lil Wayne - Love Me (Clean) ft. Drake, Future - LilWayneVEVO.mp3", "weight": 9},
    {"id": "t52", "title": "This Is Why I'm Hot", "artist": "Mims", "file": "Mims - This Is Why I'm Hot (Clean Version) - Clean Radio Promo.mp3", "weight": 8},
    {"id": "t53", "title": "Made For Me", "artist": "Muni Long", "file": "Muni Long Made For Me Clean - DecaturQ.mp3", "weight": 8},
    {"id": "t54", "title": "Everybody", "artist": "Nicki Minaj ft. Lil Uzi Vert", "file": "Nicki Minaj - Everybody (Clean - Lyrics) ft. Lil Uzi Vert - Cloudy Hits.mp3", "weight": 8},
    {"id": "t55", "title": "No Hands", "artist": "Waka Flocka Flame", "file": "No Hands (Clean) - WaCkYnJaCk328.mp3", "weight": 9},
    {"id": "t56", "title": "GEEKALEEK", "artist": "OhGeesy ft. Cash Kidd", "file": "OhGeesy - GEEKALEEK (Feat. Cash Kidd) [Clean] - Sock With A Glock.mp3", "weight": 7},
    {"id": "t57", "title": "Orange Soda", "artist": "Baby Keem", "file": "Orange soda - Baby Keem (Clean + Lyrics) (BEST ON YT) - syiix.mp3", "weight": 8},
    {"id": "t58", "title": "PTPOM 2.0", "artist": "Mohead Mike", "file": "PTPOM 2.0 Mohead Mike x MoneyBagg Yo x Big Boogie Official Visualizer (Clean) - Mohead Mike.mp3", "weight": 6},
    {"id": "t59", "title": "Redbone", "artist": "Childish Gambino", "file": "Redbone [Clean] - Childish Gambino - relly rel.mp3", "weight": 9},
    {"id": "t60", "title": "Gimme a Second", "artist": "Rich The Kid & Peso Pluma", "file": "Rich The Kid & Peso Pluma - Gimme a Second [Clean] - Sock With A Glock.mp3", "weight": 7},
    {"id": "t61", "title": "WTHELLY", "artist": "Rob49", "file": "Rob49 - WTHELLY [Clean] - Sock With A Glock.mp3", "weight": 6},
    {"id": "t62", "title": "Get It Sexyy", "artist": "Sexyy Red", "file": "Sexy Red - Get it Sexyy (clean + lyrics! - Lyrics hours.mp3", "weight": 9},
    {"id": "t63", "title": "U My Everything", "artist": "Sexyy Red & Drake", "file": "Sexyy Red & Drake - U My Everything (Clean) (Lyrics) - Audio at 192khz - Helfmadian.mp3", "weight": 9},
    {"id": "t64", "title": "Die For You", "artist": "The Weeknd", "file": "The Weeknd  - Die For You (Clean) - Ultron Music and DD2 Arts.mp3", "weight": 9},
    {"id": "t65", "title": "Falsetto", "artist": "The-Dream", "file": "The-Dream - Falsetto (Clean_Radio Edit) - Clean Radio Promo.mp3", "weight": 8},
    {"id": "t66", "title": "Carnival", "artist": "Kanye West, Ty Dolla $ign", "file": "¥, Kanye West & Ty Dolla ign, Rich The Kid & Playboi Carti - Carnival (Clean Lyrics) - Clean Recordz.mp3", "weight": 9},
]

CLIENTS = []
# Global Circular Buffer for Burst-on-Connect
BURST_BUFFER = deque(maxlen=10) 
CURRENT_TRACK_INFO = {"title": "Connecting...", "artist": "hopRadio"}

# Track Manager Queue
READY_TRACKS = Queue(maxsize=3)

def download_track(filename):
    url = f"https://yepzhi.com/hopRadio/tracks/{filename}"
    local_path = os.path.join(TRACKS_DIR, filename)
    
    # Check if exists and valid
    if os.path.exists(local_path):
        size = os.path.getsize(local_path)
        if size > 100000: # Verify it's not a tiny error file (>100KB)
            return local_path
        else:
            print(f"Warning: {filename} is too small ({size} bytes). Re-downloading...")
            os.remove(local_path)
        
    print(f"Downloading {filename} from {url}...")
    try:
        r = requests.get(url, stream=True, timeout=30) # Increased timeout
        if r.status_code == 200:
            with open(local_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=65536):
                    f.write(chunk)
            print(f"Success: Downloaded {filename} ({os.path.getsize(local_path)} bytes)")
            return local_path
        else:
            print(f"Failed to download {url}: Status {r.status_code}")
    except Exception as e:
        print(f"Error downloading {filename}: {e}")
    return None

def track_manager_loop():
    """Background thread to keep READY_TRACKS full of local files"""
    print("Track Manager started...")
    while True:
        try:
            if not READY_TRACKS.full():
                # Even Distribution Shuffle
                selected_track = select_next_track()
                
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
# (Defined earlier, reused seamlessly)

# Track Shuffle Bag (Even Distribution) & History
SHUFFLE_BAG = []
LAST_PLAYED = deque(maxlen=5) # Prevent repeats in last 5 songs

def select_next_track():
    global SHUFFLE_BAG, LAST_PLAYED
    
    # 1. Refill if needed
    if not SHUFFLE_BAG:
        print("Refilling Shuffle Bag...")
        SHUFFLE_BAG = list(PLAYLIST)
        random.shuffle(SHUFFLE_BAG)
        
        # Smart Refill: Ensure the top of the NEW bag doesn't match LAST_PLAYED history
        # If the first song was just played, swap it with a random one in the bag
        if SHUFFLE_BAG and LAST_PLAYED and SHUFFLE_BAG[-1]['id'] in [t['id'] for t in LAST_PLAYED]:
             print("Shuffle collision detected! Swapping...")
             idx = random.randint(0, len(SHUFFLE_BAG) - 2) # Pick random index
             # Swap last with random
             SHUFFLE_BAG[-1], SHUFFLE_BAG[idx] = SHUFFLE_BAG[idx], SHUFFLE_BAG[-1]

    # 2. Pop
    track = SHUFFLE_BAG.pop()
    
    # 3. Add to history
    LAST_PLAYED.append(track)
    
    return track

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

@app.get("/api/offline-queue")
def get_offline_queue():
    """Returns a list of 15 random tracks for client-side offline buffering"""
    # Select 15 random tracks (approx 1 hour)
    queue = random.sample(PLAYLIST, min(len(PLAYLIST), 15))
    
    # Enrich with direct download URLs
    # Assuming the frontend can access the same source URLs
    response_queue = []
    for track in queue:
        t = track.copy()
        t['download_url'] = f"https://yepzhi.com/hopRadio/tracks/{track['file']}"
        response_queue.append(t)
        
    return {"queue": response_queue}

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

    # Headers to prevent buffering AND Enable CORS for AudioContext
    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "*",
    }
    
    return StreamingResponse(event_stream(), media_type="audio/mpeg", headers=headers)
