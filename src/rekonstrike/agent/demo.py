import asyncio
import logging
import sys
import os

# Ensure src is in path
sys.path.append(os.path.join(os.getcwd(), "src"))

from rekonstrike.agent.runner import ReconAgentRunner
from rekonstrike.agent.state import ReconState

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

async def main():
    print("="*60)
    print("REKONSTRIKE AUTONOMOUS AGENT DEMO")
    print("="*60)
    
    runner = ReconAgentRunner()
    
    program_scope = {
        "in_scope": ["example.com", "api.example.com"],
        "out_of_scope": ["internal.example.com"]
    }
    
    # We need to mock the LLM for the demo to run without an API key
    from unittest.mock import patch, AsyncMock
    
    # Mocking a simple successful recon path
    resp_passive = AsyncMock()
    resp_passive.content = '{"next_action": "passive_recon", "reasoning": "I will start by gathering subdomains."}'
    
    resp_probe = AsyncMock()
    resp_probe.content = '{"next_action": "http_probe", "reasoning": "Now I will probe the discovered subdomains."}'
    
    resp_stop = AsyncMock()
    resp_stop.content = '{"next_action": "stop", "reasoning": "I have completed the requested reconnaissance."}'
    
    with patch('rekonstrike.agent.graph.get_llm') as mock_get_llm:
        mock_get_llm.return_value.ainvoke = AsyncMock(side_effect=[resp_passive, resp_probe, resp_stop])
        result = await runner.run_reconnaissance(
            target_domain="example.com",
            goal="identify high-priority reconnaissance targets",
            program_scope=program_scope,
            max_steps=5,
            verbose=True
        )
    
    print("\n" + "="*60)
    print("RECONNAISSANCE SUMMARY")
    print("="*60)
    print(f"Target Domain:         {result.target_domain}")
    print(f"Total Step Count:      {result.step_count}")
    print(f"Tools Executed:        {', '.join(result.tools_tried)}")
    print(f"Subdomains Discovered: {len(result.discovered_subdomains)}")
    print(f"Live Hosts Found:      {len(result.live_hosts)}")
    print(f"Final Action:          {result.next_action}")
    
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

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nDemo interrupted by user.")
