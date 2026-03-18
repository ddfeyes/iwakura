"""Regression tests for issue #89: health_score must never be null/None.

Tests:
  - compute_health_score() always returns a numeric int (not None)
  - GET /api/status response always contains a numeric health_score
"""

import sys
import os
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from status import compute_health_score


# ---------------------------------------------------------------------------
# Unit tests: compute_health_score
# ---------------------------------------------------------------------------

class TestComputeHealthScoreNotNull:
    """health_score must be an int (not None) under all input conditions."""

    def _assert_valid(self, result):
        assert result["health_score"] is not None, "health_score must not be None"
        assert isinstance(result["health_score"], (int, float)), (
            f"health_score must be numeric, got {type(result['health_score'])}"
        )
        assert 0 <= result["health_score"] <= 100, (
            f"health_score {result['health_score']} out of [0, 100]"
        )
        assert result["health_label"] in ("OPTIMAL", "STABLE", "DEGRADED", "CRITICAL")

    def test_baseline_healthy(self):
        result = compute_health_score(
            memory={"percent": 50},
            docker=[{"status": "Up 2 hours"}],
            openclaw_crons=[{"enabled": True}],
            ao_sessions=[],
        )
        self._assert_valid(result)
        assert result["health_score"] == 100

    def test_empty_inputs(self):
        """Empty / missing keys must not produce None."""
        result = compute_health_score(
            memory={},
            docker=[],
            openclaw_crons=[],
            ao_sessions=[],
        )
        self._assert_valid(result)

    def test_high_memory_deduction(self):
        result = compute_health_score(
            memory={"percent": 95},
            docker=[],
            openclaw_crons=[{"enabled": True}],
            ao_sessions=[],
        )
        self._assert_valid(result)
        assert result["health_score"] == 70  # 100 - 30

    def test_unhealthy_docker_deduction(self):
        result = compute_health_score(
            memory={"percent": 0},
            docker=[{"status": "Exited (1)"}],
            openclaw_crons=[{"enabled": True}],
            ao_sessions=[],
        )
        self._assert_valid(result)
        assert result["health_score"] == 60  # 100 - 40

    def test_no_enabled_crons_deduction(self):
        result = compute_health_score(
            memory={"percent": 0},
            docker=[],
            openclaw_crons=[],
            ao_sessions=[],
        )
        self._assert_valid(result)
        assert result["health_score"] == 80  # 100 - 20

    def test_stale_ao_sessions_deduction(self):
        result = compute_health_score(
            memory={"percent": 0},
            docker=[],
            openclaw_crons=[{"enabled": True}],
            ao_sessions=[{"age_seconds": 7200}],  # 2h > 1h threshold
        )
        self._assert_valid(result)
        assert result["health_score"] == 90  # 100 - 10

    def test_worst_case_clamped_to_zero(self):
        """Multiple deductions must clamp to 0, not go negative or None."""
        result = compute_health_score(
            memory={"percent": 95},   # -30
            docker=[{"status": "Exited (1)"}],  # -40
            openclaw_crons=[],  # -20
            ao_sessions=[{"age_seconds": 9999}],  # -10
        )
        self._assert_valid(result)
        assert result["health_score"] == 0


# ---------------------------------------------------------------------------
# Integration test: GET /api/status via FastAPI TestClient
# ---------------------------------------------------------------------------

def _make_mock_status():
    return {
        "timestamp": "2026-03-18T00:00:00Z",
        "health_score": 80,
        "health_label": "OPTIMAL",
        "crons": [],
        "ao_sessions": [],
        "ao_sessions_old_count": 0,
        "openclaw_crons": [],
        "docker": [],
        "memory": {"percent": 40, "used_gb": 4.0, "total_gb": 16.0},
        "lain": {"state": None, "initiative": None, "memory_files": []},
    }


def test_api_status_health_score_not_null():
    """GET /api/status must return a response where health_score is numeric, not null."""
    from fastapi.testclient import TestClient
    import main as app_module  # noqa: PLC0415

    mock_status = _make_mock_status()

    with patch.object(
        app_module.sys_status,
        "get_full_status",
        new=AsyncMock(return_value=mock_status),
    ):
        client = TestClient(app_module.app)
        response = client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert "health_score" in data, "health_score key missing from /api/status response"
    assert data["health_score"] is not None, "health_score must not be null"
    assert isinstance(data["health_score"], (int, float)), (
        f"health_score must be numeric, got {data['health_score']!r}"
    )
