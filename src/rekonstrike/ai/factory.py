from typing import Any
import logging

from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger(__name__)


class NoopLLM:
    async def ainvoke(self, messages):
        class Response:
            content = '{"next_action": "stop", "reasoning": "No AI provider configured", "guidance": []}'

        return Response()


def get_llm(settings: Any, temperature: float = 0.0, tier: str = "", **kwargs) -> Any:
    """
    Factory function to instantiate the correct LangChain model based on settings.

    Args:
        settings: application settings (config.Settings)
        temperature: LLM temperature
        tier: "fast" | "deep" — selects ai_fast_model or ai_deep_model from settings.
              Falls back to default_ai_model if unset or if the tier-specific field is blank.
        **kwargs: passed through to the LangChain constructor, including model overrides.
    """
    # Resolve model from tier if not explicitly passed in kwargs
    if "model" not in kwargs:
        if tier == "fast" and settings.ai_fast_model:
            kwargs["model"] = settings.ai_fast_model
        elif tier == "deep" and settings.ai_deep_model:
            kwargs["model"] = settings.ai_deep_model
        else:
            kwargs["model"] = settings.default_ai_model

    provider = (settings.ai_provider or "openai").lower()
    key = (
        settings.ai_api_keys.get(provider)
        or settings.api_keys.get(provider)
        or (settings.ai_api_keys.get("google") if provider == "gemini" else "")
        or getattr(settings, f"{provider}_api_key", "")
    )
    if provider in {"openai", "anthropic", "google", "gemini", "openrouter"} and not key:
        logger.warning("No API key configured for AI provider '%s'; using no-op LLM.", provider)
        return NoopLLM()
    
    if provider == "openai":
        return ChatOpenAI(
            model=settings.default_ai_model,
            api_key=key,
            base_url=settings.ai_base_urls.get("openai") or None,
            temperature=temperature,
            **kwargs
        )
    elif provider == "anthropic":
        return ChatAnthropic(
            model=settings.default_ai_model,
            api_key=key,
            base_url=settings.ai_base_urls.get("anthropic") or None,
            temperature=temperature,
            **kwargs
        )
    elif provider in ["google", "gemini"]:
        return ChatGoogleGenerativeAI(
            model=settings.default_ai_model,
            google_api_key=key,
            temperature=temperature,
            **kwargs
        )
    elif provider == "openrouter":
        return ChatOpenAI(
            model=settings.default_ai_model,
            api_key=key,
            base_url=settings.ai_base_urls.get("openrouter") or "https://openrouter.ai/api/v1",
            temperature=temperature,
            **kwargs
        )
    else:
        logger.warning(f"Unknown AI provider '{provider}', falling back to OpenAI format.")
        return ChatOpenAI(
            model=settings.default_ai_model,
            api_key=settings.ai_api_keys.get(provider),
            base_url=settings.ai_base_urls.get(provider) or None,
            temperature=temperature,
            **kwargs
        )
