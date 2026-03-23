"""Smoke / E2E tests for iwakura deployed API — closes #88.

These tests run against the live deployment at https://iwakura.111miniapp.com
and validate that all critical endpoints are healthy and returning valid data.

Run:
    pytest tests/test_smoke_e2e.py -v

Set env var IWAKURA_URL to override the target (default: production URL).
"""

import os
import json
import time
import pytest
import httpx

BASE_URL = os.environ.get("IWAKURA_URL", "https://iwakura.111miniapp.com").rstrip("/")
TIMEOUT  = 15.0  # seconds per request


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get(path: str) -> httpx.Response:
    return httpx.get(f"{BASE_URL}{path}", timeout=TIMEOUT, follow_redirects=True)


# ---------------------------------------------------------------------------
# 1. Root / frontend
# ---------------------------------------------------------------------------

class TestFrontend:
    def test_root_serves_html(self):
        """GET / must return 200 with HTML content."""
        r = get("/")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "IWAKURA" in r.text, "Expected IWAKURA title in HTML"

    def test_health_endpoint(self):
        """GET /health returns 200 (Cloudflare may proxy / → index)."""
        r = get("/health")
        # Either a JSON health payload or the HTML SPA is acceptable
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 2. /api/status
# ---------------------------------------------------------------------------

class TestApiStatus:
    def test_status_200(self):
        r = get("/api/status")
        assert r.status_code == 200

    def test_status_is_json(self):
        r = get("/api/status")
        data = r.json()
        assert isinstance(data, dict)

    def test_status_has_required_keys(self):
        r = get("/api/status")
        data = r.json()
        for key in ("timestamp", "health_score", "health_label", "memory"):
            assert key in data, f"Missing key: {key}"

    def test_status_health_score_not_null(self):
        r = get("/api/status")
        data = r.json()
        assert data["health_score"] is not None, "health_score must not be null"
        assert isinstance(data["health_score"], (int, float))
        assert 0 <= data["health_score"] <= 100

    def test_status_health_label_valid(self):
        r = get("/api/status")
        data = r.json()
        assert data["health_label"] in ("OPTIMAL", "STABLE", "DEGRADED", "CRITICAL")

    def test_status_timestamp_recent(self):
        """Timestamp should be within last 5 minutes (backend is alive)."""
        r = get("/api/status")
        data = r.json()
        ts_str = data.get("timestamp", "")
        assert ts_str, "timestamp is empty"
        from datetime import datetime, timezone
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        age_seconds = (datetime.now(timezone.utc) - ts).total_seconds()
        assert age_seconds < 300, f"timestamp is {age_seconds:.0f}s old — backend may be stale"

    def test_status_memory_has_percent(self):
        r = get("/api/status")
        data = r.json()
        mem = data.get("memory", {})
        assert "percent" in mem, "memory.percent missing"
        assert isinstance(mem["percent"], (int, float))


# ---------------------------------------------------------------------------
# 3. /api/session
# ---------------------------------------------------------------------------

class TestApiSession:
    def test_session_200(self):
        r = get("/api/session")
        assert r.status_code == 200

    def test_session_is_json(self):
        r = get("/api/session")
        data = r.json()
        assert isinstance(data, dict)

    def test_session_has_message_count(self):
        r = get("/api/session")
        data = r.json()
        assert "message_count" in data, "message_count missing from /api/session"
        assert isinstance(data["message_count"], int)
        assert data["message_count"] >= 0


# ---------------------------------------------------------------------------
# 4. /api/memory
# ---------------------------------------------------------------------------

class TestApiMemory:
    def test_memory_200(self):
        r = get("/api/memory")
        assert r.status_code == 200

    def test_memory_is_json(self):
        r = get("/api/memory")
        data = r.json()
        assert isinstance(data, (dict, list)), f"Expected dict or list, got {type(data)}"

    def test_memory_has_files_key_or_is_list(self):
        """API returns either a list of files or {files: [...]}."""
        r = get("/api/memory")
        data = r.json()
        if isinstance(data, list):
            pass  # bare list — fine
        else:
            assert "files" in data, f"Expected 'files' key in /api/memory, got: {list(data.keys())}"
            assert isinstance(data["files"], list)


# ---------------------------------------------------------------------------
# 5. /api/psyche
# ---------------------------------------------------------------------------

class TestApiPsyche:
    def test_psyche_200(self):
        r = get("/api/psyche")
        assert r.status_code == 200

    def test_psyche_is_json(self):
        r = get("/api/psyche")
        data = r.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# 6. /api/levels
# ---------------------------------------------------------------------------

class TestApiLevels:
    def _get_levels_list(self) -> list:
        """API returns either a bare list or {levels: [...]}."""
        r = get("/api/levels")
        assert r.status_code == 200
        data = r.json()
        if isinstance(data, list):
            return data
        assert "levels" in data, f"Expected 'levels' key, got: {list(data.keys())}"
        return data["levels"]

    def test_levels_200(self):
        r = get("/api/levels")
        assert r.status_code == 200

    def test_levels_is_list_or_wrapped(self):
        levels = self._get_levels_list()
        assert isinstance(levels, list)

    def test_levels_has_hub(self):
        levels = self._get_levels_list()
        hub_entries = [l for l in levels if l.get("level") == 0]
        assert hub_entries, "Level 0 (HUB) must be present in /api/levels"

    def test_levels_schema(self):
        levels = self._get_levels_list()
        for entry in levels:
            assert "level" in entry, f"'level' key missing from entry: {entry}"


# ---------------------------------------------------------------------------
# 7. Static assets reachable
# ---------------------------------------------------------------------------

class TestStaticAssets:
    def test_css_psx(self):
        r = get("/css/psx.css")
        assert r.status_code == 200, "css/psx.css not reachable"

    def test_js_app(self):
        r = get("/js/app.js")
        assert r.status_code == 200, "js/app.js not reachable"
