"""System status collector — crons, docker, memory, lain agent state."""
import asyncio
import json
import logging
import os
import pathlib
import platform
import shutil
import time
import yaml
from datetime import datetime

logger = logging.getLogger(__name__)

LAIN_WORKSPACE = pathlib.Path.home() / "agents" / "lain"
LAIN_MEMORY = LAIN_WORKSPACE / "memory"

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
    crons, docker, memory, ao_result, openclaw_crons = await asyncio.gather(
        get_cron_status(),
        get_docker_status(),
        get_memory_usage(),
        get_ao_sessions(),
        get_openclaw_crons(),
    )

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
        "lain": {
            "state": lain_state,
            "initiative": initiative,
            "memory_files": get_memory_file_stats(),
        },
    }
