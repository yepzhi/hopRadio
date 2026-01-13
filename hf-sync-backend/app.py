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

# Playlist
# SIMPLE SYSTEM: The number = how many times it plays
# 9 = plays 9x | 7 = plays 7x | 1 = plays 1x (rare)
PLAYLIST = [
    {"id": "t1", "title": "Good Good", "artist": "21 Savage, Summer Walker, Usher", "file": "21 Savage Summer Walker and Usher - Good Good Lyrics.mp3", "priority": 7},
    {"id": "t2", "title": "30 For 30", "artist": "SZA", "file": "30For30.mp3", "priority": 7},
    {"id": "t3", "title": "Soak City (Do It)", "artist": "310Babii", "file": "310Babii Soak City (Do It) Clean - DecaturQ.mp3", "priority": 7},
    {"id": "t4", "title": "679", "artist": "Fetty Wap ft. Monty", "file": "679 - Fetty Wap Monty Lyric Video.mp3", "priority": 7},
    {"id": "t5", "title": "All Of The Lights", "artist": "Kanye West", "file": "All Of The Lights.mp3", "priority": 2},
    {"id": "t6", "title": "Throat Baby (Go Baby)", "artist": "BRS Kash", "file": "BRS Kash Throat Baby Go Baby Official Music Video.mp3", "priority": 6},
    {"id": "t7", "title": "Bitch, Don't Kill My Vibe", "artist": "Kendrick Lamar", "file": "Bh Don't Kill My Vibe (Clean) - Kendrick Lamar - Anthony Lee 69.mp3", "priority": 1},
    {"id": "t8", "title": "Blame Game", "artist": "Kanye West", "file": "Blame Game.mp3", "priority": 2},
    {"id": "t9", "title": "Shake Dat Ass", "artist": "Bossman Dlow", "file": "Bossman Dlow - Shake Dat _ss (Twerk Song) [CLEAN].mp3", "priority": 8},
    {"id": "t10", "title": "Shake Dat Ass (Moskeez)", "artist": "Bossman Dlow", "file": "Bossman Dlow - Shake Dat ss (Twerk Song) [CLEAN] - MOSKEEZ.mp3", "priority": 8},
    {"id": "t11", "title": "Bottoms Up", "artist": "Trey Songz ft. Nicki Minaj", "file": "Bottoms Up- Trey Songz Ft. Nicki Minaj (Clean) - EdittedSongs🤍.mp3", "priority": 4},
    {"id": "t12", "title": "Exchange", "artist": "Bryson Tiller", "file": "Bryson Tiller - Exchange Official Video.mp3", "priority": 3},
    {"id": "t13", "title": "Whatever She Wants", "artist": "Bryson Tiller", "file": "Bryson Tiller - Whatever She Wants (CLEAN) [Lyrics] - Hip Hop_R&B Lyrics.mp3", "priority": 6},
    {"id": "t14", "title": "Can't Believe It", "artist": "T-Pain", "file": "CantBelieveItTPain.mp3", "priority": 5},
    {"id": "t15", "title": "Safe", "artist": "Cardi B ft. Kehlani", "file": "Cardi B - Safe feat. Kehlani (Clean Version)  Lyrics - Kids Dance Party.mp3", "priority": 7},
    {"id": "t16", "title": "Weird", "artist": "CHiNO", "file": "Chino Weird Clean - DecaturQ.mp3", "priority": 6},
    {"id": "t17", "title": "Heat", "artist": "Chris Brown ft. Gunna", "file": "Chris Brown - Heat Audio ft Gunna.mp3", "priority": 6},
    {"id": "t18", "title": "Summer Too Hot", "artist": "Chris Brown", "file": "Chris Brown - Summer Too Hot.mp3", "priority": 6},
    {"id": "t19", "title": "Residuals", "artist": "Chris Brown", "file": "Chris Brown Residuals Clean - DecaturQ.mp3", "priority": 7},
    {"id": "t20", "title": "Go Crazy", "artist": "Chris Brown & Young Thug", "file": "Chris Brown Young Thug - Go Crazy Lyrics.mp3", "priority": 4},
    {"id": "t21", "title": "Act Up", "artist": "City Girls", "file": "City Girls - Act Up Audio.mp3", "priority": 8},
    {"id": "t22", "title": "Players", "artist": "Coi Leray", "file": "Coi Leray - Players [Clean] - Sock With A Glock.mp3", "priority": 5},
    {"id": "t23", "title": "Laffy Taffy", "artist": "D4L", "file": "D4L - Laffy Taffy (Clean - Lyrics) - Kids Dance Party.mp3", "priority": 3},
    {"id": "t24", "title": "ROCKSTAR", "artist": "DaBaby ft. Roddy Ricch", "file": "DaBaby - ROCKSTAR (Clean - Lyrics) feat. Roddy Ricch - Polar Records.mp3", "priority": 5},
    {"id": "t25", "title": "SHAKE SUMN", "artist": "DaBaby", "file": "DaBaby - SHAKE SUMN Official Audio.mp3", "priority": 6},
    {"id": "t26", "title": "Damn!", "artist": "YoungBloodZ", "file": "Damn! (Radio Edit) - YoungBloodZ.mp3", "priority": 5},
    {"id": "t27", "title": "Blow My High", "artist": "Dee Mula", "file": "Dee Mula - Blow My High [Clean] - Sock With A Glock.mp3", "priority": 7},
    {"id": "t28", "title": "Panda", "artist": "Desiigner", "file": "Desiigner - Panda Audio.mp3", "priority": 1},
    
    {"id": "t30", "title": "What It Is", "artist": "Doechii & Kodak Black", "file": "Doechii & Kodak Black - What It Is (Clean Lyrics) - Clean Recordz.mp3", "priority": 7},
    {"id": "t31", "title": "What It Is (Solo)", "artist": "Doechii", "file": "Doechii - What It Is Solo Version Lyrics.mp3", "priority": 3},
    {"id": "t32", "title": "Paint The Town Red", "artist": "Doja Cat", "file": "Doja Cat - Paint The Town Red (Clean - Lyrics) - Polar Records.mp3", "priority": 6},
    {"id": "t33", "title": "No Pole", "artist": "Don Toliver", "file": "Don Toliver - No Pole (CLEAN) - Clean UK Drill.mp3", "priority": 9},
    {"id": "t34", "title": "What Did I Miss", "artist": "Drake", "file": "Drake - What Did I Miss (Clean) - XeonBeats.mp3", "priority": 7},
    {"id": "t35", "title": "Crunk Ain't Dead (Remix)", "artist": "Duke Deuce", "file": "Duke Deuce Crunk Aint Dead Remix ft Lil Jon Juicy J Project Pat.mp3", "priority": 3},

    {"id": "t37", "title": "Envy (Remix)", "artist": "hopRadio", "file": "Envy Remix.mp3", "priority": 4},
    {"id": "t38", "title": "My Way", "artist": "Fetty Wap ft. Monty", "file": "Fetty Wap My Way feat Monty Official Video.mp3", "priority": 4},
    {"id": "t39", "title": "Life Is Good", "artist": "Future ft. Drake", "file": "Future - Life Is Good Audio ft Drake.mp3", "priority": 4},
    {"id": "t40", "title": "Like That", "artist": "Future, Metro Boomin ft. Kendrick Lamar", "file": "Future, Metro Boomin - Like That (Clean) feat. Kendrick Lamar - Luke WRLD.mp3", "priority": 8},
    {"id": "t41", "title": "Went Legit", "artist": "G Herbo", "file": "G Herbo - Went Legit (Best Clean Version) - TheKobe1234 Records.mp3", "priority": 8},
    {"id": "t42", "title": "Typa", "artist": "GloRilla", "file": "GloRillaTypa.mp3", "priority": 8},
    {"id": "t43", "title": "Gorgeous", "artist": "Kanye West", "file": "Gorgeous.mp3", "priority": 2},
    {"id": "t44", "title": "fukumean", "artist": "Gunna", "file": "Gunna - fukumean (Clean)  Lyrics - Throwback Hits.mp3", "priority": 4},
    {"id": "t45", "title": "Help Me", "artist": "Real Boston Richey", "file": "HelpMe.mp3", "priority": 9},
    {"id": "t46", "title": "Holy Blindfold", "artist": "hopRadio", "file": "HolyBlindfold.mp3", "priority": 10},
    {"id": "t47", "title": "I'm Sprung", "artist": "T-Pain", "file": "Im Sprung.mp3", "priority": 5},
    {"id": "t48", "title": "Sk8", "artist": "JID, Ciara, EARTHGANG", "file": "JID & Ciara & EARTHGANG Sk8 Clean - DecaturQ.mp3", "priority": 9},
    {"id": "t49", "title": "Lovin On Me", "artist": "Jack Harlow", "file": "Jack Harlow - Lovin On Me (Clean Version) (Lyrics) - Kids Dance Party.mp3", "priority": 7},
    {"id": "t50", "title": "Jan 31st", "artist": "YFN Lucci", "file": "Jan31st.mp3", "priority": 10},
    {"id": "t51", "title": "White Girl", "artist": "Young Jeezy", "file": "Joung Jeezy Ft. USDA - White Girl - mandrgalvan.mp3", "priority": 1},
    {"id": "t52", "title": "Yeah Yeah", "artist": "Juiicy 2xs ft. Lola Brooke", "file": "Juiicy 2xs - Yeah Yeah ft. Lola Brooke (Lyrics) - Bad Bith Bops.mp3", "priority": 10},
    {"id": "t53", "title": "Just Wanna Rock", "artist": "Lil Uzi Vert", "file": "JustWannaR.mp3", "priority": 5},
    {"id": "t54", "title": "Can't Tell Me Nothing", "artist": "Kanye West", "file": "Kanye West - Cant Tell Me Nothing.mp3", "priority": 1},
    {"id": "t55", "title": "Homecoming", "artist": "Kanye West", "file": "Kanye West - Homecoming.mp3", "priority": 1},
    # REMOVED: Mercy (mislabeled file - was playing Devil in a New Dress)
    {"id": "t57", "title": "Not Like Us", "artist": "Kendrick Lamar", "file": "Kendrick Lamar - Not Like Us [Clean] - Sock With A Glock.mp3", "priority": 6},
    {"id": "t58", "title": "TV Off", "artist": "Kendrick Lamar", "file": "Kendrick Lamar - tv off (Clean) - XeonBeats.mp3", "priority": 4},
    {"id": "t59", "title": "ZEZE", "artist": "Kodak Black", "file": "Kodak Black - ZEZE (Clean) ft. Travis Scott & Offset - Sir Sammy.mp3", "priority": 6},
    {"id": "t60", "title": "Like A Wife", "artist": "Tre Savage", "file": "LIKE A WIFE - Tre Savage.mp3", "priority": 8},
    {"id": "t61", "title": "Big Energy", "artist": "Latto", "file": "Latto - Big Energy (Clean - Lyrics) - TrendingTracks.mp3", "priority": 7},
    {"id": "t62", "title": "Not Fair", "artist": "Leon Thomas", "file": "Leon Thomas Not Fair Clean - DecaturQ.mp3", "priority": 6},
    {"id": "t63", "title": "All My Life", "artist": "Lil Durk ft. J. Cole", "file": "Lil Durk - All My Life (Clean - Lyrics) feat. J. Cole - Polar Records.mp3", "priority": 8},
    {"id": "t64", "title": "XO Tour Llif3", "artist": "Lil Uzi Vert", "file": "Lil Uzi Vert - XO Tour Llif3 Official Lyric Video.mp3", "priority": 3},
    {"id": "t65", "title": "Love Me", "artist": "Lil Wayne", "file": "Lil Wayne - Love Me (Clean) ft. Drake, Future - LilWayneVEVO.mp3", "priority": 6},
    {"id": "t66", "title": "3AM", "artist": "Loe Shimmy & Don Toliver", "file": "Loe Shimmy & Don Toliver - 3am [Clean] - Sock With A Glock.mp3", "priority": 6},
    {"id": "t67", "title": "LIZZO", "artist": "MOONE WALKER", "file": "MOONE WALKER- LIZZO OFFICIAL VIDEO.mp3", "priority": 6},
    {"id": "t68", "title": "Sure Thing", "artist": "Miguel", "file": "Miguel - Sure Thing Lyrics.mp3", "priority": 5},
    {"id": "t69", "title": "This Is Why I'm Hot", "artist": "Mims", "file": "Mims - This Is Why I'm Hot (Clean Version) - Clean Radio Promo.mp3", "priority": 3},
    {"id": "t70", "title": "Made For Me", "artist": "Muni Long", "file": "Muni Long Made For Me Clean - DecaturQ.mp3", "priority": 8},
    {"id": "t71", "title": "Everybody", "artist": "Nicki Minaj ft. Lil Uzi Vert", "file": "Nicki Minaj - Everybody (Clean - Lyrics) ft. Lil Uzi Vert - Cloudy Hits.mp3", "priority": 5},
    {"id": "t72", "title": "No Flex Zone", "artist": "Rae Sremmurd", "file": "No Flex Zone.mp3", "priority": 4},
    {"id": "t73", "title": "No Hands", "artist": "Waka Flocka Flame", "file": "No Hands (Clean) - WaCkYnJaCk328.mp3", "priority": 2},
    {"id": "t74", "title": "GEEKALEEK", "artist": "OhGeesy", "file": "OhGeesy - GEEKALEEK (Feat. Cash Kidd) [Clean] - Sock With A Glock.mp3", "priority": 6},
    {"id": "t75", "title": "Orange Soda", "artist": "Baby Keem", "file": "Orange soda - Baby Keem (Clean + Lyrics) (BEST ON YT) - syiix.mp3", "priority": 7},
    {"id": "t76", "title": "Dior", "artist": "Pop Smoke", "file": "POPSMOKEDIOR.mp3", "priority": 6},
    {"id": "t77", "title": "PTPOM 2.0", "artist": "Mohead Mike", "file": "PTPOM 2.0 Mohead Mike x MoneyBagg Yo x Big Boogie Official Visualizer (Clean) - Mohead Mike.mp3", "priority": 4},
    {"id": "t78", "title": "Pills & Automobiles", "artist": "Chris Brown", "file": "Pills Automobiles Official Video.mp3", "priority": 6},
    {"id": "t79", "title": "Turn Yo Clic Up", "artist": "Quavo & Future", "file": "Quavo & Future - Turn Yo Clic Up [Clean] - Sock With A Glock.mp3", "priority": 8},
    {"id": "t80", "title": "Redbone", "artist": "Childish Gambino", "file": "Redbone [Clean] - Childish Gambino - relly rel.mp3", "priority": 5},
    {"id": "t81", "title": "Gimme a Second", "artist": "Rich The Kid & Peso Pluma", "file": "Rich The Kid & Peso Pluma - Gimme a Second [Clean] - Sock With A Glock.mp3", "priority": 4},
    {"id": "t82", "title": "Loveeeeeee Song", "artist": "Rihanna ft. Future", "file": "Rihanna - Loveeeeeee Song Lyrics Ft Future.mp3", "priority": 5},
    {"id": "t83", "title": "Ring Ring Ring", "artist": "hopRadio", "file": "RingRingRing.mp3", "priority": 9},
    {"id": "t84", "title": "WTHELLY", "artist": "Rob49", "file": "Rob49 - WTHELLY [Clean] - Sock With A Glock.mp3", "priority": 10},
    {"id": "t85", "title": "Heart On Ice", "artist": "Rod Wave", "file": "Rod Wave - Heart On Ice Lyrics.mp3", "priority": 6},
    {"id": "t86", "title": "The Box", "artist": "Roddy Ricch", "file": "Roddy Ricch - The Box Official Audio.mp3", "priority": 3},
    {"id": "t87", "title": "Roses", "artist": "SAINt JHN", "file": "SAINt JHN - Roses lyrics.mp3", "priority": 2},
    {"id": "t88", "title": "Get It Sexyy", "artist": "Sexyy Red", "file": "Sexy Red - Get it Sexyy (clean + lyrics! - Lyrics hours.mp3", "priority": 4},
    {"id": "t89", "title": "U My Everything", "artist": "Sexyy Red & Drake", "file": "Sexyy Red & Drake - U My Everything (Clean) (Lyrics) - Audio at 192khz - Helfmadian.mp3", "priority": 4},
    {"id": "t90", "title": "She Ready", "artist": "Lil Yachty", "file": "SheReady.mp3", "priority": 7},
    {"id": "t91", "title": "Sleazy Flow (Remix)", "artist": "SleazyWorld Go ft. Lil Baby", "file": "SleazyWorld Go - Sleazy Flow Remix ft Lil Baby Official Music Video.mp3", "priority": 5},
    {"id": "t92", "title": "Slow Jamz", "artist": "Kanye West", "file": "Slow Jamz.mp3", "priority": 5},
    {"id": "t93", "title": "Buy You A Drank", "artist": "T-Pain", "file": "T-Pain - Buy You A Drank (Shawty Snappin') (Feat. Yung Joc) (Clean) - DJRatAttack.mp3", "priority": 4},
    {"id": "t94", "title": "THE SCOTTS", "artist": "Travis Scott & Kid Cudi", "file": "THE SCOTTS Travis Scott Kid Cudi - THE SCOTTS Audio.mp3", "priority": 4},
    {"id": "t95", "title": "Die For You", "artist": "The Weeknd", "file": "The Weeknd  - Die For You (Clean) - Ultron Music and DD2 Arts.mp3", "priority": 4},
    {"id": "t96", "title": "Heartless", "artist": "The Weeknd", "file": "The Weeknd - Heartless Lyrics.mp3", "priority": 4},
    {"id": "t97", "title": "Falsetto", "artist": "The-Dream", "file": "The-Dream - Falsetto (Clean_Radio Edit) - Clean Radio Promo.mp3", "priority": 5},

    {"id": "t100", "title": "HIGHEST IN THE ROOM", "artist": "Travis Scott", "file": "Travis Scott - HIGHEST IN THE ROOM Official Music Video.mp3", "priority": 5},
    {"id": "t101", "title": "Tuesday", "artist": "ILoveMakonnen ft. Drake", "file": "Tuesday feat Drake.mp3", "priority": 5},
    {"id": "t102", "title": "IS IT", "artist": "Tyla", "file": "Tyla - IS IT (Clean) - XeonBeats.mp3", "priority": 10},
    {"id": "t103", "title": "Love in This Club", "artist": "Usher ft. Young Jeezy", "file": "Usher - Love in This Club Lyrics ft Young Jeezy.mp3", "priority": 6},
    {"id": "t104", "title": "Like A Wife", "artist": "Webbie & Tre Savage", "file": "Webbie Tre Savage - Like A Wife Official Music Video.mp3", "priority": 7},

    {"id": "t106", "title": "Jan 31st", "artist": "YFN Lucci", "file": "YFN Lucci - Jan. 31st (My Truth) [Clean] - Sock With A Glock.mp3", "priority": 7},
    {"id": "t107", "title": "Bed Rock", "artist": "Young Money", "file": "Young Money - Bed Rock Official Music Video.mp3", "priority": 3},
    {"id": "t108", "title": "Best Friend", "artist": "Young Thug", "file": "Young Thug Best Friend.mp3", "priority": 3},
    {"id": "t109", "title": "Uh Oh", "artist": "Zeddy Will", "file": "Zeddy Will Uh Oh Clean - DecaturQ.mp3", "priority": 9},
    {"id": "t110", "title": "Carnival", "artist": "Kanye West & Ty Dolla $ign", "file": "¥, Kanye West & Ty Dolla ign, Rich The Kid & Playboi Carti - Carnival (Clean Lyrics) - Clean Recordz.mp3", "priority": 4},
    {"id": "t111", "title": "WGFT", "artist": "Gunna feat. Burna Boy", "file": "WGFT - Gunna feat Burna Boy.mp3", "priority": 9},
    {"id": "t112", "title": "Burning Blue", "artist": "Mariah the Scientist", "file": "Mariah the Scientist - Burning Blue.mp3", "priority": 7},

]


CLIENTS = []      # 320kbps Clients
CLIENTS_192 = []  # 192kbps Clients

# Global Circular Buffers
# BURST_BUFFER: Pre-fills new clients for instant playback
# Adjusted for ~20 seconds of audio to keep start times aligned across qualities
# 320k: ~40KB/s -> 20s = 800KB. Chunks=16KB -> 50 chunks
# 192k: ~24KB/s -> 20s = 480KB. Chunks=16KB -> 30 chunks
BURST_BUFFER = deque(maxlen=50)      # 320kbps
BURST_BUFFER_192 = deque(maxlen=30)  # 192kbps

CURRENT_TRACK_INFO = {"title": "Connecting...", "artist": "hopRadio"}

# Track Manager Queue
READY_TRACKS = Queue(maxsize=3)

def get_track_duration(file_path):
    try:
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return float(result.stdout.strip())
    except Exception as e:
        print(f"Error getting duration for {file_path}: {e}")
        return 0


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
                    # Get/Cache Duration
                    if 'duration' not in selected_track:
                         dur = get_track_duration(path)
                         if dur > 0:
                             selected_track['duration'] = dur
                             print(f"Duration cached for {selected_track['title']}: {dur}s")

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
        print("Refilling Weighted Shuffle Bag...")
        new_bag = []
        for track in PLAYLIST:
            # SIMPLE: The number IS how many copies go in the bag
            # Priority 9 = 9 copies = plays 9x more often
            # Priority 1 = 1 copy = plays rarely
            copies = track.get('priority', 5)  # Default 5 if missing
            
            for _ in range(copies):
                new_bag.append(track)
                
        SHUFFLE_BAG = new_bag
        random.shuffle(SHUFFLE_BAG)
        print(f"Bag Refilled! Size: {len(SHUFFLE_BAG)} items")

    # 2. Pop with Retry (avoid immediate repeats)
    # Try up to 10 times to find a song not in LAST_PLAYED
    for _ in range(10):
        if not SHUFFLE_BAG: break # Should not happen unless bag is tiny
        
        candidate = SHUFFLE_BAG[-1]
        
        # Check History
        if LAST_PLAYED and candidate['id'] in [t['id'] for t in LAST_PLAYED]:
             # Collision! Swap with a random item deeper in the bag
             if len(SHUFFLE_BAG) > 5:
                 idx = random.randint(0, len(SHUFFLE_BAG) - 2)
                 SHUFFLE_BAG[-1], SHUFFLE_BAG[idx] = SHUFFLE_BAG[idx], SHUFFLE_BAG[-1]
                 continue # Retry loop
             else:
                 # Bag too small to care, just play it
                 break
        else:
            break
            
    track = SHUFFLE_BAG.pop()
    
    # 3. Add to history
    LAST_PLAYED.append(track)
    
    return track

# Broadcast Thread using FFmpeg subprocess
def broadcast_stream():
    global CURRENT_TRACK_INFO
    print("Starting Dual-Broadcast Loop (320k + 192k)...")
    
    CHUNK_SIZE = 16384 
    
    while True:
        # Get next ready track
        item = READY_TRACKS.get()
        track = item['track']
        local_path = item['path']
            
        print(f"Now Playing: {track['title']}")
        
        # DELAYED METADATA UPDATE (Sync with Audio Buffer)
        # Buffer is ~20s deep, but we want the UI to update when audio arrives?
        # Actually, with the burst buffer reducation (20s), a 5s delay is a good safe zone
        # to ensure the previous track has finished playing on the client.
        def update_meta_delayed():
             global CURRENT_TRACK_INFO
             
             # Calculate Duration (Accurate)
             dur = get_track_duration(local_path)
             if dur == 0: dur = os.path.getsize(local_path) / 40000 
             
             track['duration'] = dur
             track['started_at'] = time.time()
             
             CURRENT_TRACK_INFO = track
             print(f"METADATA UPDATED: {track['title']} (Duration: {dur/60:.1f}m)")
        
        # 5 second delay to match buffer flush
        threading.Timer(5.0, update_meta_delayed).start()
        
        # --- Stream A: 320kbps (HQ) ---
        cmd_320 = [
            'ffmpeg', '-re', '-i', local_path,
            '-af', 'highpass=f=28,lowshelf=g=3:f=95,equalizer=f=60:width_type=o:width=1:g=2,equalizer=f=800:width_type=o:width=1:g=-2,highshelf=g=9:f=10000,acompressor=threshold=-14dB:ratio=2:attack=8:release=250',
            '-f', 'mp3', '-b:a', '320k', '-bufsize', '1024k',
            '-ac', '2', '-ar', '44100', '-loglevel', 'error', 'pipe:1'
        ]

        # --- Stream B: 192kbps (Data Saver) ---
        cmd_192 = [
            'ffmpeg', '-re', '-i', local_path,
            '-af', 'highpass=f=28,lowshelf=g=3:f=95,equalizer=f=60:width_type=o:width=1:g=2,equalizer=f=800:width_type=o:width=1:g=-2,highshelf=g=9:f=10000,acompressor=threshold=-14dB:ratio=2:attack=8:release=250',
            '-f', 'mp3', '-b:a', '192k', '-bufsize', '512k', # Lower bitrate & buffer
            '-ac', '2', '-ar', '44100', '-loglevel', 'error', 'pipe:1'
        ]
        
        try:
            # Start BOTH encoders
            p320 = subprocess.Popen(cmd_320, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            p192 = subprocess.Popen(cmd_192, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            # We need to read both stdout streams concurrently without blocking
            # Simple approach: Use threads or just alternating non-blocking reads.
            # However, simpler for Python is threads to read and push to queues.
            
            def stream_reader(process, buffer_deque, clients_list, name):
                try:
                    while True:
                        chunk = process.stdout.read(CHUNK_SIZE)
                        if not chunk: break
                        
                        buffer_deque.append(chunk) # Update Burst
                        
                        # Dispatch
                        dead = []
                        for q in clients_list:
                            try:
                                if q.full():
                                    try: q.get_nowait()
                                    except Empty: pass
                                q.put_nowait(chunk)
                            except:
                                dead.append(q)
                        for d in dead:
                            if d in clients_list: clients_list.remove(d)
                except Exception as e:
                    print(f"Reader {name} error: {e}")

            t1 = threading.Thread(target=stream_reader, args=(p320, BURST_BUFFER, CLIENTS, "320"))
            t2 = threading.Thread(target=stream_reader, args=(p192, BURST_BUFFER_192, CLIENTS_192, "192"))
            
            t1.start()
            t2.start()
            
            t1.join()
            t2.join()
            
            p320.wait()
            p192.wait()
            
        except Exception as e:
            print(f"Streaming error: {e}")
            time.sleep(1)

# Start Background Threads
threading.Thread(target=track_manager_loop, daemon=True).start()
threading.Thread(target=broadcast_stream, daemon=True).start()

@app.get("/")
def index():
    next_track = None
    if not READY_TRACKS.empty():
        try:
            # Peek at the next item in the queue (thread-safe enough for read-only UI)
            item = READY_TRACKS.queue[0]
            next_track = item['track']
        except IndexError:
            pass

    return {
        "status": "radio_active", 
        "quality": "320kbps CBR",
        "listeners": len(CLIENTS),
        "now_playing": CURRENT_TRACK_INFO,
        "next_playing": next_track,
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
def stream_audio(q: str = "320"):
    # Select Queue based on quality param
    if q == "192":
        target_clients = CLIENTS_192
        target_burst = BURST_BUFFER_192
        print("New Client: 192kbps")
    else:
        target_clients = CLIENTS
        target_burst = BURST_BUFFER
        print("New Client: 320kbps")

    def event_stream():
        # Large Client Queue to absorb jitters
        client_q = Queue(maxsize=500) 
        
        # BURST: Pre-fill
        backlog = list(target_burst)
        for chunk in backlog:
            try:
                client_q.put_nowait(chunk)
            except Full:
                break
                
        target_clients.append(client_q)
        
        try:
            while True:
                chunk = client_q.get()
                yield chunk
        except Exception as e:
            pass # Disconnect
        finally:
            if client_q in target_clients:
                target_clients.remove(client_q)

    # Headers to prevent buffering AND Enable CORS for AudioContext
    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "*",
    }
    
    return StreamingResponse(event_stream(), media_type="audio/mpeg", headers=headers)
