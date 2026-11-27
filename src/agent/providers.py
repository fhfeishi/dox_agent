"""Which models this deployment may use, and where each one lives (2026-11-25).

A static table rather than discovery: the point of an allow-list is that an account can only pick
from it, so nothing here may come from a request. Adding a provider or a model is a code change that
goes through review, and an unknown name is refused rather than forwarded.

Two things are deliberately NOT here:

- the API key. Each provider names the environment variable that holds it (``key_env``); the value
  is read from settings/.env only, never accepted from a request.
- a model's context window when it is not verified. ``context`` stays ``None`` and the interface
  shows the used count without drawing a proportion — a wrong denominator is worse than none.

The Qwen names below are the ones dashscope actually serves, read from its own
``/compatible-mode/v1/models`` list on 2026-11-25 — not from the open-weight release notes, which
name different models (the hosted Qwen3.8 line has a 27B entry the open weights do not). A name
typed from memory failed with "Model not exist", which is why this list is taken from the provider.

Windows (corrected 2026-11-26). The first version of this table said "128K unless noted", which was
wrong for every entry — the figure had been carried over from the DeepSeek V3 era and then copied
to the Qwen rows. Measured two ways, both agreeing:

- DeepSeek publishes it: ``GET /models`` returns ``context_window: 1048576`` and
  ``max_output_tokens: 393216`` per model. A 380k-token request with a unique word at the start
  came back with that word, so the window is real and not just advertised.
- DashScope does not publish it through that endpoint, so the model pages do (help.aliyun.com,
  上下文限制 table, read 2026-11-26). ``qwen3.8-27b`` and ``qwen3.8-flash``: 1M. ``qwen3.6-27b``
  and ``qwen3.5-27b``: 262144. A 380k-token needle test on qwen3.8-27b also answered correctly.

``context`` is the model's *context length* — the capacity the ring's denominator stands for — not
its maximum input length, which is smaller and differs under thinking mode (qwen3.8-27b takes
991808 in, 983616 with thinking on, against a 1M window).

``deepseek-v4-flash`` is an alias the API still accepts and echoes back as ``deepseek-flash``; the
``/models`` list carries the short id. Both work, so the established name is kept.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Model:
    name: str          # the provider's own id, sent verbatim
    label: str         # what the interface shows
    context: int | None  # verified context window in tokens; None = unknown, do not draw a ratio
    # 2026-11-25: some hosted models reason before answering and stream that reasoning as a separate
    # channel. Measured on this project's own report-sized prompt (20k tokens in): thinking on took
    # 346 s with the first visible character at 267 s and 26k chars of reasoning burned against a
    # 4096-token output budget, so the answer arrived empty; thinking off took 42 s, first character
    # at 3.6 s. ``quiet`` marks a model that must be asked not to think by default.
    quiet: bool = False


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    base_url: str
    key_env: str
    models: tuple[Model, ...] = field(default_factory=tuple)

    def model(self, name: str) -> Model | None:
        return next((item for item in self.models if item.name == name), None)


PROVIDERS: tuple[Provider, ...] = (
    Provider(
        id="deepseek",
        label="DeepSeek",
        base_url="https://api.deepseek.com",
        key_env="MODEL_API_KEY",
        models=(
            # DeepSeek retired the chat/reasoner names on 2026-07-24; the V4 names are current.
            Model("deepseek-v4-flash", "DeepSeek V4 Flash", 1_048_576),
            Model("deepseek-v4-pro", "DeepSeek V4 Pro", 1_048_576),
        ),
    ),
    Provider(
        id="dashscope",
        label="阿里云百炼",
        # The OpenAI-compatible endpoint: the project calls every model through ChatOpenAI, so a
        # provider only needs a compatible base_url to be usable here.
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        key_env="DASHSCOPE_API_KEY",
        models=(
            # The 27B entries are the user's baseline candidates (query 2026-1125 1100); the two
            # smaller hosted models are here so a cheaper comparison is one click away.
            Model("qwen3.8-27b", "Qwen3.8 27B（基线）", 1_000_000, quiet=True),
            Model("qwen3.6-27b", "Qwen3.6 27B", 262_144, quiet=True),
            Model("qwen3.5-27b", "Qwen3.5 27B", 262_144, quiet=True),
            Model("qwen3.8-flash", "Qwen3.8 Flash", 1_000_000, quiet=True),
        ),
    ),
)

DEFAULT_PROVIDER = "deepseek"


def provider(provider_id: str) -> Provider | None:
    return next((item for item in PROVIDERS if item.id == provider_id), None)


def resolve(provider_id: str | None, model_name: str | None) -> tuple[Provider, Model] | None:
    """The provider and model for a stored choice, or ``None`` when the pair is not in the catalogue.

    ``None`` rather than raising lets a caller fall back to the configured default: a catalogue
    entry removed between two requests must not break an account that had chosen it. An unset model
    means "this provider's first model"; an *unknown* one resolves to ``None`` rather than quietly
    becoming a different model — a person who chose qwen3-27b must not silently get qwen3-32b.
    """
    found = provider(provider_id or DEFAULT_PROVIDER)
    if found is None:
        return None
    if not model_name:
        return (found, found.models[0]) if found.models else None
    chosen = found.model(model_name)
    return (found, chosen) if chosen else None


def catalogue() -> list[dict]:
    """What the interface lists: providers, their models, and each model's window."""
    return [
        {
            "id": item.id,
            "label": item.label,
            "models": [{"name": model.name, "label": model.label, "context": model.context}
                       for model in item.models],
        }
        for item in PROVIDERS
    ]


def window(provider_id: str | None, model_name: str | None) -> int | None:
    """The context window of a choice, or ``None`` when it is not verified."""
    found = resolve(provider_id, model_name)
    return found[1].context if found else None


def quiet_body(provider_id: str | None, model_name: str | None) -> dict:
    """Extra request fields that turn a reasoning model's thinking off, or ``{}``.

    Kept here rather than in the client so the reason travels with the catalogue entry: a model is
    marked quiet because of how it behaved on this project's own prompts, not because of its name.
    """
    found = resolve(provider_id, model_name)
    return {"enable_thinking": False} if found and found[1].quiet else {}
