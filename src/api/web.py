"""Web pages and controlled search, previewed before they enter a run or a library."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request

from ..parsers import parse_web
from ..web_search import allowed_result, search_web
from .common import (
    WebConfirmRequest,
    WebRequest,
    WebSearchRequest,
    logger,
    prune_web_entries,
)


def install(app, ctx):
    find_corpus = ctx.find_corpus
    knowledge_for = ctx.knowledge_for
    settings = ctx.settings
    router = APIRouter()

    def owner(request: Request) -> str:
        """The signed-in account. It is never taken from the request body (High#2, 2026-11-05)."""
        return request.state.user[0]

    def may_use(request: Request, author: str) -> bool:
        """A cached search, preview or snapshot belongs to the account that made it.

        An entry with no recorded author predates authorship and belongs to the administrator,
        the same rule every ownerless record follows. The client's own fields prove nothing.
        """
        username, role = request.state.user[:2]
        if not author:
            return role == "admin"
        return role == "admin" and author == username or author == username

    def require_use(request: Request, entry: dict, message: str) -> None:
        if not may_use(request, entry.get("created_by", "")):
            raise HTTPException(403, message)

    @router.get("/api/web/search/capability")
    async def web_search_capability():
        return {"provider": "firecrawl", "available": bool(settings.firecrawl_api_key),
                "max_domains": 3, "max_results": 5, "max_selected": 3}

    @router.post("/api/web/search")
    async def web_search(payload: WebSearchRequest, request: Request):
        if not settings.firecrawl_api_key:
            raise HTTPException(409, "网络搜索需要配置 FIRECRAWL_API_KEY")
        try:
            found = await search_web(payload.query, payload.domains,
                                     payload.time_filter, payload.limit, settings)
        except ValueError as exc:
            raise HTTPException(502, str(exc)) from exc
        except (TimeoutError, OSError) as exc:
            raise HTTPException(502, "搜索服务暂时不可用；本地资料库未受影响") from exc
        results = []
        seen = set()
        for item in found:
            if not isinstance(item, dict):
                continue
            url = item.get("url", "")
            if not isinstance(url, str) or url in seen or not allowed_result(url, payload.domains):
                continue
            seen.add(url)
            results.append({"result_id": uuid4().hex, "url": url,
                            "title": str(item.get("title") or url)[:300],
                            "snippet": str(item.get("description") or "")[:800]})
            if len(results) >= payload.limit:
                break
        now = datetime.now(UTC)
        search_id = uuid4().hex
        expires_at = now + timedelta(minutes=15)
        async with app.state.import_lock:
            app.state.searches = prune_web_entries(app.state.searches, now)
            app.state.searches[search_id] = {
                "query": payload.query, "domains": payload.domains,
                "time_filter": payload.time_filter, "results": {item["result_id"]: item for item in results},
                "selected": set(), "expires_at": expires_at,
                # The cache carries who made it, so nobody else can preview its results.
                "created_by": owner(request),
            }
        return {"search_id": search_id, "expires_at": expires_at.isoformat(),
                "query": payload.query, "domains": payload.domains,
                "time_filter": payload.time_filter, "provider": "firecrawl", "results": results}

    @router.post("/api/web/search/{search_id}/preview/{result_id}")
    async def preview_search_result(search_id: str, result_id: str, request: Request):
        now = datetime.now(UTC)
        async with app.state.import_lock:
            app.state.searches = prune_web_entries(app.state.searches, now)
            search = app.state.searches.get(search_id)
            if search is None:
                raise HTTPException(409, "搜索结果已过期，请重新搜索")
            # #3: checked under the same lock as the selection, so another account can neither spend
            # this search's three preview slots nor trigger a fetch on it.
            require_use(request, search, "这次搜索属于其他账户")
            result = search["results"].get(result_id)
            if result is None:
                raise HTTPException(404, "搜索结果不存在")
            if result_id in search["selected"]:
                raise HTTPException(409, "该结果已预览")
            if len(search["selected"]) >= 3:
                raise HTTPException(409, "每次搜索最多预览 3 个结果")
            search["selected"].add(result_id)
        try:
            doc = await parse_web(result["url"], settings)
        except Exception as exc:
            async with app.state.import_lock:
                search["selected"].discard(result_id)
            logger.warning("search result preview failed: %s", type(exc).__name__)
            raise HTTPException(502, "所选网页抓取失败；可以重试或保留本地资料库范围") from exc
        fetched_at = datetime.now(UTC)
        preview_id = uuid4().hex
        expires_at = fetched_at + timedelta(minutes=15)
        search_meta = {"search_query": search["query"], "search_domains": search["domains"],
                       "search_time_filter": search["time_filter"], "search_provider": "firecrawl"}
        async with app.state.import_lock:
            app.state.previews = prune_web_entries(app.state.previews, fetched_at)
            app.state.previews[preview_id] = {"doc": doc, "fetched_at": fetched_at.isoformat(),
                                              "expires_at": expires_at, "search": search_meta,
                                              "created_by": owner(request)}
        return {"preview_id": preview_id, "expires_at": expires_at.isoformat(), **doc.model_dump()}

    @router.post("/api/web/preview")
    async def preview(payload: WebRequest, request: Request):
        try:
            doc = await parse_web(payload.url, settings)
            now = datetime.now(UTC)
            preview_id = uuid4().hex
            expires_at = now + timedelta(minutes=15)
            async with app.state.import_lock:
                app.state.previews = prune_web_entries(app.state.previews, now)
                app.state.previews[preview_id] = {"doc": doc, "fetched_at": now.isoformat(),
                                                  "expires_at": expires_at, "created_by": owner(request)}
            return {"preview_id": preview_id, "expires_at": expires_at.isoformat(), **doc.model_dump()}
        except HTTPException:
            raise
        except (ValueError, TimeoutError) as exc:
            raise HTTPException(422, str(exc) or "网页抓取超时") from exc
        except Exception as exc:
            logger.warning("web preview failed: %s", type(exc).__name__)
            raise HTTPException(502, "抓取失败，请检查解析器安装、会话或网站访问权限") from exc

    @router.post("/api/web/confirm/{preview_id}")
    async def confirm(preview_id: str, payload: WebConfirmRequest, request: Request):
        if bool(payload.target_corpus_id) == payload.save_for_run:
            raise HTTPException(422, "请选择一个目标资料库或仅用于本次运行")
        # Using a page for one run is everyone's; adding it to a system library is the administrator's
        # (D-20261027-1).
        if payload.target_corpus_id and request.state.user[1] != "admin":
            raise HTTPException(403, "只有管理员可以把网页加入系统资料库")
        async with app.state.import_lock:
            app.state.previews = prune_web_entries(app.state.previews, datetime.now(UTC))
            current = app.state.previews.get(preview_id)
            if current is None or current["expires_at"] <= datetime.now(UTC):
                raise HTTPException(409, "预览已失效，请重新抓取")
            # #4: the preview belongs to the account that fetched it. Checked before the library
            # write and before the preview is dropped, so a refused confirm changes nothing.
            require_use(request, current, "这个预览属于其他账户")
            result = {}
            if payload.target_corpus_id:
                info = await asyncio.to_thread(find_corpus, payload.target_corpus_id)
                if info is None or info.missing:
                    raise HTTPException(409, "目标资料库已不可用，请重新选择")
                result = await asyncio.to_thread(knowledge_for(info).put, current["doc"])
            snapshot = await asyncio.to_thread(app.state.web_snapshots.save, current["doc"],
                                               fetched_at=current["fetched_at"],
                                               search=current.get("search"), created_by=owner(request))
            del app.state.previews[preview_id]
            return {**result, "web_snapshot_id": snapshot["web_snapshot_id"]}

    @router.get("/api/web/snapshots/{snapshot_id}")
    async def read_web_snapshot(snapshot_id: str, request: Request):
        """A snapshot is readable by its author or an administrator; ownerless ones are the
        administrator's. Chat consumption uses the same rule via ``read_snapshot``."""
        try:
            snapshot = await asyncio.to_thread(app.state.web_snapshots.get, snapshot_id)
        except KeyError as exc:
            raise HTTPException(404, "网页快照不存在") from exc
        require_use(request, snapshot, "这个网页快照属于其他账户")
        return snapshot

    app.include_router(router)
