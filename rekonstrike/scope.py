"""Scope validation — wildcard, domain, CIDR matching with out-of-scope override"""
import re
import ipaddress
from typing import Optional


class Scope:
    def __init__(self, in_scope: list[str] | None = None,
                 out_of_scope: list[str] | None = None,
                 target_type: str = ""):
        self.in_scope = [s.lower().strip() for s in (in_scope or [])]
        self.out_of_scope = [s.lower().strip() for s in (out_of_scope or [])]
        self.target_type = target_type
        self.root_domain = self._infer_root()

    def _infer_root(self) -> str:
        for rule in self.in_scope:
            if rule.startswith("*."):
                return rule[2:]
            if "/" not in rule:
                return rule
        return ""

    @classmethod
    def from_target(cls, target: str, target_type: str) -> "Scope":
        if target_type == "company":
            return cls(in_scope=[target], target_type=target_type)
        t = target.lower().strip()
        if target_type in ("domain",):
            return cls(in_scope=[t, f"*.{t}"], target_type=target_type)
        if target_type == "wildcard":
            base = t.lstrip("*.")
            return cls(in_scope=[base, f"*.{base}"], target_type=target_type)
        if target_type == "url":
            domain = re.sub(r"^https?://", "", t).split("/")[0]
            return cls(in_scope=[domain, f"*.{domain}"], target_type=target_type)
        return cls(in_scope=[t], target_type=target_type)

    @classmethod
    def from_file(cls, path: str) -> "Scope":
        import yaml
        try:
            with open(path) as f:
                data = yaml.safe_load(f) or {}
            return cls(
                in_scope=data.get("in_scope", []),
                out_of_scope=data.get("out_of_scope", []),
            )
        except Exception:
            return cls()

    def is_in_scope(self, host: str) -> bool:
        host = re.sub(r"^https?://", "", host).split("/")[0].lower().strip()
        if not host:
            return False
        for rule in self.out_of_scope:
            if self._match(host, rule):
                return False
        for rule in self.in_scope:
            if self._match(host, rule):
                return True
        return False

    def filter(self, hosts: list[str]) -> set[str]:
        return {h for h in hosts if self.is_in_scope(h)}

    def _match(self, host: str, rule: str) -> bool:
        if "/" in rule:
            try:
                net = ipaddress.ip_network(rule, strict=False)
                return ipaddress.ip_address(host) in net
            except ValueError:
                return False
        if rule.startswith("*."):
            return host == rule[2:] or host.endswith(f".{rule[2:]}")
        if rule.startswith("*"):
            return host.endswith(rule[1:])
        return host == rule
