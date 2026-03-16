"""System status collector — crons, docker, memory, lain agent state."""
import asyncio
import json
import pathlib
import platform
import time
import yaml
from datetime import datetime

LAIN_WORKSPACE = pathlib.Path.home() / "agents" / "lain"
LAIN_MEMORY = LAIN_WORKSPACE / "memory"


async def _run(cmd: list[str], timeout: int = 5) -> str:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode(errors="replace").strip()
    except Exception:
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


async def get_ao_sessions() -> list[dict]:
    """List tmux sessions with iw- prefix and capture their last output."""
    raw = await _run([
        "tmux", "list-sessions",
        "-F", "#{session_name}|#{session_created}|#{session_activity}"
    ])
    if not raw:
        return []

    sessions = []
    now = int(time.time())
    for line in raw.splitlines():
        parts = line.strip().split("|")
        if len(parts) < 3:
            continue
        name, created_str, activity_str = parts[0], parts[1], parts[2]
        if "iw-" not in name:
            continue
        try:
            activity_ts = int(activity_str)
        except ValueError:
            activity_ts = 0
        age_seconds = now - activity_ts if activity_ts else None
        status = "active" if (age_seconds is not None and age_seconds < 60) else "idle"

        last_line = await _run(["tmux", "capture-pane", "-t", name, "-p"])
        # get last non-empty line
        lines = [l for l in last_line.splitlines() if l.strip()]
        last = lines[-1][:80] if lines else ""

        sessions.append({
            "name": name,
            "age_seconds": age_seconds,
            "last_line": last,
            "status": status,
        })
    return sessions


async def get_openclaw_crons() -> list[dict]:
    """Fetch cron jobs from the OpenClaw gateway API."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get("http://127.0.0.1:18789/api/crons")
            resp.raise_for_status()
            data = resp.json()
            jobs = []
            for item in (data if isinstance(data, list) else data.get("jobs", [])):
                jobs.append({
                    "name": item.get("name", ""),
                    "schedule": item.get("schedule", ""),
                    "enabled": item.get("enabled", True),
                    "last_run": item.get("last_run", ""),
                })
            return jobs
    except Exception:
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


async def get_full_status() -> dict:
    crons, docker, memory, ao_sessions, openclaw_crons = await asyncio.gather(
        get_cron_status(),
        get_docker_status(),
        get_memory_usage(),
        get_ao_sessions(),
        get_openclaw_crons(),
    )

    lain_state = get_lain_state()
    initiative = get_initiative_state()

    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "crons": crons,
        "ao_sessions": ao_sessions,
        "openclaw_crons": openclaw_crons,
        "docker": docker,
        "memory": memory,
        "lain": {
            "state": lain_state,
            "initiative": initiative,
            "memory_files": get_memory_file_stats(),
        },
    }
