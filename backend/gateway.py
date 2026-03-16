"""OpenClaw gateway client — HTTP /v1/chat/completions SSE proxy.

Replaces the previous `openclaw agent` CLI approach which hangs when
stdout is piped (Node.js TTY detection blocks the process).
The /v1/chat/completions endpoint on the Gateway streams SSE tokens
synchronously, which is exactly what the WebSocket chat flow needs.
"""
import json
import logging
import os
import pathlib
from collections.abc import AsyncIterator

import httpx

logger = logging.getLogger(__name__)

LAIN_AGENT_ID   = "lain"
SESSION_FILE    = pathlib.Path(__file__).parent / ".session_id"
OPENCLAW_CONFIG = pathlib.Path.home() / ".openclaw" / "openclaw.json"

# Stable session user key — Gateway derives a persistent session from this
_SESSION_USER = "iwakura-lain"


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
    token = os.environ.get("OPENCLAW_TOKEN") or os.environ.get("OPENCLAW_HOOK_TOKEN")
    if token:
        return token
    cfg = _read_config()
    # Gateway auth token takes precedence over hooks token
    gw_token = cfg.get("gateway", {}).get("auth", {}).get("token", "")
    return gw_token or cfg.get("hooks", {}).get("token", "")


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


async def stream_message(text: str) -> AsyncIterator[str]:
    """Stream response chunks from OpenClaw /v1/chat/completions (SSE).

    Tries SSE streaming first.  If the stream yields no content (can happen
    when the primary model is overloaded and the gateway silently retries),
    falls back to a non-streaming request and yields the full response as one
    chunk.  The completion ID is stored as the session ID.
    """
    global _session_id

    url   = get_gateway_url() + "/v1/chat/completions"
    token = get_hook_token()
    base_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    completion_id: str | None = None
    got_content = False

    # ── 1. SSE streaming attempt ─────────────────────────────────
    try:
        sse_headers = {**base_headers, "Accept": "text/event-stream"}
        payload = {
            "model": f"openclaw:{LAIN_AGENT_ID}",
            "messages": [{"role": "user", "content": text}],
            "stream": True,
            "user": _SESSION_USER,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, json=payload, headers=sse_headers) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    logger.error(f"SSE {resp.status_code}: {body.decode()[:300]}")
                else:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            if not completion_id:
                                completion_id = chunk.get("id")
                            content = (
                                chunk.get("choices", [{}])[0]
                                .get("delta", {})
                                .get("content")
                            )
                            if content:
                                got_content = True
                                yield content
                        except Exception as e:
                            logger.warning(f"SSE parse: {e}")
    except Exception as e:
        logger.error(f"stream_message SSE error: {e}")

    if got_content:
        if completion_id and completion_id != _session_id:
            _session_id = completion_id
            save_session_id(completion_id)
        return

    # ── 2. Non-streaming fallback (model overloaded → gateway retries) ───
    logger.info("SSE yielded no content; falling back to non-streaming")
    try:
        payload_ns = {
            "model": f"openclaw:{LAIN_AGENT_ID}",
            "messages": [{"role": "user", "content": text}],
            "user": _SESSION_USER,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload_ns, headers=base_headers)
        if resp.status_code != 200:
            logger.error(f"non-streaming fallback {resp.status_code}: {resp.text[:300]}")
            return
        data = resp.json()
        completion_id = data.get("id", "") or completion_id
        response_text = (
            data.get("choices", [{}])[0].get("message", {}).get("content", "")
        )
        if response_text:
            yield response_text
    except Exception as e:
        logger.error(f"stream_message fallback error: {e}")
        return

    if completion_id and completion_id != _session_id:
        _session_id = completion_id
        save_session_id(completion_id)


async def send_message(text: str) -> dict | None:
    """Send a message and return full response (non-streaming fallback)."""
    global _session_id

    url     = get_gateway_url() + "/v1/chat/completions"
    token   = get_hook_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": f"openclaw:{LAIN_AGENT_ID}",
        "messages": [{"role": "user", "content": text}],
        "user": _SESSION_USER,
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except Exception as e:
        logger.error(f"send_message error: {e}")
        return None

    if resp.status_code != 200:
        logger.error(f"send_message {resp.status_code}: {resp.text[:300]}")
        return None

    try:
        data = resp.json()
    except Exception as e:
        logger.error(f"send_message JSON parse: {e}")
        return None

    completion_id = data.get("id", "")
    text_response = (
        data.get("choices", [{}])[0].get("message", {}).get("content", "")
    )

    if completion_id and completion_id != _session_id:
        _session_id = completion_id
        save_session_id(completion_id)

    return {
        "text": text_response,
        "sessionId": completion_id or _session_id or "",
        "runId": completion_id,
    }


def get_current_session_id() -> str | None:
    return _session_id


def reset_session() -> None:
    global _session_id
    _session_id = None
    if SESSION_FILE.exists():
        SESSION_FILE.unlink()
