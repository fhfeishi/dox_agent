"""Explicit, bounded Firecrawl search; results are never evidence until selected and parsed."""

import ipaddress
import re
from urllib.parse import urlsplit

import httpx


def normalize_domain(value: str) -> str:
    domain = value.strip().lower().rstrip(".")
    try:
        domain = domain.encode("idna").decode("ascii")
        ipaddress.ip_address(domain)
    except ValueError:
        pass
    except UnicodeError as exc:
        raise ValueError("请输入有效的公开域名") from exc
    else:
        raise ValueError("搜索范围需使用域名，不能使用 IP 地址")
    if not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", domain) or len(domain) > 253:
        raise ValueError("请输入有效的公开域名")
    return domain


def allowed_result(url: str, domains: list[str]) -> bool:
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and not parsed.username and any(
        host == domain or host.endswith("." + domain) for domain in domains)


async def search_web(query: str, domains: list[str], time_filter: str, limit: int, settings) -> list[dict]:
    if not settings.firecrawl_api_key:
        raise ValueError("网络搜索需要配置 FIRECRAWL_API_KEY")
    scoped_query = query + " (" + " OR ".join("site:" + domain for domain in domains) + ")"
    payload = {"query": scoped_query, "limit": limit, "sources": ["web"]}
    if time_filter != "any":
        payload["tbs"] = {"month": "qdr:m", "year": "qdr:y"}[time_filter]
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                settings.firecrawl_base_url.rstrip("/") + "/v2/search",
                headers={"Authorization": "Bearer " + settings.firecrawl_api_key.get_secret_value()},
                json=payload,
            )
    except httpx.RequestError as exc:
        raise ValueError("搜索服务暂时不可用；本地知识库未受影响") from exc
    if response.status_code >= 400:
        raise ValueError(f"网络搜索失败（HTTP {response.status_code}）")
    data = response.json()
    if not data.get("success") or not isinstance(data.get("data", {}).get("web"), list):
        raise ValueError("搜索服务未返回可用结果")
    return data["data"]["web"]
