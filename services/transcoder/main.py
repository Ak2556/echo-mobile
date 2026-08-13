import os
import subprocess
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client

app = FastAPI()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

class TranscodeRequest(BaseModel):
    video_id: str
    staging_bucket: str = "staging-media"
    public_bucket: str = "public-media"

def process_video(video_id: str, staging_bucket: str, public_bucket: str):
    if not supabase:
        raise ValueError("Supabase client not initialized")
        
    # Download raw video
    raw_path = f"/tmp/{video_id}.mp4"
    res = supabase.storage.from_(staging_bucket).download(f"{video_id}.mp4")
    with open(raw_path, "wb") as f:
        f.write(res)
    
    # Transcode to HLS
    hls_dir = f"/tmp/{video_id}_hls"
    os.makedirs(hls_dir, exist_ok=True)
    m3u8_path = os.path.join(hls_dir, "index.m3u8")
    
    cmd = [
        "ffmpeg", "-i", raw_path,
        "-profile:v", "baseline", "-level", "3.0",
        "-s", "1280x720", "-start_number", "0",
        "-hls_time", "4", "-hls_list_size", "0",
        "-f", "hls", m3u8_path
    ]
    subprocess.run(cmd, check=True)
    
    # Upload segments and manifest to Supabase
    for filename in os.listdir(hls_dir):
        file_path = os.path.join(hls_dir, filename)
        with open(file_path, "rb") as f:
            # Set correct content type for m3u8
            content_type = "application/x-mpegURL" if filename.endswith(".m3u8") else "video/MP2T"
            supabase.storage.from_(public_bucket).upload(
                f"hls/{video_id}/{filename}", 
                f, 
                file_options={"content-type": content_type}
            )
            
    # Cleanup
    os.remove(raw_path)
    for filename in os.listdir(hls_dir):
        os.remove(os.path.join(hls_dir, filename))
    os.rmdir(hls_dir)

@app.post("/transcode")
async def transcode(req: TranscodeRequest, background_tasks: BackgroundTasks):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client not configured")
    background_tasks.add_task(process_video, req.video_id, req.staging_bucket, req.public_bucket)
    return {"status": "processing", "video_id": req.video_id}
