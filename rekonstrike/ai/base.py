"""Core AI provider abstraction with multi-provider support.

Resolves provider/model from args or config defaults, creates an async
client using the appropriate SDK, and returns the response text.
On any exception the error is logged and an empty string is returned.
Never retries.
"""

import json
import logging

logger = logging.getLogger(__name__)

PROVIDER_MODELS = {
    "openai": [
        "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini", "o1-preview",
    ],
    "anthropic": [
        "claude-3-opus-20240229", "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307", "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
    ],
    "google": [
        "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash",
    ],
    "openrouter": [
        "openai/gpt-4o", "openai/gpt-4o-mini",
        "anthropic/claude-3.5-sonnet", "google/gemini-1.5-pro",
    ],
}

DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-20241022",
    "google": "gemini-1.5-flash",
    "openrouter": "openai/gpt-4o-mini",
}


def _resolve_settings():
    """Lazy-import Settings to avoid circular imports at module level."""
    from rekonstrike.config import load_settings
    return load_settings()


def _get_api_key(settings, provider: str) -> str:
    key = settings.ai_api_keys.get(provider, "")
    return key or settings.api_key(provider)


async def _call_openai(system: str, user: str, model: str, max_tokens: int) -> str:
    """Call an OpenAI-compatible API (OpenAI, OpenRouter, Azure, etc.)."""
    from openai import AsyncOpenAI

    settings = _resolve_settings()
    api_key = _get_api_key(settings, "openai")
    base_url = settings.ai_base_urls.get("openai", "https://api.openai.com/v1")
    if not api_key:
        logger.warning("OpenAI API key not configured")
        return ""

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
    finally:
        await client.close()


async def _call_openrouter(system: str, user: str, model: str, max_tokens: int) -> str:
    """Call OpenRouter via the OpenAI-compatible SDK."""
    from openai import AsyncOpenAI

    settings = _resolve_settings()
    api_key = _get_api_key(settings, "openrouter")
    base_url = settings.ai_base_urls.get(
        "openrouter", "https://openrouter.ai/api/v1",
    )
    if not api_key:
        logger.warning("OpenRouter API key not configured")
        return ""

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=max_tokens,
            extra_headers={
                "HTTP-Referer": "https://rekonstrike.ai",
                "X-Title": "RekonStrike",
            },
        )
        return response.choices[0].message.content or ""
    finally:
        await client.close()


async def _call_anthropic(system: str, user: str, model: str, max_tokens: int) -> str:
    """Call Anthropic Claude via the anthropic SDK."""
    from anthropic import AsyncAnthropic

    settings = _resolve_settings()
    api_key = _get_api_key(settings, "anthropic")
    if not api_key:
        logger.warning("Anthropic API key not configured")
        return ""

    client = AsyncAnthropic(api_key=api_key)
    try:
        response = await client.messages.create(
            model=model,
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=max_tokens,
        )
        return response.content[0].text if response.content else ""
    finally:
        await client.close()


async def _call_google(system: str, user: str, model: str, max_tokens: int) -> str:
    """Call Google Gemini via raw aiohttp (no official async SDK)."""
    import aiohttp

    settings = _resolve_settings()
    api_key = _get_api_key(settings, "google")
    if not api_key:
        logger.warning("Google AI API key not configured")
        return ""

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": f"{system}\n\n{user}"}]}],
        "generationConfig": {"maxOutputTokens": max_tokens},
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as resp:
            if resp.status != 200:
                logger.warning(
                    "Google API returned %s: %s",
                    resp.status, await resp.text(),
                )
                return ""
            data = await resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            return parts[0].get("text", "") if parts else ""


async def call_ai(
    system: str,
    user: str,
    max_tokens: int = 1000,
    provider: str | None = None,
    model: str | None = None,
) -> str:
    """Send a single chat completion to the configured AI provider.

    Resolves *provider* and *model* from arguments, the project's config
    defaults, or the built-in fallback (openai / gpt-4o-mini).  Creates an
    async client via the appropriate SDK, sends one request, and returns
    the response text.

    On *any* exception the error is logged and an empty string is returned.
    Never retries.
    """
    settings = _resolve_settings()
    provider = provider or settings.ai_provider or "openai"
    model = model or settings.default_ai_model or DEFAULT_MODELS.get(provider, "gpt-4o-mini")

    try:
        if provider == "openai":
            return await _call_openai(system, user, model, max_tokens)
        elif provider == "openrouter":
            return await _call_openrouter(system, user, model, max_tokens)
        elif provider == "anthropic":
            return await _call_anthropic(system, user, model, max_tokens)
        elif provider == "google":
            return await _call_google(system, user, model, max_tokens)
        else:
            logger.warning("Unknown AI provider %r, falling back to openai", provider)
            return await _call_openai(system, user, model, max_tokens)
    except Exception:
        logger.exception("AI call failed for provider=%s model=%s", provider, model)
        return ""
