import logging
import random
import time
import re
from datetime import datetime
from .tools_base import ToolBase

class PassiveReconTool(ToolBase):
    name = "passive_recon"
    description = "Gathers passive recon data from external sources (DNS, certificate transparency, etc)."
    
    async def execute(self, target: str, max_results: int = 500) -> dict:
        start_time = time.time()
        
        # MOCK TOOL
        subdomains = [f"api.{target}", f"admin.{target}", f"mail.{target}"]
        certs = [f"2024-01 api.{target}", f"2024-02 admin.{target}"]
        dns_records = {"MX": [f"mail.{target}"], "NS": [f"ns1.{target}"]}
        
        logging.info(f"Discovered {len(subdomains)} subdomains")
        
        duration = time.time() - start_time
        return {
            "success": True,
            "data": {
              "subdomains": subdomains,
              "certs": certs,
              "dns_records": dns_records,
              "discovered_at": datetime.now().isoformat()
            },
            "error": None,
            "duration_seconds": 1.2
        }
        
    async def validate_input(self, target: str, **kwargs) -> tuple[bool, str]:
        if not re.match(r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$", target):
            return False, "invalid domain"
        return True, ""

class HttpProbeTool(ToolBase):
    name = "http_probe"
    description = "Probes discovered targets to determine which are live and get basic metadata."
    
    async def execute(
        self,
        targets: list[str],
        scope_filter: dict = None,
        timeout_per_target: int = 5
    ) -> dict:
        start_time = time.time()
        
        in_scope_patterns = []
        out_of_scope_patterns = []
        if scope_filter:
            in_scope_patterns = scope_filter.get("in_scope", [])
            out_of_scope_patterns = scope_filter.get("out_of_scope", [])
            
        probed = []
        live_count = 0
        unreachable = 0
        filtered_out = 0
        
        for target in targets:
            # scope check
            in_scope = True
            
            if in_scope_patterns:
                in_scope = False
                for pattern in in_scope_patterns:
                    if pattern in target:
                        in_scope = True
                        break
            
            if in_scope and out_of_scope_patterns:
                for pattern in out_of_scope_patterns:
                    if pattern in target:
                        in_scope = False
                        break
            
            if not in_scope:
                filtered_out += 1
                continue
                
            rand_val = random.random()
            if rand_val < 0.2:
                unreachable += 1
            elif rand_val < 0.6:
                live_count += 1
                probed.append({
                    "url": target, "status_code": 200, "title": "Dashboard", 
                    "tech_stack": ["Django", "Python"], "response_time_ms": random.randint(50, 500)
                })
            elif rand_val < 0.8:
                live_count += 1
                probed.append({
                    "url": target, "status_code": 403, "title": None, 
                    "tech_stack": [], "response_time_ms": random.randint(50, 500)
                })
            elif rand_val < 0.95:
                live_count += 1
                probed.append({
                    "url": target, "status_code": 404, "title": "Not Found", 
                    "tech_stack": [], "response_time_ms": random.randint(50, 500)
                })
            else:
                live_count += 1
                probed.append({
                    "url": target, "status_code": 500, "title": "Error", 
                    "tech_stack": [], "response_time_ms": random.randint(50, 500)
                })
                
        duration = time.time() - start_time
        return {
            "success": True,
            "data": {
              "probed": probed,
              "filtered_out": filtered_out,
              "live_count": live_count,
              "unreachable": unreachable
            },
            "error": None,
            "duration_seconds": 12.5
        }
        
    async def validate_input(self, targets: list[str], **kwargs) -> tuple[bool, str]:
        if not targets:
            return False, "targets must be non-empty list"
        if not all(isinstance(t, str) for t in targets):
            return False, "targets must be list of strings"
        return True, ""
