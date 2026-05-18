import asyncio
from unittest.mock import AsyncMock, patch

from rekonstrike.agent.runner import ReconAgentRunner

async def main():
    with patch("rekonstrike.agent.graph.get_llm") as mock_get_llm:
        resp1 = AsyncMock(content='{"next_action": "phase_1_passive", "reasoning": "start"}')
        resp2 = AsyncMock(content='{"next_action": "stop", "reasoning": "done"}')
        mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp1, resp2])

        runner = ReconAgentRunner()
        result = await runner.run_reconnaissance(target_domain="example.com")
        print("discovered_subdomains:", result.discovered_subdomains)

if __name__ == '__main__':
    asyncio.run(main())
