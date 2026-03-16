"""OpenClaw gateway client — runs openclaw agent subprocess for synchronous responses."""
import asyncio
import json
import os
import pathlib
import logging

logger = logging.getLogger(__name__)

LAIN_AGENT_ID = "lain"
SESSION_FILE = pathlib.Path(__file__).parent / ".session_id"
OPENCLAW_CONFIG = pathlib.Path.home() / ".openclaw" / "openclaw.json"


def _read_config() -> dict:
    try:
        with open(OPENCLAW_CONFIG) as f:
            return json.load(f)
    except Exception:
        return {}


def get_gateway_url() -> str:
    cfg = _read_config()
    port = cfg.get("gateway", {}).get("port", 18789)
    return f"http://127.0.0.1:{port}"


def get_hook_token() -> str:
    token = os.environ.get("OPENCLAW_HOOK_TOKEN")
    if token:
        return token
    cfg = _read_config()
    return cfg.get("hooks", {}).get("token", "")


def load_session_id() -> str | None:
    try:
        if SESSION_FILE.exists():
            sid = SESSION_FILE.read_text().strip()
            if sid:
                return sid
    except Exception:
        pass
    return None


def save_session_id(session_id: str) -> None:
    try:
        SESSION_FILE.write_text(session_id)
    except Exception:
        pass


# Global session state
_session_id: str | None = load_session_id()


async def send_message(text: str) -> dict | None:
    """Send a message to Lain via openclaw agent CLI. Returns dict with text and sessionId."""
    global _session_id

    cmd = ["openclaw", "agent", "--agent", LAIN_AGENT_ID, "--message", text, "--json"]
    if _session_id:
        cmd.extend(["--session-id", _session_id])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
    except asyncio.TimeoutError:
        logger.error("openclaw agent timed out")
        return None
    except Exception as e:
        logger.error(f"openclaw agent subprocess error: {e}")
        return None

    if proc.returncode != 0:
        logger.error(f"openclaw agent failed (rc={proc.returncode}): {stderr.decode()[:300]}")
        return None

    try:
        data = json.loads(stdout.decode())
    except Exception as e:
        logger.error(f"Failed to parse openclaw agent output: {e}")
        return None

    if data.get("status") != "ok":
        logger.error(f"openclaw agent returned non-ok status: {data}")
        return None

    result = data.get("result", {})
    payloads = result.get("payloads", [])
    text_response = " ".join(p.get("text", "") for p in payloads if p.get("text"))

    session_id = result.get("meta", {}).get("agentMeta", {}).get("sessionId", _session_id)
    if session_id and session_id != _session_id:
        _session_id = session_id
        save_session_id(session_id)

    return {
        "text": text_response,
        "sessionId": session_id or "",
        "runId": data.get("runId", ""),
    }


def get_current_session_id() -> str | None:
    return _session_id


def reset_session() -> None:
    global _session_id
    _session_id = None
    if SESSION_FILE.exists():
        SESSION_FILE.unlink()
