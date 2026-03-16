"""Iwakura Platform Backend — FastAPI + WebSocket + OpenClaw proxy."""
import json
import logging
import pathlib
import random
import time
import yaml
import markdown as md_lib
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from starlette.websockets import WebSocketState

import gateway
import status as sys_status

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend"
LAIN_MEMORY = pathlib.Path.home() / "agents" / "lain" / "memory"
LAIN_WORKSPACE = pathlib.Path.home() / "agents" / "lain"

app = FastAPI(title="Iwakura Platform", docs_url=None, redoc_url=None)

# ── File code generation ─────────────────────────────────────────────────────

_file_code_counter = random.randint(10, 40)

def gen_file_code() -> str:
    global _file_code_counter
    _file_code_counter += 1
    prefixes = ["Lda", "Tda", "Wld", "Nda", "Ira"]
    prefix = prefixes[_file_code_counter % len(prefixes)]
    return f"{prefix}{_file_code_counter:03d}"


# ── WebSocket Chat ────────────────────────────────────────────────────────────

@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connected")
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            msg_type = msg.get("type")

            if msg_type == "message":
                text = msg.get("text", "").strip()
                if not text:
                    continue

                # Send thinking indicator immediately
                await websocket.send_json({"type": "thinking"})

                file_code = gen_file_code()
                timestamp = time.strftime("%H:%M")
                token_count = 0

                # Stream tokens to the frontend line by line
                async for chunk in gateway.stream_message(text):
                    token_count += 1
                    if token_count == 1:
                        # First token carries header info so frontend creates the bubble
                        await websocket.send_json({
                            "type": "token",
                            "text": chunk,
                            "fileCode": file_code,
                            "timestamp": timestamp,
                        })
                    else:
                        await websocket.send_json({"type": "token", "text": chunk})

                if token_count > 0:
                    await websocket.send_json({
                        "type": "done",
                        "sessionId": gateway.get_current_session_id() or "",
                        "fileCode": file_code,
                        "timestamp": timestamp,
                    })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "text": "SIGNAL LOST — WIRED UNREACHABLE",
                    })

            elif msg_type == "reset_session":
                gateway.reset_session()
                await websocket.send_json({"type": "session_reset"})

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if websocket.client_state != WebSocketState.DISCONNECTED:
            try:
                await websocket.send_json({"type": "error", "text": str(e)})
            except Exception:
                pass


# ── REST API ──────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def api_status():
    data = await sys_status.get_full_status()
    return JSONResponse(data)


@app.get("/api/memory")
async def api_memory_list():
    files = []
    if LAIN_MEMORY.exists():
        for f in sorted(LAIN_MEMORY.iterdir()):
            if f.is_file() and f.suffix in (".md", ".yaml", ".json", ".txt"):
                stat = f.stat()
                files.append({
                    "name": f.name,
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "type": f.suffix.lstrip("."),
                })
    return JSONResponse({"files": files})


@app.get("/api/memory/{filename}")
async def api_memory_file(filename: str):
    # Sanitize
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    fpath = LAIN_MEMORY / filename
    if not fpath.exists():
        raise HTTPException(404, "File not found")
    content = fpath.read_text(errors="replace")
    rendered = content
    if fpath.suffix == ".md":
        rendered = md_lib.markdown(content, extensions=["fenced_code", "tables"])
    return JSONResponse({"name": filename, "content": content, "rendered": rendered})


@app.get("/api/psyche")
async def api_psyche():
    data = {}

    # STATE.yaml
    state_path = LAIN_MEMORY / "STATE.yaml"
    if state_path.exists():
        try:
            data["state"] = yaml.safe_load(state_path.read_text()) or {}
        except Exception:
            data["state"] = {}

    # initiative-state.json
    init_path = LAIN_MEMORY / "initiative-state.json"
    if init_path.exists():
        try:
            data["initiative"] = json.loads(init_path.read_text())
        except Exception:
            data["initiative"] = {}

    # think-state.json
    think_path = LAIN_MEMORY / "think-state.json"
    if think_path.exists():
        try:
            data["think"] = json.loads(think_path.read_text())
        except Exception:
            data["think"] = {}

    # think-delta.json
    delta_path = LAIN_MEMORY / "think-delta.json"
    if delta_path.exists():
        try:
            data["think_delta"] = json.loads(delta_path.read_text())
        except Exception:
            data["think_delta"] = {}

    # SOUL.md excerpt
    soul_path = LAIN_WORKSPACE / "SOUL.md"
    if soul_path.exists():
        content = soul_path.read_text(errors="replace")
        data["soul_excerpt"] = content[:1500]

    # HEARTBEAT.md excerpt
    hb_path = LAIN_WORKSPACE / "HEARTBEAT.md"
    if hb_path.exists():
        content = hb_path.read_text(errors="replace")
        data["heartbeat"] = content[:1000]

    # session info
    data["session_id"] = gateway.get_current_session_id()

    return JSONResponse(data)


@app.get("/api/session")
async def api_session():
    return JSONResponse({"sessionId": gateway.get_current_session_id()})


# ── Static files + SPA fallback ───────────────────────────────────────────────

@app.get("/")
async def root():
    index = FRONTEND_DIR / "index.html"
    return HTMLResponse(index.read_text())


@app.get("/diary")
async def diary():
    page = FRONTEND_DIR / "diary.html"
    return HTMLResponse(page.read_text())


@app.get("/{path:path}")
async def spa_fallback(path: str):
    # Try to serve static file
    fpath = FRONTEND_DIR / path
    if fpath.exists() and fpath.is_file():
        suffix = fpath.suffix.lower()
        mime_map = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".ico": "image/x-icon",
            ".svg": "image/svg+xml",
            ".woff2": "font/woff2",
            ".woff": "font/woff",
        }
        content_type = mime_map.get(suffix, "application/octet-stream")
        return Response(fpath.read_bytes(), media_type=content_type)
    # SPA fallback
    index = FRONTEND_DIR / "index.html"
    return HTMLResponse(index.read_text())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8790, reload=False, log_level="info")
