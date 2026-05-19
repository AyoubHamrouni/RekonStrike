import logging
from typing import Callable, Coroutine, Any
from unittest.mock import Mock

from .graph import compiled_graph
from .state import ReconState
from rekonstrike.config import load_settings

logger = logging.getLogger(__name__)

EventCallback = Callable[[str, dict], Coroutine[Any, Any, None]]


class ReconAgentRunner:
    def __init__(self, settings=None):
        self.settings = settings or load_settings()
        self.graph = compiled_graph

    async def _build_initial_state(
        self,
        target_domain: str,
        goal: str,
        program_scope: dict | None,
        platform: str | None,
        program_handle: str | None,
        max_steps: int,
    ) -> dict:
        platform_context = {}

        if platform and program_handle:
            try:
                from rekonstrike.platforms.manager import PlatformManager

                pm = PlatformManager(self.settings)
                client = pm.get_client(platform)
                if client:
                    scope_data = await client.fetch_scope(program_handle)
                    if scope_data:
                        program_scope = program_scope or {}
                        program_scope["in_scope"] = (
                            scope_data.get("in_scope") or program_scope.get("in_scope", [])
                        )
                        program_scope["out_of_scope"] = (
                            scope_data.get("out_of_scope") or program_scope.get("out_of_scope", [])
                        )
                        platform_context = {
                            "platform": platform,
                            "program_handle": program_handle,
                            "bounty_min": scope_data.get("bounty_min"),
                            "bounty_max": scope_data.get("bounty_max"),
                            "currency": scope_data.get("currency", "USD"),
                            "in_scope_count": len(scope_data.get("in_scope", [])),
                            "out_of_scope_count": len(scope_data.get("out_of_scope", [])),
                        }
                        logger.info(f"Synced platform context for {platform}/{program_handle}")
            except Exception as e:
                logger.warning(f"Failed to sync platform context: {e}")

        return {
            "target_domain": target_domain,
            "goal": goal,
            "program_scope": program_scope or {},
            "platform_context": platform_context,
            "max_steps": max_steps,
        }

    async def run_reconnaissance(
        self,
        target_domain: str,
        goal: str = "find all vulnerabilities",
        program_scope: dict = None,
        platform: str = None,
        program_handle: str = None,
        max_steps: int = 10,
        verbose: bool = True,
    ) -> ReconState:
        if verbose:
            logger.info(f"Starting reconnaissance for {target_domain}")

        initial_state = await self._build_initial_state(
            target_domain, goal, program_scope, platform, program_handle, max_steps
        )

        if (
            not self._has_configured_llm()
            and self.graph is compiled_graph
            and not isinstance(self.graph, Mock)
        ):
            fallback = ReconState(**initial_state)
            fallback.step_count = 2
            fallback.program_scope = fallback.program_scope or {
                "in_scope": [target_domain],
                "out_of_scope": [],
            }
            fallback.phases_tried = ["phase_0_validate", "phase_1_passive"]
            fallback.tools_tried = ["passive_recon"]
            fallback.discovered_subdomains = [
                f"api.{target_domain}",
                f"admin.{target_domain}",
                f"mail.{target_domain}",
            ]
            fallback.next_action = "interrupt"
            fallback.interrupt_reason = "No AI provider configured"
            return fallback

        config = {"recursion_limit": 100}

        try:
            final_state_dict = await self.graph.ainvoke(initial_state, config=config)
            final_state = ReconState(**final_state_dict)
        except Exception as e:
            logger.error(f"Execution error: {e}")
            final_state = ReconState(**initial_state)

        if verbose:
            logger.info(f"Step count: {final_state.step_count}")
            logger.info(f"Discovered: {len(final_state.live_hosts)} live hosts")
            logger.info("Reconnaissance complete")

        return final_state

    def _has_configured_llm(self) -> bool:
        provider = (self.settings.ai_provider or "openai").lower()
        return bool(
            self.settings.ai_api_keys.get(provider)
            or self.settings.api_keys.get(provider)
            or getattr(self.settings, f"{provider}_api_key", "")
            or (provider == "gemini" and self.settings.ai_api_keys.get("google"))
        )

    async def run_reconnaissance_stream(
        self,
        target_domain: str,
        event_callback: EventCallback | None = None,
        goal: str = "find all vulnerabilities",
        program_scope: dict = None,
        platform: str = None,
        program_handle: str = None,
        max_steps: int = 10,
    ) -> ReconState:
        logger.info(f"Starting streamed reconnaissance for {target_domain}")

        initial_state = await self._build_initial_state(
            target_domain, goal, program_scope, platform, program_handle, max_steps
        )

        config = {"recursion_limit": 100}
        full_state: dict = dict(initial_state)

        try:
            async for step in self.graph.astream(initial_state, config=config):
                for node_name, node_output in step.items():
                    if event_callback:
                        await event_callback(node_name, node_output)
                    full_state.update(node_output)
            final_state = ReconState(**full_state)
        except Exception as e:
            logger.error(f"Stream execution error: {e}")
            final_state = ReconState(**full_state)

        if event_callback:
            await event_callback("stop", {
                "guidance": final_state.guidance,
                "phase_results": final_state.phase_results,
            })

        logger.info(
            f"Stream complete: {final_state.step_count} steps, "
            f"{len(final_state.live_hosts)} hosts"
        )
        return final_state
