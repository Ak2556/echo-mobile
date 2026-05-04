import os
import json
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Echo AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ── Models ──

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None

class EchoPublish(BaseModel):
    user_id: str
    username: str
    prompt: str
    response: str

class CommentCreate(BaseModel):
    echo_id: str
    user_id: str
    username: str
    content: str

class LikeToggle(BaseModel):
    echo_id: str
    user_id: str

class FollowToggle(BaseModel):
    follower_id: str
    following_id: str

class ReportCreate(BaseModel):
    reporter_id: str
    target_type: str  # 'user' | 'echo' | 'comment'
    target_id: str
    reason: str
    details: str | None = None

# ── Chat ──

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def event_generator():
        try:
            stream = await openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are Echo, a helpful and concise AI assistant. Keep responses focused and informative."},
                    {"role": "user", "content": request.message},
                ],
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content is not None:
                    data = json.dumps({"text": chunk.choices[0].delta.content})
                    yield f"data: {data}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# ── Feed ──

@app.get("/feed")
async def get_feed(page: int = 0, limit: int = 20):
    """Get the public feed of echoes."""
    return {"echoes": [], "page": page, "has_more": False}

@app.post("/echoes/publish")
async def publish_echo(echo: EchoPublish):
    """Publish a chat exchange to the public feed."""
    return {"id": f"echo_{echo.user_id}_{os.urandom(4).hex()}", "status": "published"}

@app.delete("/echoes/{echo_id}")
async def delete_echo(echo_id: str):
    return {"status": "deleted"}

# ── Comments ──

@app.get("/echoes/{echo_id}/comments")
async def get_comments(echo_id: str):
    return {"comments": []}

@app.post("/comments")
async def create_comment(comment: CommentCreate):
    return {"id": f"comment_{os.urandom(4).hex()}", "status": "created"}

@app.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str):
    return {"status": "deleted"}

# ── Likes ──

@app.post("/likes/toggle")
async def toggle_like(like: LikeToggle):
    return {"liked": True}

# ── Follows ──

@app.post("/follows/toggle")
async def toggle_follow(follow: FollowToggle):
    return {"following": True}

@app.get("/users/{user_id}/followers")
async def get_followers(user_id: str):
    return {"followers": []}

@app.get("/users/{user_id}/following")
async def get_following(user_id: str):
    return {"following": []}

# ── Users ──

@app.get("/users/{user_id}")
async def get_user(user_id: str):
    return {"user": None}

@app.get("/users/search/{query}")
async def search_users(query: str):
    return {"users": []}

# ── Notifications ──

@app.get("/notifications/{user_id}")
async def get_notifications(user_id: str, unread_only: bool = False):
    return {"notifications": []}

@app.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    return {"status": "read"}

# ── Reports ──

@app.post("/reports")
async def create_report(report: ReportCreate):
    return {"id": f"report_{os.urandom(4).hex()}", "status": "submitted"}

# ── Bookmarks ──

@app.post("/bookmarks/toggle")
async def toggle_bookmark(echo_id: str, user_id: str):
    return {"bookmarked": True}

@app.get("/bookmarks/{user_id}")
async def get_bookmarks(user_id: str):
    return {"bookmarks": []}

# ── Health ──

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
