"""Iwakura Platform Backend — FastAPI + WebSocket + OpenClaw proxy."""
import asyncio
import json
import logging
import pathlib
import random
import time
import uuid
from datetime import datetime, timedelta, timezone
import yaml
import markdown as md_lib
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from starlette.websockets import WebSocketState

import gateway
import status as sys_status

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend"
LAIN_BASE = pathlib.Path.home() / "agents" / "lain"
LAIN_MEMORY = LAIN_BASE / "memory"
LAIN_WORKSPACE = LAIN_BASE
STATE_FILE = LAIN_BASE / "STATE.yaml"
DIARY_HISTORY_FILE = pathlib.Path(__file__).parent / "diary_history.json"

app = FastAPI(title="Iwakura Platform", docs_url=None, redoc_url=None)

# ── Levels API data ───────────────────────────────────────────────────────────

LEVELS = [
    {
        "level": 0,
        "project": "HUB",
        "lain_id": None,
        "topic_id": None,
        "summary": "overview",
    },
    {
        "level": 1,
        "project": "svc-dash",
        "lain_id": "Lain001",
        "topic_id": 886,
        "summary": "crypto dashboard",
    },
    {
        "level": 2,
        "project": "iwakura",
        "lain_id": "Lain002",
        "topic_id": 829,
        "summary": "this platform",
    },
    {
        "level": 3,
        "project": "liqmir",
        "lain_id": "Lain003",
        "topic_id": None,
        "summary": "market maker",
    },
]

LEVEL_INDEX = {item["level"]: item for item in LEVELS}
NODE_BLUEPRINT = [
    ("Dia", "Diary / Chat", 0, 1),
    ("Tsk", "Tasks", 0, 3),
    ("Sts", "Status", 1, 2),
    ("Dc", "Docs", 2, 1),
    ("Env", "Env / Config", 2, 3),
]
LEVEL_CHAT_HISTORY = {item["level"]: [] for item in LEVELS}


def build_level_nodes(level_id: int) -> list[dict]:
    nodes: list[dict] = []
    for idx, (node_type, title, row, col) in enumerate(NODE_BLUEPRINT, start=1):
        node_name = f"{node_type}{idx:03d}"
        nodes.append({
            "id": f"L{level_id}-{node_name}",
            "name": node_name,
            "title": title,
            "type": node_type,
            "position": {"row": row, "col": col},
            "level": level_id,
            "row": row,
            "col": col,
        })
    return nodes


def get_level_or_404(level_id: int) -> dict:
    level = LEVEL_INDEX.get(level_id)
    if not level:
        raise HTTPException(404, "Level not found")
    return level

# ── Diary history ─────────────────────────────────────────────────────────────

def load_diary_history() -> list[dict]:
    try:
        if DIARY_HISTORY_FILE.exists():
            return json.loads(DIARY_HISTORY_FILE.read_text())
    except Exception:
        pass
    return []


def save_diary_entry(entry: dict):
    h = load_diary_history()
    h.append(entry)
    if len(h) > 200:
        h = h[-200:]
    DIARY_HISTORY_FILE.write_text(json.dumps(h, ensure_ascii=False))


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
    topic_id = websocket.query_params.get("topic_id")
    session_key = None
    if topic_id:
        session_key = f"agent:lain:telegram:group:-1003844426893:topic:{topic_id}"
    logger.info(f"WebSocket connected (topic_id={topic_id})")
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

                # Persist user message
                save_diary_entry({
                    "role": "user",
                    "text": text,
                    "code": gen_file_code(),
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                })

                # Send thinking indicator immediately
                await websocket.send_json({"type": "thinking"})

                file_code = gen_file_code()
                timestamp = time.strftime("%H:%M")
                token_count = 0
                response_tokens: list[str] = []

                # Stream tokens to the frontend line by line
                async for chunk in gateway.stream_message(text, session_key=session_key):
                    token_count += 1
                    response_tokens.append(chunk)
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
                    # Persist Lain response
                    save_diary_entry({
                        "role": "lain",
                        "text": "\n".join(response_tokens),
                        "code": file_code,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
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

@app.get("/api/levels")
async def api_levels():
    levels_out = []
    for item in LEVELS:
        levels_out.append({
            **item,
            "rows": 3,
            "max_cols": 8,
            "nodes": build_level_nodes(item["level"]),
        })
    return JSONResponse({"levels": levels_out})


@app.get("/api/level/{level_id}/chat")
async def api_level_chat_history(level_id: int):
    get_level_or_404(level_id)
    return JSONResponse({"level": level_id, "messages": LEVEL_CHAT_HISTORY[level_id]})


@app.post("/api/level/{level_id}/chat")
async def api_level_chat_send(level_id: int, payload: dict):
    level = get_level_or_404(level_id)
    message = str(payload.get("message", "")).strip()
    if not message:
        raise HTTPException(400, "Message is required")

    ts = datetime.now(timezone.utc).isoformat()
    user_entry = {"role": "user", "text": message, "timestamp": ts}
    reply_text = f"[mock:{level['project']}] Received: {message[:120]}"
    lain_entry = {
        "role": "lain",
        "text": reply_text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    history = LEVEL_CHAT_HISTORY[level_id]
    history.extend([user_entry, lain_entry])
    if len(history) > 200:
        LEVEL_CHAT_HISTORY[level_id] = history[-200:]

    return JSONResponse({
        "level": level_id,
        "project": level["project"],
        "reply": lain_entry,
        "messages": [user_entry, lain_entry],
    })


@app.get("/api/diary/history")
async def api_diary_history():
    return load_diary_history()[-50:]


@app.get("/api/status")
async def api_status():
    data = await sys_status.get_full_status()
    return JSONResponse(data)


@app.delete("/api/ao-sessions/idle")
async def api_kill_idle_sessions():
    killed = await sys_status.kill_idle_ao_sessions()
    return JSONResponse({"killed": killed, "count": len(killed)})


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


@app.get("/api/memory/search")
async def api_memory_search(q: str = ""):
    if not q or len(q) < 2:
        return JSONResponse({"results": []})
    query = q.lower()
    results = []
    if LAIN_MEMORY.exists():
        for f in sorted(LAIN_MEMORY.iterdir()):
            if not f.is_file():
                continue
            try:
                content = f.read_text(errors="replace")
                count = content.lower().count(query)
                if count == 0:
                    continue
                idx = content.lower().find(query)
                start = max(0, idx - 60)
                end = min(len(content), idx + len(query) + 80)
                excerpt = content[start:end].replace('\n', ' ').strip()
                results.append({"name": f.name, "excerpt": excerpt, "match_count": count})
            except Exception:
                pass
    results.sort(key=lambda x: x["match_count"], reverse=True)
    return JSONResponse({"results": results[:8], "query": q})


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


def get_recent_decisions() -> list:
    """Extract last 8 headings/bullets from today's (or yesterday's) diary file."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    diary = LAIN_MEMORY / f"{today}.md"
    if not diary.exists():
        yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
        diary = LAIN_MEMORY / f"{yesterday}.md"
    if not diary.exists():
        return []
    try:
        text = diary.read_text(errors="replace")
        entries = []
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("## ") or line.startswith("### "):
                entries.append(line.lstrip("#").strip())
            elif line.startswith("- ") and len(line) > 10:
                entries.append(line[2:].strip()[:100])
        return entries[-8:]
    except Exception:
        return []


def get_active_task() -> dict:
    """Read current task/goal from STATE.yaml."""
    if not STATE_FILE.exists():
        return {}
    try:
        with open(STATE_FILE) as f:
            data = yaml.safe_load(f)
        if not isinstance(data, dict):
            return {}
        return {
            "goal": str(data.get("goal", data.get("task", ""))),
            "status": str(data.get("status", "")),
            "remaining": data.get("remaining", []),
        }
    except Exception:
        try:
            text = STATE_FILE.read_text(errors="replace")
            task: dict = {}
            for line in text.splitlines():
                if line.startswith("goal:") or line.startswith("task:"):
                    task["goal"] = line.split(":", 1)[1].strip().strip('"')
                elif line.startswith("status:"):
                    task["status"] = line.split(":", 1)[1].strip().strip('"')
            return task
        except Exception:
            return {}


def get_memory_activity() -> dict:
    """Count memory files and report last-modified info."""
    try:
        files = list(LAIN_MEMORY.glob("*.md"))
        if not files:
            return {}
        latest = max(files, key=lambda f: f.stat().st_mtime)
        return {
            "file_count": len(files),
            "latest_file": latest.name,
            "latest_mtime": datetime.fromtimestamp(latest.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
        }
    except Exception:
        return {}


def _derive_mood(state: dict, initiative: dict, think: dict, think_delta: dict) -> dict:
    signals = []
    score = 0

    active_tasks = [t for t in state.get("tasks", []) if isinstance(t, dict) and t.get("status") == "in_progress"]
    if active_tasks:
        score += 30
        signals.append(f"{len(active_tasks)} task(s) active")

    if think_delta and think_delta.get("cycles", 0) > 0:
        score += 25
        signals.append(f"think cycles: {think_delta['cycles']}")

    msgs_today = initiative.get("messages_sent_today", 0)
    if msgs_today > 3:
        score += 20
        signals.append(f"{msgs_today} messages sent today")
    elif msgs_today > 0:
        score += 10
        signals.append(f"{msgs_today} message(s) today")

    failed = [t for t in state.get("tasks", []) if isinstance(t, dict) and t.get("status") == "failed"]
    if failed:
        score -= 20
        signals.append(f"{len(failed)} failed task(s)")

    if score >= 60:
        return {"label": "FOCUSED", "intensity": min(score, 100), "signals": signals, "color": "#ff8c00"}
    elif score >= 35:
        return {"label": "RESONANT", "intensity": score, "signals": signals, "color": "#00ff88"}
    elif score >= 15:
        return {"label": "DEEP", "intensity": score, "signals": signals, "color": "#00d4aa"}
    elif failed:
        return {"label": "ALERT", "intensity": max(30, abs(score)), "signals": signals, "color": "#ff4444"}
    else:
        return {"label": "IDLE", "intensity": 10, "signals": signals or ["no recent activity"], "color": "#8b7cc8"}


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

    # mood indicator
    data["mood"] = _derive_mood(
        data.get("state", {}),
        data.get("initiative", {}),
        data.get("think", {}),
        data.get("think_delta", {}),
    )

    # enriched context
    data["recent_decisions"] = get_recent_decisions()
    data["active_task"] = get_active_task()
    data["memory_activity"] = get_memory_activity()

    return JSONResponse(data)


@app.get("/api/tasks")
async def api_tasks():
    state_path = LAIN_MEMORY / "STATE.yaml"
    tasks_out = []
    metrics_out = {
        "active_count": 0,
        "done_count": 0,
        "paused_count": 0,
        "tests_passing": None,
        "prs_merged": None,
        "features_shipped": None,
    }

    if state_path.exists():
        try:
            raw = yaml.safe_load(state_path.read_text()) or {}
        except Exception:
            raw = {}

        tasks_raw = raw.get("tasks", [])
        if isinstance(tasks_raw, dict):
            tasks_raw = [tasks_raw]
        elif not isinstance(tasks_raw, list):
            tasks_raw = []

        for t in tasks_raw:
            if not isinstance(t, dict):
                continue

            status_raw = str(t.get("status", "")).lower()
            if status_raw in ("in_progress", "running"):
                status = "RUNNING"
                metrics_out["active_count"] += 1
            elif status_raw in ("paused",):
                status = "PAUSED"
                metrics_out["paused_count"] += 1
            elif status_raw in ("done", "complete", "completed"):
                status = "DONE"
                metrics_out["done_count"] += 1
            else:
                status = status_raw.upper() or "PENDING"

            done_list = t.get("done", [])
            if not isinstance(done_list, list):
                done_list = []
            remaining_list = t.get("remaining", [])
            if not isinstance(remaining_list, list):
                remaining_list = []

            stats = t.get("stats", {}) or {}
            done_count = int(stats.get("tasks_done", len(done_list)))
            remaining_count = len(remaining_list)
            total = done_count + remaining_count
            pct = round(done_count / total * 100, 1) if total > 0 else 0.0

            # Extract top-level metrics from stats
            if metrics_out["tests_passing"] is None and stats.get("tests_passing") is not None:
                metrics_out["tests_passing"] = stats["tests_passing"]
            if metrics_out["prs_merged"] is None and stats.get("prs_merged_total") is not None:
                metrics_out["prs_merged"] = stats["prs_merged_total"]
            if metrics_out["features_shipped"] is None and stats.get("features_shipped") is not None:
                metrics_out["features_shipped"] = str(stats["features_shipped"])

            # Wave status summary
            wave_status = t.get("wave_status", [])
            if not isinstance(wave_status, list):
                wave_status = []

            tasks_out.append({
                "id": str(t.get("id", "")),
                "goal": str(t.get("goal", ""))[:120],
                "status": status,
                "progress": {
                    "done": done_count,
                    "remaining": remaining_count,
                    "pct": pct,
                },
                "recent_done": [str(x) for x in done_list[-3:]],
                "next_remaining": [str(x) for x in remaining_list[:3]],
                "wave_status": [str(x) for x in wave_status[-3:]],
                "stats": {str(k): str(v) for k, v in stats.items()},
            })

    return JSONResponse({"tasks": tasks_out, "metrics": metrics_out})


@app.get("/api/search")
async def api_search(q: str = ""):
    if not q or len(q) < 2:
        return JSONResponse({"results": [], "total": 0, "query": q})
    query = q.lower()
    results = []

    # DIARY results first
    diary = load_diary_history()
    last_msg = diary[-1].get("text", "") if diary else ""
    diary_results = []
    for entry in diary:
        text = entry.get("text", "")
        idx = text.lower().find(query)
        if idx == -1:
            continue
        start = max(0, idx - 40)
        end = min(len(text), idx + len(query) + 40)
        snippet = text[start:end].replace('\n', ' ').strip()
        diary_results.append({
            "source": "DIARY",
            "file": entry.get("code", ""),
            "snippet": snippet,
            "timestamp": entry.get("timestamp", ""),
            "match_start": idx - start,
            "match_end": idx - start + len(query),
        })

    # MEMORY files
    memory_results = []
    files_to_check = []
    if LAIN_MEMORY.exists():
        files_to_check.extend(sorted(LAIN_MEMORY.iterdir()))
    memory_md = LAIN_WORKSPACE / "MEMORY.md"
    if memory_md.exists():
        files_to_check.append(memory_md)

    for f in files_to_check:
        if not f.is_file() or f.suffix not in (".md", ".txt", ".yaml", ".json"):
            continue
        try:
            content = f.read_text(errors="replace")
            idx = content.lower().find(query)
            if idx == -1:
                continue
            start = max(0, idx - 40)
            end = min(len(content), idx + len(query) + 40)
            snippet = content[start:end].replace('\n', ' ').strip()
            memory_results.append({
                "source": "MEMORY",
                "file": f.name,
                "snippet": snippet,
                "timestamp": datetime.fromtimestamp(f.stat().st_mtime).isoformat() + "Z",
                "match_start": idx - start,
                "match_end": idx - start + len(query),
            })
        except Exception:
            pass

    # DIARY first if query matches last message, else MEMORY first
    if query in last_msg.lower():
        results = diary_results + memory_results
    else:
        results = diary_results + memory_results

    results = results[:50]
    return JSONResponse({"results": results, "total": len(results), "query": q})


@app.get("/api/session")
async def api_session():
    return JSONResponse({
        "sessionId": gateway.get_current_session_id(),
        "message_count": len(load_diary_history()),
    })


@app.post("/api/session/reset")
async def api_session_reset():
    gateway.reset_session()
    return JSONResponse({"ok": True})


# ── WIRED feed ────────────────────────────────────────────────────────────────

async def get_wired_events() -> list[dict]:
    """Aggregate events from all sources for the WIRED activity feed."""
    events: list[dict] = []
    now = datetime.utcnow()

    # DIARY: last 10 messages
    diary = load_diary_history()
    for entry in diary[-10:]:
        role = entry.get("role", "user")
        prefix = "Human: " if role == "user" else "Lain: "
        text = entry.get("text", "")[:80]
        events.append({
            "id": entry.get("code", str(uuid.uuid4())),
            "ts": entry.get("timestamp", now.isoformat() + "Z"),
            "source": "DIARY",
            "level": "info",
            "text": prefix + text,
            "detail": entry.get("code", ""),
        })

    # AO sessions + MEMORY files + CRON jobs + SYSTEM in parallel
    ao_result, openclaw_crons, mem_usage, docker_containers = await asyncio.gather(
        sys_status.get_ao_sessions(),
        sys_status.get_openclaw_crons(),
        sys_status.get_memory_usage(),
        sys_status.get_docker_status(),
    )

    # AO sessions
    for s in ao_result.get("sessions", []):
        age = s.get("age_seconds") or 0
        status = s.get("status", "idle")
        ts = (now - timedelta(seconds=age)).isoformat() + "Z"
        events.append({
            "id": f"ao-{s['name']}",
            "ts": ts,
            "source": "AO",
            "level": "info" if status == "active" else "warn",
            "text": f"Session {s['name']} — {status.upper()}",
            "detail": (s.get("last_line") or "")[:80],
        })

    # MEMORY files modified in last 24h
    cutoff = now - timedelta(hours=24)
    if LAIN_MEMORY.exists():
        for f in LAIN_MEMORY.iterdir():
            if not f.is_file():
                continue
            try:
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
                if mtime >= cutoff:
                    events.append({
                        "id": f"mem-{f.name}-{int(mtime.timestamp())}",
                        "ts": mtime.isoformat() + "Z",
                        "source": "MEMORY",
                        "level": "info",
                        "text": f"File modified: {f.name}",
                        "detail": f"{f.stat().st_size} bytes",
                    })
            except Exception:
                pass

    # CRON: openclaw cron jobs
    for job in openclaw_crons:
        last_run = job.get("last_run") or ""
        events.append({
            "id": f"cron-{job.get('name', '')}",
            "ts": last_run if last_run else now.isoformat() + "Z",
            "source": "CRON",
            "level": "info" if job.get("enabled", True) else "warn",
            "text": f"Cron: {job.get('name', '')[:60]}",
            "detail": job.get("schedule", ""),
        })

    # SYSTEM: memory
    mem_pct = mem_usage.get("percent", 0)
    mem_level = "alert" if mem_pct > 85 else ("warn" if mem_pct > 70 else "info")
    events.append({
        "id": "sys-mem",
        "ts": now.isoformat() + "Z",
        "source": "SYSTEM",
        "level": mem_level,
        "text": f"Memory: {mem_pct}% used — {mem_usage.get('used', '?')} / {mem_usage.get('total', '?')}",
        "detail": f"Free: {mem_usage.get('free', '?')}",
    })

    # SYSTEM: docker containers
    for c in docker_containers:
        is_up = "Up" in c.get("status", "")
        events.append({
            "id": f"docker-{c.get('name', '')}",
            "ts": now.isoformat() + "Z",
            "source": "SYSTEM",
            "level": "info" if is_up else "warn",
            "text": f"Container {c.get('name', '')} — {'UP' if is_up else 'DOWN'}",
            "detail": c.get("status", "")[:60],
        })

    events.sort(key=lambda e: e["ts"], reverse=True)
    return events[:50]


@app.get("/api/wired")
async def api_wired():
    events = await get_wired_events()
    return JSONResponse({"events": events, "total": len(events)})


@app.get("/api/wired/stream")
async def api_wired_stream():
    async def generator():
        try:
            while True:
                events = await get_wired_events()
                data = json.dumps({"events": events})
                yield f"data: {data}\n\n"
                await asyncio.sleep(5)
        except (asyncio.CancelledError, GeneratorExit):
            pass

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
