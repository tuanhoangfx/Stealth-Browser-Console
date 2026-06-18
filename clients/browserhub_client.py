"""
BrowserHub client (Python) — SDK chia sẻ cho các tool workspace gọi P0003.

Drop-in cho P0025: thay vì hand-roll httpx vào port 6003, import client này.
Hỗ trợ auth token (STEALTH_API_TOKEN), CDP passthrough, và job queue async.

Yêu cầu: httpx. Để connect_over_cdp cần playwright (tùy chọn).

Ví dụ:
    from browserhub_client import BrowserHub
    hub = BrowserHub()                      # token tự đọc từ env STEALTH_API_TOKEN
    await hub.launch(profile_id)
    cdp = await hub.cdp_endpoint(profile_id)  # -> "http://127.0.0.1:<port>"
    # async with async_playwright() as p:
    #     browser = await p.chromium.connect_over_cdp(cdp)
"""
from __future__ import annotations

import os
from typing import Any, AsyncIterator, Optional

import httpx

DEFAULT_BASE_URL = "http://127.0.0.1:6003"


class BrowserHubError(RuntimeError):
    pass


class BrowserHub:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        token: Optional[str] = None,
        timeout: float = 120.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token if token is not None else os.environ.get("STEALTH_API_TOKEN", "")
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def _request(self, method: str, path: str, json: Any = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.request(method, f"{self.base_url}{path}", json=json, headers=self._headers())
            if r.status_code >= 400:
                detail = r.text
                try:
                    detail = r.json().get("error", detail)
                except Exception:
                    pass
                raise BrowserHubError(f"{method} {path} → {r.status_code}: {detail}")
            return r.json()

    # ── Health / profiles ────────────────────────────────────────────────
    async def health(self) -> dict[str, Any]:
        return await self._request("GET", "/api/health")

    async def list_profiles(self) -> list[dict[str, Any]]:
        return (await self._request("GET", "/api/profiles")).get("profiles", [])

    async def list_profiles_page(
        self,
        limit: int = 100,
        offset: int = 0,
        search: str = "",
        group: str = "",
        status: str = "",
        sort: str = "updated_at",
        dir: str = "desc",
    ) -> dict[str, Any]:
        """Phân trang cho catalog lớn (10k–50k). Trả {profiles, total, limit, offset}."""
        from urllib.parse import urlencode

        params = {"limit": limit, "offset": offset, "sort": sort, "dir": dir}
        if search:
            params["search"] = search
        if group:
            params["group"] = group
        if status:
            params["status"] = status
        return await self._request("GET", f"/api/profiles?{urlencode(params)}")

    async def check_proxy(self, profile_id: str = "", proxy: str = "") -> dict[str, Any]:
        """Health-check proxy + geoip-consistency. Truyền profile_id hoặc proxy string."""
        body: dict[str, Any] = {}
        if profile_id:
            body["profile_id"] = profile_id
        if proxy:
            body["proxy"] = proxy
        return await self._request("POST", "/api/proxy/check", json=body)

    async def jobs_stats(self) -> dict[str, Any]:
        return (await self._request("GET", "/api/jobs/stats")).get("stats", {})

    async def launch(self, profile_id: str) -> dict[str, Any]:
        return await self._request("POST", f"/api/profiles/{profile_id}/launch")

    async def close(self, profile_id: str) -> dict[str, Any]:
        return await self._request("POST", f"/api/profiles/{profile_id}/close")

    async def status(self, profile_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/profiles/{profile_id}/status")

    # ── CDP passthrough ──────────────────────────────────────────────────
    async def cdp_info(self, profile_id: str) -> dict[str, Any]:
        """Trả {ok, port, endpoint, webSocketDebuggerUrl}. Profile phải đang chạy."""
        return await self._request("GET", f"/api/profiles/{profile_id}/cdp")

    async def cdp_endpoint(self, profile_id: str) -> str:
        """HTTP endpoint để playwright.connect_over_cdp / puppeteer.connect."""
        info = await self.cdp_info(profile_id)
        if not info.get("ok"):
            raise BrowserHubError(f"CDP không sẵn sàng: {info.get('error')}")
        return info["endpoint"]

    # ── Automation đồng bộ ───────────────────────────────────────────────
    async def open_url(self, profile_id: str, target_url: str, **opts: Any) -> dict[str, Any]:
        body = {"profile_id": profile_id, "target_url": target_url, **opts}
        return await self._request("POST", "/api/automation/open-url", json=body)

    # ── Job queue async ──────────────────────────────────────────────────
    async def enqueue(self, job_type: str, payload: dict[str, Any]) -> str:
        res = await self._request("POST", "/api/jobs", json={"type": job_type, "payload": payload})
        return res["jobId"]

    async def job(self, job_id: str) -> dict[str, Any]:
        return (await self._request("GET", f"/api/jobs/{job_id}")).get("job", {})

    async def stream_job(self, job_id: str) -> AsyncIterator[dict[str, Any]]:
        """SSE: yield từng event tới khi job kết thúc."""
        import json as _json

        async with httpx.AsyncClient(timeout=None) as c:
            async with c.stream("GET", f"{self.base_url}/api/jobs/{job_id}/events", headers=self._headers()) as r:
                async for line in r.aiter_lines():
                    if line.startswith("data: "):
                        evt = _json.loads(line[6:])
                        yield evt
                        if evt.get("event") == "end":
                            return
