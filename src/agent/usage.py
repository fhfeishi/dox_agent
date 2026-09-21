"""Request-local provider usage; count each model run once, never estimate missing data."""

from langchain_core.callbacks import AsyncCallbackHandler


class ModelBudgetExceeded(RuntimeError):
    """Reserve the final model call after bounded research."""


class TurnUsage(AsyncCallbackHandler):
    def __init__(self, max_calls=12):
        self.runs = {}
        self.max_calls = max_calls
        self.phase = "understand"
        self.raise_error = True

    def set_phase(self, phase):
        self.phase = phase

    def _start(self, run_id):
        if run_id in self.runs:
            return
        reserve = 0 if self.phase in {"answer", "direct"} else 1
        if len(self.runs) >= self.max_calls - reserve:
            raise ModelBudgetExceeded("模型调用预算已用完")
        self.runs[run_id] = {"usage": None, "reason": "waiting_for_provider", "phase": self.phase}

    async def on_chat_model_start(self, serialized, messages, *, run_id, **kwargs):
        self._start(run_id)

    async def on_llm_start(self, serialized, prompts, *, run_id, **kwargs):
        self._start(run_id)

    async def on_llm_end(self, response, *, run_id, **kwargs):
        usage = None
        for generations in response.generations:
            for generation in generations:
                message = getattr(generation, "message", None)
                usage = getattr(message, "usage_metadata", None)
                if usage:
                    break
            if usage:
                break
        if not usage:
            raw = (response.llm_output or {}).get("token_usage") or {}
            usage = {"input_tokens": raw.get("prompt_tokens"), "output_tokens": raw.get("completion_tokens"),
                     "total_tokens": raw.get("total_tokens")}
        values = [usage.get(key) for key in ("input_tokens", "output_tokens", "total_tokens")]
        valid = all(type(value) is int and value >= 0 for value in values)
        phase = self.runs.get(run_id, {}).get("phase", self.phase)
        self.runs[run_id] = {
            "usage": values if valid else None,
            "reason": None if valid else "provider_did_not_report",
            "phase": phase,
        }

    async def on_llm_error(self, error, *, run_id, **kwargs):
        self.runs[run_id] = {"usage": None, "reason": "model_error",
                             "phase": self.runs.get(run_id, {}).get("phase", self.phase)}

    def snapshot(self):
        known = [item["usage"] for item in self.runs.values() if item["usage"] is not None]
        complete = len(known) == len(self.runs)
        totals = [sum(value[i] for value in known) for i in range(3)]
        reasons = {}
        phases = {}
        for item in self.runs.values():
            phases[item["phase"]] = phases.get(item["phase"], 0) + 1
            if item["reason"]:
                reasons[item["reason"]] = reasons.get(item["reason"], 0) + 1
        return {"input_tokens": totals[0] if complete else None,
                "output_tokens": totals[1] if complete else None,
                "total_tokens": totals[2] if complete else None,
                "reported_tokens": totals[2] if known else None,
                "calls": len(self.runs), "reported_calls": len(known), "complete": complete,
                "missing_reasons": reasons, "calls_by_phase": phases}
