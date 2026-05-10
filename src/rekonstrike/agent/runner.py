import os
import logging
from typing import Optional
from .graph import compiled_graph
from .state import ReconState
from rekonstrike.config import load_settings

logger = logging.getLogger(__name__)

class ReconAgentRunner:
    def __init__(self, settings=None):
        self.settings = settings or load_settings()
        self.graph = compiled_graph
        
    async def run_reconnaissance(
        self,
        target_domain: str,
        goal: str = "find all vulnerabilities",
        program_scope: dict = None,
        max_steps: int = 10,
        verbose: bool = True
    ) -> ReconState:
        if verbose:
            logging.info(f"Starting reconnaissance for {target_domain}")
        
        initial_state = {
            "target_domain": target_domain,
            "goal": goal,
            "program_scope": program_scope or {}
        }
        
        # Use recursion_limit to enforce max_steps
        config = {"recursion_limit": max_steps * 2} # each step is roughly 2 nodes
        
        try:
            final_state_dict = await self.graph.ainvoke(initial_state, config=config)
            final_state = ReconState(**final_state_dict)
        except Exception as e:
            logging.error(f"Execution error: {e}")
            final_state = ReconState(**initial_state)
            
        if verbose:
            logging.info(f"Discovered: {len(final_state.live_hosts)} live hosts")
            logging.info("Reconnaissance complete")
            
        return final_state
