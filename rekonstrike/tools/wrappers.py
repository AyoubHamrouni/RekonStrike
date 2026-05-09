"""Tool wrappers for all integrated reconnaissance tools"""
from .base import BaseTool


class Subfinder(BaseTool):
    name = "subfinder"
    binary = "subfinder"

    async def enumerate(self, domain: str, concurrency: int = 20) -> list[str]:
        r = await self.execute(["-d", domain, "-silent", "-t", str(concurrency)])
        return r.lines()


class AmassIntelligence(BaseTool):
    """Amass intel for company-level ASN/domain discovery"""
    name = "amass"
    binary = "amass"

    async def intel(self, org: str) -> "ToolResult":
        return await self.execute(["intel", "-org", org, "-max-dns-queries", "250"])

    async def enum(self, domain: str, passive: bool = True) -> "ToolResult":
        args = ["enum", "-d", domain, "-json", "-"]
        if passive:
            args += ["-passive"]
        return await self.execute(args)


class Httpx(BaseTool):
    name = "httpx"
    binary = "httpx"

    async def probe(self, stdin_data: str, threads: int = 50) -> "ToolResult":
        args = [
            "-silent", "-json", "-t", str(threads),
            "-sc", "-cl", "-title", "-web-server",
            "-tech-detect", "-csp-probe",
            "-status-code", "-content-length",
            "-timeout", "5",
            "-retries", "1",
        ]
        return await self.runner.run_pipe(self.binary, args, stdin_data)


class Nuclei(BaseTool):
    name = "nuclei"
    binary = "nuclei"

    async def scan(self, targets: str, concurrency: int = 25,
                   rate_limit: int = 150,
                   severity: str = "critical,high,medium,low") -> "ToolResult":
        args = [
            "-silent", "-json",
            "-c", str(concurrency),
            "-rl", str(rate_limit),
            "-severity", severity,
            "-nt",
        ]
        return await self.runner.run_pipe(self.binary, args, targets)


class Gau(BaseTool):
    name = "gau"
    binary = "gau"

    async def fetch(self, domain: str, threads: int = 10) -> "ToolResult":
        return await self.execute(["--subs", domain, "--threads", str(threads)])


class ShuffleDNS(BaseTool):
    name = "shuffledns"
    binary = "shuffledns"

    async def resolve(self, stdin_data: str) -> "ToolResult":
        # No -d flag: input is fully qualified domains
        args = ["-silent", "-t", "10"]
        return await self.runner.run_pipe(self.binary, args, stdin_data)


class DNSx(BaseTool):
    name = "dnsx"
    binary = "dnsx"

    async def resolve(self, stdin_data: str) -> "ToolResult":
        args = ["-silent", "-json", "-resp", "-t", "10",
                "-a", "-aaaa", "-cname", "-mx", "-ns", "-txt"]
        return await self.runner.run_pipe(self.binary, args, stdin_data)


class Naabu(BaseTool):
    name = "naabu"
    binary = "naabu"

    async def scan(self, host: str,
                   ports: str = "80,443,8080,8443,3000,9090,3001") -> "ToolResult":
        return await self.execute(["-host", host, "-p", ports, "-silent", "-json"])


class GoSpider(BaseTool):
    name = "gospider"
    binary = "gospider"

    async def crawl(self, url: str, concurrency: int = 3, depth: int = 3) -> "ToolResult":
        return await self.execute([
            "-s", url, "-c", str(concurrency), "-d", str(depth),
            "--json", "-t", "2",
        ])


class CloudEnum(BaseTool):
    name = "cloud_enum"
    binary = "cloud_enum"

    async def enumerate(self, keyword: str) -> "ToolResult":
        return await self.execute(["-k", keyword, "-l", "/dev/null"])


class Metabigor(BaseTool):
    name = "metabigor"
    binary = "metabigor"

    async def asn(self, org: str) -> "ToolResult":
        return await self.execute(["asn", "-o", org])

    async def net(self, asn: str) -> "ToolResult":
        return await self.execute(["net", "-i", asn])


class GitHubRecon(BaseTool):
    name = "github-subdomains"
    binary = "github-subdomains"

    async def search(self, domain: str, token: str = "") -> "ToolResult":
        return await self.execute(["-d", domain, "-t", token or ""])


class SecurityTrailsAPI:
    """SecurityTrails REST API wrapper — uses RS_API_KEYS__SECURITYTRAILS env var."""

    BASE = "https://api.securitytrails.com/v1"

    def __init__(self, api_key: str):
        self.api_key = api_key

    @property
    def is_available(self) -> bool:
        return bool(self.api_key)

    async def domain_info(self, domain: str) -> dict:
        import aiohttp
        async with aiohttp.ClientSession() as s:
            async with s.get(
                f"{self.BASE}/domain/{domain}",
                headers={"APIKEY": self.api_key},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                return await r.json() if r.status == 200 else {}

    async def subdomains(self, domain: str) -> list[str]:
        import aiohttp
        subs: list[str] = []
        async with aiohttp.ClientSession() as s:
            async with s.get(
                f"{self.BASE}/domain/{domain}/subdomains",
                headers={"APIKEY": self.api_key},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                if r.status == 200:
                    data = await r.json()
                    subs = data.get("subdomains", [])
        return subs

    async def company_domains(self, company: str) -> list[str]:
        import aiohttp
        domains: list[str] = []
        async with aiohttp.ClientSession() as s:
            async with s.post(
                f"{self.BASE}/search/list",
                headers={"APIKEY": self.api_key, "Content-Type": "application/json"},
                json={"query": f"organization:{company}"},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                if r.status == 200:
                    data = await r.json()
                    for record in data.get("records", []):
                        if record.get("hostname"):
                            domains.append(record["hostname"])
        return domains

    async def asn_info(self, asn: str) -> dict:
        import aiohttp
        async with aiohttp.ClientSession() as s:
            async with s.get(
                f"{self.BASE}/asn/{asn}",
                headers={"APIKEY": self.api_key},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                return await r.json() if r.status == 200 else {}


class WhoisLookup:
    """WHOIS lookup via whoisxmlapi or system whois command."""

    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    @property
    def is_available(self) -> bool:
        import shutil
        return bool(self.api_key) or bool(shutil.which("whois"))

    async def lookup(self, domain: str) -> dict:
        import asyncio
        if self.api_key:
            return await self._api_lookup(domain)
        return await self._cli_lookup(domain)

    async def _api_lookup(self, domain: str) -> dict:
        import aiohttp
        url = f"https://www.whoisxmlapi.com/whoisserver/WhoisService"
        params = {
            "apiKey": self.api_key,
            "domainName": domain,
            "outputFormat": "json",
        }
        async with aiohttp.ClientSession() as s:
            async with s.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as r:
                return await r.json() if r.status == 200 else {}

    async def _cli_lookup(self, domain: str) -> dict:
        proc = await asyncio.create_subprocess_exec(
            "whois", domain,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
        return {"raw": stdout.decode("utf-8", errors="replace")}


class Katana(BaseTool):
    name = "katana"
    binary = "katana"

    async def crawl(self, url: str, depth: int = 2, concurrency: int = 10) -> "ToolResult":
        return await self.execute([
            "-u", url, "-d", str(depth), "-c", str(concurrency),
            "-silent", "-j", "-kf", "all",
        ])


class Ffuf(BaseTool):
    name = "ffuf"
    binary = "ffuf"

    async def fuzz(self, url: str, wordlist: str, extensions: str = "",
                   concurrency: int = 50) -> "ToolResult":
        args = ["-u", url, "-w", wordlist, "-c", "-t", str(concurrency), "-s"]
        if extensions:
            args += ["-e", extensions]
        return await self.execute(args)


class CeWL(BaseTool):
    name = "cewl"
    binary = "cewl"

    async def wordlist(self, url: str, depth: int = 2, min_word_length: int = 5) -> "ToolResult":
        return await self.execute([
            url, "-d", str(depth), "-m", str(min_word_length), "-c", "--with-numbers",
        ])


class TrufflehogWrapper(BaseTool):
    name = "trufflehog"
    binary = "trufflehog"

    async def scan_file(self, file_path: str) -> "ToolResult":
        return await self.execute(["filesystem", file_path, "--json", "--no-update"])

    async def scan_url(self, url: str) -> "ToolResult":
        return await self.execute(["git", url, "--json", "--no-update"])

    @property
    def is_available(self) -> bool:
        return self.runner.is_available("trufflehog")


class WafW00f(BaseTool):
    name = "wafw00f"
    binary = "wafw00f"

    async def detect(self, url: str) -> list[str]:
        if not self.is_available:
            return []
        result = await self.execute([url, "-a", "-o", "-", "--format=json"])
        for line in result.lines():
            import json
            try:
                data = json.loads(line)
                if isinstance(data, dict):
                    return data.get("waf", [])
            except json.JSONDecodeError:
                continue
        return []
