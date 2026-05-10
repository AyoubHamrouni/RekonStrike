import asyncio
import json
import logging
import sys
import os

sys.path.append(os.path.join(os.getcwd(), "src"))

from rekonstrike.agent.runner import ReconAgentRunner

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')


async def main():
    print("=" * 60)
    print("REKONSTRIKE AUTONOMOUS AGENT DEMO")
    print("=" * 60)

    runner = ReconAgentRunner()

    program_scope = {
        "in_scope": ["example.com", "api.example.com"],
        "out_of_scope": ["internal.example.com"],
    }

    from unittest.mock import patch, AsyncMock

    # Mock LLM responses with the new guidance + strategy format
    resp_strategy = AsyncMock()
    resp_strategy.content = json.dumps({
        "next_action": "phase_1_passive",
        "reasoning": "I will start by gathering subdomains.",
        "strategy": {
            "focus_areas": ["api", "subdomain_takeover"],
            "depth_vs_breadth": "breadth",
            "risk_tolerance": "conservative",
            "priority_targets": ["api.example.com"],
            "reasoning": "Broad coverage for this VDP program",
        },
        "guidance": [
            "I'll start with passive recon to map the attack surface.",
            "This program is a VDP — breadth is appropriate here.",
        ],
    })

    resp_triage_probe = AsyncMock()
    resp_triage_probe.content = json.dumps({
        "next_action": "phase_3_httpprobe",
        "reasoning": "Now I will probe the discovered subdomains.",
        "analysis": {
            "interesting_findings": ["3 subdomains found in passive recon"],
            "key_insight": "api.example.com is a promising target",
        },
        "guidance": [
            "Discovered 3 subdomains including api.example.com.",
            "API endpoints often have higher bounty rewards — worth investigating.",
        ],
    })

    resp_triage_stop = AsyncMock()
    resp_triage_stop.content = json.dumps({
        "next_action": "stop",
        "reasoning": "I have completed the requested reconnaissance.",
        "analysis": {
            "interesting_findings": ["2 live hosts identified"],
            "key_insight": "Recon complete, findings available in dashboard",
        },
        "guidance": [
            "Found 2 live hosts. Review the findings in the dashboard.",
        ],
    })

    with patch('rekonstrike.agent.graph.get_llm') as mock_get_llm:
        mock_get_llm.return_value.ainvoke = AsyncMock(
            side_effect=[resp_strategy, resp_triage_probe, resp_triage_stop]
        )
        result = await runner.run_reconnaissance(
            target_domain="example.com",
            goal="identify high-priority reconnaissance targets",
            program_scope=program_scope,
            max_steps=5,
            verbose=True,
        )

    print("\n" + "=" * 60)
    print("RECONNAISSANCE SUMMARY")
    print("=" * 60)
    print(f"Target Domain:         {result.target_domain}")
    print(f"Total Step Count:      {result.step_count}")
    print(f"Phases Executed:       {', '.join(result.phases_tried)}")
    print(f"Tools Executed:        {', '.join(result.tools_tried)}")
    print(f"Subdomains Discovered: {len(result.discovered_subdomains)}")
    print(f"Live Hosts Found:      {len(result.live_hosts)}")
    print(f"Final Action:          {result.next_action}")

    if result.strategy:
        print(f"\nStrategy: {result.strategy.get('reasoning', 'N/A')}")
        print(f"Focus Areas: {', '.join(result.strategy.get('focus_areas', []))}")

    if result.guidance:
        print("\nGuidance (Agent's reasoning):")
        for g in result.guidance:
            print(f"  • {g}")

    if result.discovered_subdomains:
        print("\nDiscovered Subdomains (Top 5):")
        for subdomain in result.discovered_subdomains[:5]:
            print(f"  [+] {subdomain}")

    if result.live_hosts:
        print("\nLive Hosts Found (Top 5):")
        for host in result.live_hosts[:5]:
            print(f"  [*] {host['url']} (Status: {host.get('status_code')})")
            if host.get('tech_stack'):
                print(f"      Tech: {', '.join(host['tech_stack'])}")

    if result.phase_results:
        print(f"\nPhase Results Stored: {list(result.phase_results.keys())}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nDemo interrupted by user.")
