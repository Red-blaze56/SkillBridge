"""Provider-agnostic LLM clients.

One tiny interface, five backends. Screening and drafting each pick their own
provider from env vars, so you can point the cheap pass at Groq or Gemini and
keep Claude for the expensive drafting pass - or run the whole thing on a free
tier with no card on file.

    complete(system, user)            -> str   (every provider)
    complete_document(prompt, pdf)    -> str   (Anthropic + Gemini only)

Nothing here parses JSON or knows what a Job is. That lives in llm.py.
"""
from __future__ import annotations

import base64
import os
import time
from typing import Any

import requests

TIMEOUT = 120


class LLMError(RuntimeError):
    """Anything that came back wrong from a provider."""


class UnsupportedDocument(LLMError):
    """Provider cannot read a PDF; caller should fall back to plain text."""


def _http_post(name: str, url: str, **kwargs) -> requests.Response:
    """requests.post that raises a timeout, reset or DNS failure as LLMError.
    A raw requests error skips the fallback provider and the per-job handlers
    in llm.py (they catch LLMError), so one slow reply would kill the run."""
    try:
        return requests.post(url, timeout=TIMEOUT, **kwargs)
    except requests.RequestException as e:
        raise LLMError(f"{name} network error ({type(e).__name__}): {e}") from e


# ---------------------------------------------------------------------------


class Provider:
    name = "base"
    required_env: str | None = None

    def preflight(self) -> None:
        """Fail before the first call, not on batch 1 of 40.

        Without this a missing key surfaces as a per-batch warning, every batch
        fails the same way, and the run ends with an empty digest that reads as
        "no good jobs today".
        """
        if self.required_env:
            self._env(self.required_env)

    def complete(self, model: str, system: str, user: str, max_tokens: int,
                 json_mode: bool = False) -> str:
        """`json_mode` asks the provider to guarantee valid JSON where it can.

        Most providers have a native switch for this. It is a request, not a
        promise — llm.parse_json still has to cope with whatever comes back.
        """
        raise NotImplementedError

    def complete_document(self, model: str, prompt: str, pdf: bytes,
                          max_tokens: int) -> str:
        raise UnsupportedDocument(
            f"{self.name} cannot read PDFs here - pass a .txt/.md resume instead"
        )

    @staticmethod
    def _env(key: str) -> str:
        # An empty value is a missing value. A blank line in .env otherwise
        # sails past the check and fails much later as an opaque 401.
        value = (os.environ.get(key) or "").strip()
        if not value:
            raise LLMError(f"{key} is not set (see .env.example)")
        return value


class AnthropicProvider(Provider):
    """Claude via the official SDK."""

    name = "anthropic"
    required_env = "ANTHROPIC_API_KEY"

    def _client(self):
        try:
            from anthropic import Anthropic
        except ImportError:
            raise LLMError("pip install anthropic") from None
        return Anthropic(api_key=self._env("ANTHROPIC_API_KEY"))

    def _create(self, **kwargs) -> str:
        client = self._client()
        from anthropic import APIError
        try:
            msg = client.messages.create(**kwargs)
        except APIError as e:  # timeouts, connection errors, HTTP errors
            raise LLMError(f"anthropic {type(e).__name__}: {e}") from e
        return "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")

    def complete(self, model: str, system: str, user: str, max_tokens: int,
                 json_mode: bool = False) -> str:
        # No native JSON switch needed here — the prompts already specify the
        # shape and Claude honours it. json_mode is accepted and ignored.
        return self._create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )

    def complete_document(self, model: str, prompt: str, pdf: bytes,
                          max_tokens: int) -> str:
        return self._create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": [
                {"type": "document", "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.b64encode(pdf).decode(),
                }},
                {"type": "text", "text": prompt},
            ]}],
        )


class GeminiProvider(Provider):
    """Google AI Studio REST API. Generous free tier, no card needed."""

    name = "gemini"
    required_env = "GEMINI_API_KEY"
    BASE = "https://generativelanguage.googleapis.com/v1beta/models"

    def _post(self, model: str, body: dict) -> str:
        r = _http_post(
            self.name, f"{self.BASE}/{model}:generateContent",
            params={"key": self._env("GEMINI_API_KEY")},
            json=body,
        )
        if r.status_code != 200:
            raise LLMError(f"gemini HTTP {r.status_code}: {r.text[:300]}")
        try:
            candidate = r.json()["candidates"][0]
        except (KeyError, IndexError, ValueError) as e:
            raise LLMError(f"gemini returned no candidates: {r.text[:300]}") from e

        # Gemini 2.5+ spends output tokens on internal thinking, so a tight
        # maxOutputTokens gets consumed before the answer starts. That arrives
        # as truncated JSON or no parts at all — say so plainly instead of
        # letting it surface three layers up as a parse error.
        reason = candidate.get("finishReason")
        parts = (candidate.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if "text" in p)
        if reason == "MAX_TOKENS" or (not text and reason not in (None, "STOP")):
            raise LLMError(
                f"gemini stopped early (finishReason={reason}) with "
                f"{len(text)} chars of output — raise max_tokens for this stage"
            )
        if not text:
            raise LLMError(f"gemini returned no text: {r.text[:300]}")
        return text

    def complete(self, model: str, system: str, user: str, max_tokens: int,
                 json_mode: bool = False) -> str:
        gen: dict[str, Any] = {"maxOutputTokens": max_tokens, "temperature": 0.2}
        if json_mode:
            gen["responseMimeType"] = "application/json"
        body: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": gen,
        }
        if system:
            body["system_instruction"] = {"parts": [{"text": system}]}
        return self._post(model, body)

    def complete_document(self, model: str, prompt: str, pdf: bytes,
                          max_tokens: int) -> str:
        return self._post(model, {
            "contents": [{"role": "user", "parts": [
                {"inline_data": {"mime_type": "application/pdf",
                                 "data": base64.b64encode(pdf).decode()}},
                {"text": prompt},
            ]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.2},
        })


class OpenAICompatProvider(Provider):
    """Anything speaking /chat/completions - Groq, Together, OpenRouter, vLLM."""

    name = "openai-compatible"
    required_env = "GROQ_API_KEY"
    default_base = "https://api.groq.com/openai/v1"
    key_env = "GROQ_API_KEY"

    def complete(self, model: str, system: str, user: str, max_tokens: int,
                 json_mode: bool = False) -> str:
        base = os.getenv("LLM_BASE_URL", self.default_base).rstrip("/")
        messages = ([{"role": "system", "content": system}] if system else []) + \
                   [{"role": "user", "content": user}]
        payload: dict[str, Any] = {"model": model, "messages": messages,
                                   "max_tokens": max_tokens, "temperature": 0.2}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        for attempt in range(4):
            r = _http_post(
                self.name, f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {self._env(self.key_env)}"},
                json=payload,
            )
            # Groq's free tier caps tokens per minute and says how long to wait.
            if r.status_code != 429 or attempt == 3:
                break
            wait = min(float(r.headers.get("retry-after") or 10), 60)
            print(f"  rate limited, waiting {wait:.0f}s ...")
            time.sleep(wait + 1)
        if r.status_code != 200:
            raise LLMError(f"{self.name} HTTP {r.status_code}: {r.text[:300]}")
        try:
            return r.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as e:
            raise LLMError(f"{self.name} malformed reply: {r.text[:300]}") from e


class GroqProvider(OpenAICompatProvider):
    name = "groq"


class OpenRouterProvider(Provider):
    """OpenRouter API client with support for free (:free) and open-source models."""

    name = "openrouter"
    required_env = "OPENROUTER_API_KEY"
    BASE = "https://openrouter.ai/api/v1/chat/completions"

    # Map friendly aliases to exact available OpenRouter :free model IDs
    ALIASES = {
        "nvidia/nemotron-3-ultra:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nemotron:free": "nvidia/nemotron-3-ultra-550b-a55b:free",
    }

    def _get_key(self) -> str:
        # Check OPENROUTER_API_KEY first, fallback to JOB_SCOUT_KEY
        key = (os.getenv("OPENROUTER_API_KEY") or os.getenv("JOB_SCOUT_KEY") or "").strip()
        if not key:
            raise LLMError("OPENROUTER_API_KEY (Job scout key) is not set (see .env)")
        return key

    def preflight(self) -> None:
        self._get_key()

    def complete(self, model: str, system: str, user: str, max_tokens: int,
                 json_mode: bool = False) -> str:
        key = self._get_key()
        resolved_model = self.ALIASES.get(model, model)

        messages = ([{"role": "system", "content": system}] if system else []) + \
                   [{"role": "user", "content": user}]
        payload: dict[str, Any] = {
            "model": resolved_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.2,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {key}",
            "HTTP-Referer": "https://github.com/jobscout",
            "X-Title": "JobScout",
            "Content-Type": "application/json",
        }

        for attempt in range(4):
            try:
                r = requests.post(self.BASE, headers=headers, json=payload, timeout=TIMEOUT)
            except requests.RequestException as e:
                if attempt == 3:
                    raise LLMError(f"openrouter network error: {e}") from e
                time.sleep(2)
                continue

            if r.status_code == 429:
                if attempt == 3:
                    break
                wait = min(float(r.headers.get("retry-after") or 5), 30)
                print(f"  openrouter rate limited, waiting {wait:.0f}s ...")
                time.sleep(wait)
                continue
            break

        if r.status_code != 200:
            raise LLMError(f"openrouter HTTP {r.status_code}: {r.text[:300]}")
        try:
            return r.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as e:
            raise LLMError(f"openrouter malformed reply: {r.text[:300]}") from e


class FallbackProvider(Provider):
    """Wraps a primary provider; once it errors, every later call this run
    goes to the fallback instead. Built for free-tier quotas: once tripped,
    calls immediately retry and failover to the backup provider.
    """

    def __init__(self, primary: Provider, fallback: Provider, fallback_model: str):
        self.primary = primary
        self.fallback = fallback
        self.fallback_model = fallback_model
        self.name = f"{primary.name}->{fallback.name} (fallback)"
        self._tripped = False

    def preflight(self) -> None:
        self.primary.preflight()

    def complete(self, model: str, system: str, user: str, max_tokens: int,
                 json_mode: bool = False) -> str:
        if not self._tripped:
            try:
                return self.primary.complete(model, system, user, max_tokens, json_mode)
            except LLMError as e:
                print(f"  ! {self.primary.name} failed ({e}) — "
                      f"switching to {self.fallback.name} for this and future calls")
                self._tripped = True
        return self.fallback.complete(self.fallback_model, system, user, max_tokens, json_mode)

    def complete_document(self, model: str, prompt: str, pdf: bytes,
                          max_tokens: int) -> str:
        if not self._tripped:
            try:
                return self.primary.complete_document(model, prompt, pdf, max_tokens)
            except LLMError as e:
                print(f"  ! {self.primary.name} failed ({e}) — "
                      f"switching to {self.fallback.name} for this and future calls")
                self._tripped = True
        return self.fallback.complete_document(self.fallback_model, prompt, pdf, max_tokens)


class AlternateProvider(Provider):
    """Alternates calls between two providers (e.g. OpenRouter Nvidia :free and Groq).
    Call 1 goes to primary, Call 2 goes to secondary, etc.
    If either provider fails on a call, it retries immediately with the backup.
    If one trips quota or rate limits, it permanently locks to the working provider.
    """

    def __init__(self, primary: Provider, secondary: Provider,
                 primary_model: str, secondary_model: str):
        self.primary = primary
        self.secondary = secondary
        self.primary_model = primary_model
        self.secondary_model = secondary_model
        self.name = f"{primary.name}<->{secondary.name} (alternate)"
        self._count = 0
        self._primary_dead = False
        self._secondary_dead = False

    def preflight(self) -> None:
        self.primary.preflight()
        self.secondary.preflight()

    def complete(self, model: str, system: str, user: str, max_tokens: int,
                 json_mode: bool = False) -> str:
        self._count += 1
        # If one provider is exhausted/dead, route exclusively to the other
        if self._primary_dead and not self._secondary_dead:
            return self.secondary.complete(self.secondary_model, system, user, max_tokens, json_mode)
        if self._secondary_dead and not self._primary_dead:
            return self.primary.complete(self.primary_model, system, user, max_tokens, json_mode)

        # 1 time primary (Nvidia), 1 time secondary (Groq)
        use_primary = (self._count % 2 == 1)
        p1 = self.primary if use_primary else self.secondary
        m1 = self.primary_model if use_primary else self.secondary_model
        p2 = self.secondary if use_primary else self.primary
        m2 = self.secondary_model if use_primary else self.primary_model

        try:
            return p1.complete(m1, system, user, max_tokens, json_mode)
        except LLMError as e:
            print(f"  ! {p1.name} call failed ({e}) — retrying immediately with backup {p2.name}")
            err_text = str(e).lower()
            if any(k in err_text for k in ("429", "rate limit", "quota", "credits", "exhausted", "402")):
                print(f"  ! {p1.name} quota/rate limit tripped — switching permanently to {p2.name}")
                if use_primary:
                    self._primary_dead = True
                else:
                    self._secondary_dead = True
            return p2.complete(m2, system, user, max_tokens, json_mode)

    def complete_document(self, model: str, prompt: str, pdf: bytes,
                          max_tokens: int) -> str:
        try:
            return self.primary.complete_document(self.primary_model, prompt, pdf, max_tokens)
        except UnsupportedDocument:
            return self.secondary.complete_document(self.secondary_model, prompt, pdf, max_tokens)


class OllamaProvider(Provider):
    """Fully local. No key, no cost, no rate limit - just a slower model."""

    name = "ollama"

    def complete(self, model: str, system: str, user: str, max_tokens: int,
                 json_mode: bool = False) -> str:
        base = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        messages = ([{"role": "system", "content": system}] if system else []) + \
                   [{"role": "user", "content": user}]
        payload: dict[str, Any] = {
            "model": model, "messages": messages, "stream": False,
            "options": {"temperature": 0.2, "num_predict": max_tokens},
        }
        if json_mode:
            payload["format"] = "json"
        try:
            r = requests.post(
                f"{base}/api/chat", json=payload, timeout=TIMEOUT,
            )
        except requests.RequestException as e:
            raise LLMError(
                f"ollama unreachable at {base} - is `ollama serve` running?") from e
        if r.status_code != 200:
            raise LLMError(f"ollama HTTP {r.status_code}: {r.text[:300]}")
        try:
            return r.json()["message"]["content"]
        except (KeyError, ValueError) as e:
            raise LLMError(f"ollama malformed reply: {r.text[:300]}") from e


PROVIDERS = {
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "groq": GroqProvider,
    "openrouter": OpenRouterProvider,
    "openai-compatible": OpenAICompatProvider,
    "ollama": OllamaProvider,
}

# What each provider gets if you do not name a model, so `--scorer llm` works
# after setting nothing but a key.
DEFAULT_MODELS = {
    "anthropic": {"screen": "claude-haiku-4-5-20251001", "draft": "claude-sonnet-5"},
    "gemini": {"screen": "gemini-flash-latest", "draft": "gemini-flash-latest"},
    "groq": {"screen": "openai/gpt-oss-120b", "draft": "openai/gpt-oss-120b"},
    "openrouter": {"screen": "nvidia/nemotron-3-ultra-550b-a55b:free", "draft": "nvidia/nemotron-3-ultra-550b-a55b:free"},
    "openai-compatible": {"screen": "gpt-4o-mini", "draft": "gpt-4o"},
    "ollama": {"screen": "llama3.1", "draft": "llama3.1"},
}


def get_provider(name: str) -> Provider:
    try:
        return PROVIDERS[name]()
    except KeyError:
        raise LLMError(
            f"unknown provider {name!r}; pick one of {', '.join(PROVIDERS)}"
        ) from None


def resolve(stage: str, check: bool = True) -> tuple[Provider, str]:
    """Which provider + model handles this stage ("screen" or "draft")?

    Precedence: stage-specific env var -> global env var -> built-in default.
    Raises LLMError if the provider's credentials are missing.

    Supported strategies:
    - Default/Fallback: Starts with primary (e.g. OpenRouter Nvidia :free for screening,
      or Gemini for drafting). If quota/rate-limits trip, seamlessly falls back to Groq.
    - Alternate: If {STAGE}_STRATEGY=alternate or {STAGE}_PROVIDER=alternate, alternates calls
      1 time to primary (Nvidia :free) and 1 time to backup (Groq), with automatic retry.
    """
    strategy = (os.getenv(f"{stage.upper()}_STRATEGY")
                or os.getenv("LLM_STRATEGY") or "").strip().lower()

    name = (os.getenv(f"{stage.upper()}_PROVIDER")
            or os.getenv("LLM_PROVIDER")
            or "anthropic").strip().lower()

    # Alternate mode: alternates between OpenRouter (Nvidia) and Groq
    if strategy == "alternate" or name == "alternate":
        p_primary = get_provider("openrouter")
        m_primary = (os.getenv(f"{stage.upper()}_MODEL") or "").strip() \
            or DEFAULT_MODELS["openrouter"][stage]

        p_secondary = get_provider("groq")
        m_secondary = (os.getenv(f"{stage.upper()}_FALLBACK_MODEL")
                       or os.getenv("GROQ_MODEL") or "").strip() \
            or DEFAULT_MODELS["groq"][stage]

        if check:
            p_primary.preflight()
            p_secondary.preflight()
        return AlternateProvider(p_primary, p_secondary, m_primary, m_secondary), m_primary

    # Standard resolution
    provider = get_provider(name)
    model = (os.getenv(f"{stage.upper()}_MODEL") or "").strip() \
        or DEFAULT_MODELS.get(name, {}).get(stage)
    if not model:
        raise LLMError(f"set {stage.upper()}_MODEL for provider {name!r}")
    if check:
        provider.preflight()

    # Automatic fallback: Gemini or OpenRouter fall back to Groq, and Groq falls
    # back to OpenRouter (Nvidia Nemotron :free), when that key is available
    fallback_name = (os.getenv(f"{stage.upper()}_FALLBACK_PROVIDER") or "").strip().lower()
    has_groq = bool((os.environ.get("GROQ_API_KEY") or "").strip())
    has_openrouter = bool((os.environ.get("OPENROUTER_API_KEY")
                           or os.environ.get("JOB_SCOUT_KEY") or "").strip())
    if not fallback_name and name in ("gemini", "openrouter") and has_groq:
        fallback_name = "groq"
    elif not fallback_name and name == "groq" and has_openrouter:
        fallback_name = "openrouter"
    if fallback_name and fallback_name not in ("none", name):
        fallback_provider = get_provider(fallback_name)
        fallback_model = (os.getenv(f"{stage.upper()}_FALLBACK_MODEL") or "").strip() \
            or DEFAULT_MODELS.get(fallback_name, {}).get(stage)
        if fallback_model:
            provider = FallbackProvider(provider, fallback_provider, fallback_model)

    return provider, model
