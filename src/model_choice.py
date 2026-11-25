"""Which model each account chose (2026-11-25).

One small JSON file per account, beside the expert memory and for the same reason: the value is a
single pair of strings, so a table, a migration and a schema version would all be overhead. The
catalogue in ``agent.providers`` decides what is selectable; this module only remembers the answer.

Nothing here is trusted on read. A file naming a provider or model that the catalogue no longer has
yields ``None``, and the caller falls back to the configured default — a person who chose a model
that was later removed gets the default instead of an error on every request.
"""

import json
from pathlib import Path

from .agent import providers


def _path(root: Path, owner_id: str) -> Path:
    if not owner_id or "/" in owner_id or "\\" in owner_id or owner_id in (".", ".."):
        raise ValueError("账户标识不能用作目录名")
    return Path(root) / "model_choice" / f"{owner_id}.json"


def read(root: Path, owner_id: str) -> tuple[str, str] | None:
    """This account's choice, or ``None`` when it has none (or the stored one is gone).

    An unusable account id is an error rather than ``None``: ``None`` means "no choice", and
    answering that for ``../etc`` would hide a caller passing something it should not.
    """
    path = _path(root, owner_id)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    provider, model = data.get("provider"), data.get("model")
    if not isinstance(provider, str) or not isinstance(model, str):
        return None
    return (provider, model) if providers.resolve(provider, model) else None


def write(root: Path, owner_id: str, provider: str, model: str) -> tuple[str, str]:
    """Remember a choice, refusing anything outside the catalogue.

    Only these two strings are accepted. The endpoint and the credential come from the catalogue and
    from ``.env``, so an account can pick a model but can never redirect where the request goes.
    """
    found = providers.resolve(provider, model)
    if found is None:
        raise ValueError(f"目录里没有这个模型：{provider} / {model}")
    path = _path(root, owner_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"provider": found[0].id, "model": found[1].name},
                               ensure_ascii=False), encoding="utf-8")
    return (found[0].id, found[1].name)


def current(root: Path, owner_id: str) -> tuple[str, str]:
    """The account's choice, or the default when it has none. Always a catalogue entry."""
    chosen = read(root, owner_id)
    if chosen:
        return chosen
    found = providers.resolve(providers.DEFAULT_PROVIDER, None)
    return (found[0].id, found[1].name) if found else (providers.DEFAULT_PROVIDER, "")
