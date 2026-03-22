"""System status collector — crons, docker, memory, lain agent state."""
import asyncio
import json
import logging
import os
import pathlib
import platform
import re
import shutil
import time
import yaml
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

LAIN_WORKSPACE = pathlib.Path.home() / "agents" / "lain"
LAIN_MEMORY = LAIN_WORKSPACE / "memory"
AGENTS_BASE = pathlib.Path.home() / "agents"
BOTS_BASE = pathlib.Path.home() / "agents" / "bots"

_OPENCLAW = shutil.which("openclaw") or "/usr/local/bin/openclaw"


async def _run(cmd: list[str], timeout: int = 5) -> str:
    env = {**os.environ, "PATH": "/usr/local/bin:/usr/bin:/bin:" + os.environ.get("PATH", "")}
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        if stderr:
            logger.debug("_run stderr: %s", stderr.decode(errors="replace")[:200])
        return stdout.decode(errors="replace").strip()
    except Exception as e:
        logger.warning("_run failed for %s: %s", cmd[0], e)
        return ""


def _read_json(path: pathlib.Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def _read_yaml(path: pathlib.Path) -> dict:
    try:
        return yaml.safe_load(path.read_text()) or {}
    except Exception:
        return {}


async def get_ao_sessions() -> dict:
    """List tmux sessions with iw- prefix and capture their last output.

    Returns dict with:
      - sessions: list of up to 5 sessions created within last 2h (fully enumerated)
      - old_count: count of sessions older than 2h (not enumerated)
    """
    raw = await _run([
        "tmux", "list-sessions",
        "-F", "#{session_name}|#{session_created}|#{session_activity}"
    ])
    if not raw:
        return {"sessions": [], "old_count": 0}

    candidate_sessions = []
    old_count = 0
    now = int(time.time())
    THRESHOLD_RECENT = 7200  # 2 hours

    for line in raw.splitlines():
        parts = line.strip().split("|")
        if len(parts) < 3:
            continue
        name, created_str, activity_str = parts[0], parts[1], parts[2]
        if "iw-" not in name:
            continue
        try:
            created_ts = int(created_str)
        except ValueError:
            created_ts = 0
        try:
            activity_ts = int(activity_str)
        except ValueError:
            activity_ts = 0

        age_seconds = now - created_ts if created_ts else None

        # Sessions older than 2h: count only, don't enumerate
        if age_seconds is not None and age_seconds > THRESHOLD_RECENT:
            old_count += 1
            continue

        candidate_sessions.append({
            "name": name,
            "created_ts": created_ts,
            "activity_ts": activity_ts,
            "age_seconds": age_seconds,
        })

    # Cap at 5 most recent sessions (sort by created_ts descending)
    candidate_sessions.sort(key=lambda s: s["created_ts"], reverse=True)
    candidate_sessions = candidate_sessions[:5]

    # Run capture-pane concurrently for all candidate sessions
    names = [s["name"] for s in candidate_sessions]
    captures = await asyncio.gather(*[
        _run(["tmux", "capture-pane", "-t", name, "-p"])
        for name in names
    ])

    sessions = []
    for s, capture in zip(candidate_sessions, captures):
        age_seconds = s["age_seconds"]
        activity_ts = s["activity_ts"]
        status = "active" if (activity_ts and now - activity_ts < 60) else "idle"
        lines = [ln for ln in capture.splitlines() if ln.strip()]
        last = lines[-1][:80] if lines else ""
        sessions.append({
            "name": s["name"],
            "age_seconds": age_seconds,
            "age_hours": round(age_seconds / 3600, 1) if age_seconds is not None else None,
            "last_line": last,
            "status": status,
        })
    return {"sessions": sessions, "old_count": old_count}


async def kill_idle_ao_sessions() -> list[str]:
    """Kill tmux sessions that are idle (bypass permissions) and older than 1 hour."""
    result = await get_ao_sessions()
    sessions = result["sessions"]
    killed = []
    for s in sessions:
        is_idle = "bypass permissions" in (s.get("last_line") or "").lower()
        old_enough = (s.get("age_seconds") or 0) > 3600
        if is_idle and old_enough:
            await _run(["tmux", "kill-session", "-t", s["name"]])
            killed.append(s["name"])
    return killed


async def get_openclaw_crons() -> list[dict]:
    """Fetch cron jobs via openclaw CLI (gateway /api/crons returns 404)."""
    import re as _re
    # All output (plugins noise + table) goes to stdout.
    # UUID-prefixed lines are actual cron rows; everything else is noise.
    raw_text = await _run([_OPENCLAW, "cron", "list"], timeout=15)
    if raw_text:
        uuid_re = _re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s', _re.I)
        status_kw = {"ok", "idle", "error", "running"}
        result = []
        for line in raw_text.splitlines():
            if not uuid_re.match(line):
                continue
            parts = line.split()
            if len(parts) < 3:
                continue
            # parts[0]=ID, parts[1]=Name, parts[2..]=Schedule words, then Next/Last/Status cols
            name = parts[1]
            schedule_parts = []
            job_status = "ok"
            for p in parts[2:]:
                if p.lower() in status_kw:
                    job_status = p.lower()
                    break
                # "in", "ago", numeric-only tokens mark the Next/Last columns
                if p in ("in", "ago", "-") or (len(schedule_parts) >= 3 and p[:1].isdigit()):
                    break
                schedule_parts.append(p)
            result.append({
                "name": name,
                "schedule": " ".join(schedule_parts),
                "enabled": job_status != "error",
                "last_run": "",
            })
        if result:
            return result

    # Fallback: read ~/.openclaw/openclaw.json
    cfg_path = pathlib.Path.home() / ".openclaw" / "openclaw.json"
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text())
            jobs = cfg.get("crons", cfg.get("jobs", []))
            result = []
            for item in (jobs if isinstance(jobs, list) else []):
                result.append({
                    "name": item.get("name", ""),
                    "schedule": str(item.get("schedule", "")),
                    "enabled": item.get("enabled", True),
                    "last_run": item.get("lastRun", item.get("last_run", "")),
                })
            return result
        except Exception:
            pass

    return []


async def get_cron_status() -> list[dict]:
    raw = await _run(["crontab", "-l"])
    jobs = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 5)
        if len(parts) < 6:
            continue
        schedule = " ".join(parts[:5])
        command = parts[5]
        # Extract label from command
        label = command[:80].replace("/Users/aivan", "~")
        jobs.append({"schedule": schedule, "command": label, "active": True})
    return jobs


async def get_docker_status() -> list[dict]:
    raw = await _run([
        "docker", "ps",
        "--format", '{"name":"{{.Names}}","status":"{{.Status}}","image":"{{.Image}}","ports":"{{.Ports}}"}'
    ])
    containers = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            containers.append(json.loads(line))
        except Exception:
            pass
    return containers


async def get_cpu_usage() -> dict:
    """Get CPU usage percentage (macOS + Linux)."""
    try:
        if platform.system() == "Darwin":
            # Use top in single-sample mode
            raw = await _run(["top", "-l", "1", "-n", "0", "-s", "0"], timeout=8)
            for line in raw.splitlines():
                if "CPU usage:" in line:
                    # "CPU usage: 12.50% user, 8.33% sys, 79.16% idle"
                    m = re.search(r'(\d+\.?\d*)\s*%\s*idle', line)
                    if m:
                        idle = float(m.group(1))
                        used = round(100.0 - idle, 1)
                        return {"percent": used, "idle": round(idle, 1)}
        else:
            import psutil
            cpu_pct = psutil.cpu_percent(interval=0.5)
            return {"percent": round(cpu_pct, 1), "idle": round(100 - cpu_pct, 1)}
    except Exception as e:
        logger.warning("get_cpu_usage failed: %s", e)
    return {"percent": 0.0, "idle": 100.0}


async def get_disk_usage() -> dict:
    """Get disk usage for the root filesystem."""
    try:
        raw = await _run(["df", "-k", "/"], timeout=5)
        lines = raw.splitlines()
        if len(lines) >= 2:
            parts = lines[1].split()
            if len(parts) >= 5:
                total_kb = int(parts[1])
                used_kb  = int(parts[2])
                avail_kb = int(parts[3])
                def gb(kb: int) -> str:
                    return f"{kb / (1024 * 1024):.1f} GB"
                pct = round(used_kb / max(total_kb, 1) * 100, 1)
                return {
                    "total":   gb(total_kb),
                    "used":    gb(used_kb),
                    "free":    gb(avail_kb),
                    "percent": pct,
                    "mount":   "/",
                }
    except Exception as e:
        logger.warning("get_disk_usage failed: %s", e)
    return {"total": "?", "used": "?", "free": "?", "percent": 0, "mount": "/"}


def _get_claude_usage_from_logs() -> dict:
    """Parse openclaw logs to extract Claude API token usage (5h and 7d rolling windows).

    Returns approximate usage metrics based on request/token logs.
    Falls back to 0 values if logs unavailable.
    """
    result = {
        "tokens_5h": 0,
        "tokens_7d": 0,
        "requests_5h": 0,
        "requests_7d": 0,
        "estimated": True,  # Always estimated from logs
    }

    log_paths = [
        pathlib.Path.home() / ".openclaw" / "logs",
        pathlib.Path("/tmp/openclaw"),
    ]

    now = datetime.utcnow()
    cutoff_5h = now - timedelta(hours=5)
    cutoff_7d  = now - timedelta(days=7)

    # Try to find any usage/token logs
    for log_dir in log_paths:
        if not log_dir.exists():
            continue
        for log_file in sorted(log_dir.glob("*.log"), reverse=True)[:10]:
            try:
                content = log_file.read_text(errors="replace")
                for line in content.splitlines():
                    # Look for lines like: [timestamp] tokens: 1234 or "usage": {"input_tokens": ...}
                    ts_match = re.search(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', line)
                    if not ts_match:
                        continue
                    try:
                        line_ts = datetime.fromisoformat(ts_match.group(1))
                    except ValueError:
                        continue

                    token_match = re.search(r'"total_tokens"\s*:\s*(\d+)', line)
                    if not token_match:
                        token_match = re.search(r'tokens\s*[:=]\s*(\d+)', line)
                    if token_match:
                        tokens = int(token_match.group(1))
                        if line_ts >= cutoff_7d:
                            result["tokens_7d"] += tokens
                            result["requests_7d"] += 1
                        if line_ts >= cutoff_5h:
                            result["tokens_5h"] += tokens
                            result["requests_5h"] += 1
            except Exception:
                continue

    return result


def get_claude_usage() -> dict:
    """Get Claude API usage metrics.

    Reads from openclaw data.db usage records or log files.
    Returns 5h and 7d rolling window stats.
    """
    # Try openclaw data.db first (sqlite)
    db_path = pathlib.Path.home() / ".openclaw" / "data.db"
    if db_path.exists():
        try:
            import sqlite3
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            now_ts = datetime.utcnow().timestamp()
            ts_5h  = now_ts - 5 * 3600
            ts_7d  = now_ts - 7 * 24 * 3600

            # Check available tables
            cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row[0] for row in cur.fetchall()}

            tokens_5h = 0
            tokens_7d = 0
            reqs_5h   = 0
            reqs_7d   = 0
            model_breakdown = {}

            if "usage" in tables:
                # usage table with timestamp, tokens, model columns
                for window_ts, is_5h in [(ts_5h, True), (ts_7d, False)]:
                    cur.execute(
                        "SELECT SUM(tokens), COUNT(*) FROM usage WHERE timestamp >= ?",
                        (window_ts,)
                    )
                    row = cur.fetchone()
                    if row and row[0]:
                        if is_5h:
                            tokens_5h, reqs_5h = int(row[0]), int(row[1])
                        else:
                            tokens_7d, reqs_7d = int(row[0]), int(row[1])

                # Model breakdown
                cur.execute(
                    "SELECT model, SUM(tokens) FROM usage WHERE timestamp >= ? GROUP BY model",
                    (ts_7d,)
                )
                for row in cur.fetchall():
                    if row[0]:
                        model_breakdown[str(row[0])] = int(row[1] or 0)

            elif "completions" in tables:
                # completions table
                for window_ts, is_5h in [(ts_5h, True), (ts_7d, False)]:
                    cur.execute(
                        "SELECT SUM(total_tokens), COUNT(*) FROM completions WHERE created_at >= ?",
                        (window_ts,)
                    )
                    row = cur.fetchone()
                    if row and row[0]:
                        if is_5h:
                            tokens_5h, reqs_5h = int(row[0]), int(row[1])
                        else:
                            tokens_7d, reqs_7d = int(row[0]), int(row[1])

            conn.close()

            return {
                "tokens_5h": tokens_5h,
                "tokens_7d": tokens_7d,
                "requests_5h": reqs_5h,
                "requests_7d": reqs_7d,
                "model_breakdown_7d": model_breakdown,
                "source": "db",
            }
        except Exception as e:
            logger.debug("Claude usage from DB failed: %s", e)

    # Fallback: parse logs
    log_usage = _get_claude_usage_from_logs()
    log_usage["source"] = "logs"
    return log_usage


async def get_memory_usage() -> dict:
    if platform.system() == "Darwin":
        raw = await _run(["vm_stat"])
        stats = {}
        page_size = 16384  # 16KB pages on Apple Silicon
        for line in raw.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                v = v.strip().rstrip(".")
                try:
                    stats[k.strip()] = int(v)
                except Exception:
                    pass
        free_pages = stats.get("Pages free", 0)
        active_pages = stats.get("Pages active", 0)
        wired_pages = stats.get("Pages wired down", 0)
        compressed = stats.get("Pages occupied by compressor", 0)
        total_bytes_approx = (free_pages + active_pages + wired_pages + compressed) * page_size
        used_bytes = (active_pages + wired_pages) * page_size
        free_bytes = free_pages * page_size

        def mb(b: int) -> str:
            return f"{b // (1024*1024)} MB"

        return {
            "total": mb(total_bytes_approx),
            "used": mb(used_bytes),
            "free": mb(free_bytes),
            "percent": round(used_bytes / max(total_bytes_approx, 1) * 100, 1),
        }
    else:
        try:
            import psutil
            mem = psutil.virtual_memory()
            return {
                "total": f"{mem.total // (1024*1024)} MB",
                "used": f"{mem.used // (1024*1024)} MB",
                "free": f"{mem.available // (1024*1024)} MB",
                "percent": mem.percent,
            }
        except Exception:
            return {"total": "?", "used": "?", "free": "?", "percent": 0}


def get_lain_state() -> dict:
    state = _read_yaml(LAIN_MEMORY / "STATE.yaml")
    return state


def get_initiative_state() -> dict:
    return _read_json(LAIN_MEMORY / "initiative-state.json")


def get_think_state() -> dict:
    return _read_json(LAIN_MEMORY / "think-state.json")


def get_memory_file_stats() -> list[dict]:
    files = []
    if LAIN_MEMORY.exists():
        for f in sorted(LAIN_MEMORY.iterdir()):
            if f.is_file():
                stat = f.stat()
                files.append({
                    "name": f.name,
                    "size": f"{stat.st_size // 1024} KB" if stat.st_size > 1024 else f"{stat.st_size} B",
                    "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                })
    return files


def compute_health_score(
    memory: dict, docker: list, openclaw_crons: list, ao_sessions: list
) -> dict:
    """Compute system health score (0-100) and label.

    Deductions:
      - Memory usage >90% → -30
      - Any docker container unhealthy → -40
      - No openclaw crons running → -20
      - AO sessions stale (all >1h idle) → -10
    """
    score = 100

    if memory.get("percent", 0) > 90:
        score -= 30

    for c in docker:
        if not (c.get("status") or "").lower().startswith("up"):
            score -= 40
            break

    enabled_crons = [c for c in openclaw_crons if c.get("enabled", True)]
    if not enabled_crons:
        score -= 20

    if ao_sessions:
        all_stale = all(
            (s.get("age_seconds") or 0) > 3600 for s in ao_sessions
        )
        if all_stale:
            score -= 10

    score = max(0, min(100, score))

    if score >= 80:
        label = "OPTIMAL"
    elif score >= 50:
        label = "STABLE"
    elif score >= 20:
        label = "DEGRADED"
    else:
        label = "CRITICAL"

    return {"health_score": score, "health_label": label}


async def get_full_status() -> dict:
    crons, docker, memory, ao_result, openclaw_crons, cpu, disk = await asyncio.gather(
        get_cron_status(),
        get_docker_status(),
        get_memory_usage(),
        get_ao_sessions(),
        get_openclaw_crons(),
        get_cpu_usage(),
        get_disk_usage(),
    )

    # Claude usage is synchronous (sqlite/log read), run in executor
    loop = asyncio.get_event_loop()
    claude_usage = await loop.run_in_executor(None, get_claude_usage)

    lain_state = get_lain_state()
    initiative = get_initiative_state()

    health = compute_health_score(
        memory, docker, openclaw_crons, ao_result["sessions"]
    )

    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "health_score": health["health_score"],
        "health_label": health["health_label"],
        "crons": crons,
        "ao_sessions": ao_result["sessions"],
        "ao_sessions_old_count": ao_result["old_count"],
        "openclaw_crons": openclaw_crons,
        "docker": docker,
        "memory": memory,
        "cpu": cpu,
        "disk": disk,
        "claude_usage": claude_usage,
        "lain": {
            "state": lain_state,
            "initiative": initiative,
            "memory_files": get_memory_file_stats(),
        },
    }


# ── Per-agent health data ──────────────────────────────────────────────────────

# Core agents with their workspace paths
AGENTS_REGISTRY = [
    {"id": "lain",       "name": "Lain",       "role": "Orchestrator",      "path": AGENTS_BASE / "lain"},
    {"id": "masami",     "name": "Masami",      "role": "Code Review",       "path": AGENTS_BASE / "masami"},
    {"id": "navi",       "name": "NAVI",        "role": "DevOps / Deploy",   "path": AGENTS_BASE / "navi"},
    {"id": "psyche",     "name": "Psyche",      "role": "Health Monitor",    "path": AGENTS_BASE / "psyche"},
    {"id": "the-wired",  "name": "The Wired",   "role": "Research",          "path": AGENTS_BASE / "the-wired"},
    {"id": "protocol7",  "name": "Protocol7",   "role": "Router",            "path": AGENTS_BASE / "protocol7"},
    {"id": "touko",      "name": "Touko",       "role": "Reflection",        "path": AGENTS_BASE / "touko"},
    {"id": "mika",       "name": "Mika",        "role": "Visual Director",   "path": AGENTS_BASE / "mika"},
]


def _read_agent_state(agent_path: pathlib.Path) -> dict:
    """Read STATE.yaml from an agent workspace."""
    for name in ("STATE.yaml", "state.yaml", "STATE.yml"):
        p = agent_path / name
        if p.exists():
            try:
                data = yaml.safe_load(p.read_text(errors="replace")) or {}
                return data if isinstance(data, dict) else {}
            except Exception:
                pass
    return {}


def _read_agent_heartbeat(agent_path: pathlib.Path) -> str:
    """Read HEARTBEAT.md excerpt."""
    hb = agent_path / "HEARTBEAT.md"
    if hb.exists():
        try:
            return hb.read_text(errors="replace")[:300]
        except Exception:
            pass
    return ""


def _get_last_memory_activity(agent_path: pathlib.Path) -> dict:
    """Get last modified memory file info."""
    mem_dir = agent_path / "memory"
    if not mem_dir.exists():
        return {}
    try:
        files = [f for f in mem_dir.iterdir() if f.is_file()]
        if not files:
            return {}
        latest = max(files, key=lambda f: f.stat().st_mtime)
        age_secs = time.time() - latest.stat().st_mtime
        return {
            "file": latest.name,
            "age_seconds": int(age_secs),
            "mtime": datetime.fromtimestamp(latest.stat().st_mtime).isoformat() + "Z",
        }
    except Exception:
        return {}


def _get_heartbeat_info(agent_path: pathlib.Path) -> dict:
    """Get HEARTBEAT.md mtime and first-line excerpt."""
    hb = agent_path / "HEARTBEAT.md"
    if not hb.exists():
        return {}
    try:
        stat = hb.stat()
        age_secs = int(time.time() - stat.st_mtime)
        content = hb.read_text(errors="replace")
        excerpt = next((ln.strip() for ln in content.splitlines() if ln.strip()), "")[:80]
        return {
            "age_seconds": age_secs,
            "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat() + "Z",
            "excerpt": excerpt,
        }
    except Exception:
        return {}


def _infer_agent_health(state: dict, last_activity: dict) -> dict:
    """Infer health status from state and last activity."""
    status_raw = str(state.get("status", "")).lower()

    if status_raw in ("active", "running", "in_progress"):
        health_status = "active"
    elif status_raw in ("idle", "ok", ""):
        health_status = "idle"
    elif status_raw in ("error", "critical", "failed"):
        health_status = "error"
    else:
        health_status = "idle"

    # If last memory activity is recent (<1h), bump to active
    age = last_activity.get("age_seconds", 999999)
    if age < 3600 and health_status == "idle":
        health_status = "active"

    # Build health object
    errors = state.get("consecutiveErrors", state.get("errors", 0))
    if isinstance(errors, (int, float)) and int(errors) > 2:
        health_status = "error"

    score = 100
    if health_status == "error":
        score = 20
    elif health_status == "idle":
        score = 60
    else:
        score = 90

    return {
        "status": health_status,
        "score": score,
        "consecutive_errors": int(errors) if isinstance(errors, (int, float)) else 0,
    }


def get_all_agents_health() -> list[dict]:
    """Collect per-agent health for all core agents + L3 bots."""
    agents = []

    for agent_def in AGENTS_REGISTRY:
        agent_path = agent_def["path"]
        state = _read_agent_state(agent_path)
        last_activity = _get_last_memory_activity(agent_path)
        heartbeat = _get_heartbeat_info(agent_path)
        health = _infer_agent_health(state, last_activity)

        # Extract last action from state
        last_action = (
            state.get("last_action")
            or state.get("current_task")
            or state.get("current_step")
            or state.get("goal")
            or ""
        )
        if isinstance(last_action, (list, dict)):
            last_action = str(last_action)

        agents.append({
            "id": agent_def["id"],
            "name": agent_def["name"],
            "role": agent_def["role"],
            "status": health["status"],
            "health_score": health["score"],
            "consecutive_errors": health["consecutive_errors"],
            "last_action": str(last_action)[:100],
            "last_activity": last_activity,
            "heartbeat": heartbeat,
            "state_summary": {
                k: str(v)[:80]
                for k, v in list(state.items())[:5]
                if k not in ("tasks", "wave_status", "done", "remaining")
            },
            "has_state": bool(state),
        })

    # Add L3 bots from /agents/bots/
    if BOTS_BASE.exists():
        for bot_dir in sorted(BOTS_BASE.iterdir()):
            if not bot_dir.is_dir() or bot_dir.name == "archive":
                continue
            state = _read_agent_state(bot_dir)
            last_activity = _get_last_memory_activity(bot_dir)
            heartbeat = _get_heartbeat_info(bot_dir)
            health = _infer_agent_health(state, last_activity)

            # Read IDENTITY.md for name/role
            name = bot_dir.name
            role = "Fragment Bot"
            identity_path = bot_dir / "IDENTITY.md"
            if identity_path.exists():
                try:
                    id_text = identity_path.read_text(errors="replace")
                    # Extract mission line
                    for line in id_text.splitlines():
                        if "**Mission**" in line or "Mission:" in line:
                            role = line.split(":", 1)[-1].strip()[:60].lstrip("*").strip()
                            break
                        if "**Name**" in line:
                            name_part = line.split(":", 1)[-1].strip().lstrip("*").strip()
                            if name_part:
                                name = name_part
                except Exception:
                    pass

            last_action = (
                state.get("current_task")
                or state.get("current_step")
                or state.get("status")
                or ""
            )

            agents.append({
                "id": bot_dir.name,
                "name": name,
                "role": role,
                "status": health["status"],
                "health_score": health["score"],
                "consecutive_errors": health["consecutive_errors"],
                "last_action": str(last_action)[:100],
                "last_activity": last_activity,
                "heartbeat": heartbeat,
                "state_summary": {
                    k: str(v)[:80]
                    for k, v in list(state.items())[:4]
                    if k not in ("tasks", "wave_status", "done", "remaining", "completed")
                },
                "has_state": bool(state),
                "is_bot": True,
            })

    return agents
