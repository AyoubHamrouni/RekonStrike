<div align="center">
  <img src="ui/src/assets/hero.png" alt="RekonStrike" width="400"/>
</div>

<h1 align="center">RekonStrike</h1>

<p align="center">
  <em>Advanced Reconnaissance & Asset Discovery Framework for Bug Bounty Hunters & Penetration Testers</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#workflows">Workflows</a> •
  <a href="#phases">Phases</a> •
  <a href="#web-ui">Web UI</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#docker">Docker</a> •
  <a href="#faq">FAQ</a>
</p>

---

RekonStrike is a **modern, production-ready reconnaissance framework** that automates the full bug bounty hunting workflow — from subdomain discovery to vulnerability scanning — through a unified CLI and professional web interface. Built for both beginners learning the craft and experienced hunters scaling their operations.

---

## Features

| Capability | Description |
|-----------|-------------|
| **7-Phase Pipeline** | Passive recon → Active recon → Web probing → Content discovery → Vuln scanning → ROI reporting |
| **3 Workflows** | Wildcard, Domain, Company — choose the right approach for your target |
| **15+ Integrated Tools** | Subfinder, Amass, Httpx, Nuclei, Gau, ShuffleDNS, DNSx, Naabu, GoSpider, CloudEnum, Metabigor, GitHub Recon, Katana, ffuf, CeWL |
| **Dual Interface** | Professional CLI (Typer) + Modern Web UI (React/Vite) |
| **Real-Time Streaming** | WebSocket-powered live scan progress with phase-by-phase updates |
| **ROI Scoring** | Intelligent asset prioritization (50+ signals) so you focus on what matters |
| **Scalable Storage** | PostgreSQL (production) + SQLite (dev) via SQLAlchemy async |
| **Docker Ready** | Full docker-compose stack with isolated tool containers |
| **Export** | JSON/CSV export for all asset types |
| **Incremental** | Resume interrupted scans, skip already-discovered assets |

---

## Quick Start

```bash
# 1. Install RekonStrike
git clone https://github.com/your-org/rekonstrike.git
cd rekonstrike/rekonstrike
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Install Go tools (required for most phases)
python -m rekonstrike install

# 3. Run your first scan
python -m rekonstrike scan example.com -t wildcard

# 4. Launch the web UI
uvicorn rekonstrike.api.server:app --reload
# Open http://localhost:8000
```

---

## Prerequisites

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Python | 3.14+ | Core framework |
| Go tools | Latest | Subfinder, Amass, Httpx, Nuclei, etc. |
| PostgreSQL | 15+ (optional) | Production database |
| Redis | 7+ (optional) | Task queue for background scans |
| Docker | 24+ (optional) | Containerized tool execution |

### Installing Go Tools

```bash
# Core tools (required)
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
go install -v github.com/lc/gau/v2/cmd/gau@latest
go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest
go install -v github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest
go install -v github.com/jaeles-project/gospider@latest
go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest

# Advanced tools (optional but recommended)
go install -v github.com/owasp-amass/amass/v4/...@master
go install -v github.com/j3ssie/metabigor@latest
go install -v github.com/gwen001/github-subdomains@latest
go install -v github.com/projectdiscovery/katana/cmd/katana@latest
go install -v github.com/ffuf/ffuf/v2@latest

# Python tools
pip install cloud_enum

# CeWL (Ruby)
gem install cewl
```

Check installation: `python -m rekonstrike install`

---

## Workflows

RekonStrike supports 4 target types, each with an optimal recon strategy:

### 🌐 Wildcard (`*.example.com`)
Discover all subdomains of a wildcard domain. Best for bug bounty programs that scope `*.domain.com`.

```
python -m rekonstrike scan example.com -t wildcard
```

### 📍 Domain (`example.com`)
Scan a specific domain and its subdomains. Good for penetration testing.

```
python -m rekonstrike scan example.com -t domain
```

### 🏢 Company (`Acme Inc`)
Organization-level discovery — finds all domains owned by a company via ASN lookups, WHOIS, and SecurityTrails.

```
python -m rekonstrike scan "Acme Inc" -t company
```

### 🔗 URL (`https://example.com/path`)
Direct URL probing for quick vulnerability assessment.

```
python -m rekonstrike scan https://example.com/api -t url
```

---

## Phases

Each phase builds on the previous one, creating a complete recon pipeline:

| Phase | Name | What It Does | Why It Matters |
|-------|------|-------------|----------------|
| **0** | **Scope Validation** | Validates the target, loads scope rules | Prevents wasted scans on out-of-scope assets |
| **1** | **Passive Recon** | OSINT subdomain enumeration via crt.sh, Subfinder, GAU, GitHub | Maps the attack surface without touching the target |
| **2** | **Active Recon** | DNS resolution, port scanning (Naabu), cloud enumeration (CloudEnum, Metabigor) | Finds live infrastructure and cloud assets |
| **3** | **Web Probing** | HTTP probing with Httpx — tech detection, status codes, titles, SSL | Identifies live web servers and their technologies |
| **4** | **Content Discovery** | Web crawling (GoSpider, Katana), URL fetching (GAU), fuzzing (ffuf), wordlist generation (CeWL) | Discovers hidden endpoints, JS files, API routes |
| **5** | **Vuln Scanning** | Nuclei template-based vulnerability scanning | Automatically finds CVEs, misconfigurations, exposures |
| **6** | **ROI Reporting** | Scores and prioritizes findings (50+ signals) | Shows you which hosts to investigate first |

> **For beginners**: Think of each phase as a filter. Phase 1 casts the widest net (thousands of subdomains). Each subsequent phase narrows down to what's actually alive, what's running, and what's vulnerable. By Phase 6, you have a prioritized list of actionable findings.

---

## Web UI

The web interface provides a modern, real-time dashboard for managing scans:

![Dashboard](ui/src/assets/hero.png)

```bash
# Start the API server
uvicorn rekonstrike.api.server:app --host 0.0.0.0 --port 8000

# In another terminal, start the frontend dev server
cd ui && npm run dev
```

### What You Can Do in the UI

- **Dashboard** — Overview of all targets, scan activity, vulnerability distribution
- **New Scan** — Configure target type, select phases, launch scans
- **Scan Progress** — Real-time phase timeline with WebSocket updates
- **Target Detail** — Subdomains, live hosts, vulnerabilities, endpoints in tabbed views
- **Filter & Sort** — Server-side pagination, search, severity filtering
- **Export** — Download results as JSON or CSV

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/phases` | List pipeline phases |
| POST | `/scan` | Start a scan |
| POST | `/scan/{id}/cancel` | Cancel a running scan |
| WS | `/ws/scan/{id}` | Real-time scan events |
| GET | `/targets` | List all targets |
| GET | `/targets/{id}/subdomains` | Paginated subdomains |
| GET | `/targets/{id}/live-hosts` | Paginated live hosts |
| GET | `/targets/{id}/vulnerabilities` | Paginated vulns |
| GET | `/targets/{id}/endpoints` | Paginated endpoints |
| GET | `/targets/{id}/stats` | Target statistics |
| GET | `/targets/{id}/export/{type}` | Export as JSON/CSV |
| GET | `/sessions` | Scan history |

---

## Configuration

### Environment Variables

All settings can be configured via environment variables with the `RS_` prefix:

```bash
# Database (default: SQLite)
RS_DB_TYPE=postgresql
RS_DB_HOST=localhost
RS_DB_PORT=5432
RS_DB_USER=rekonstrike
RS_DB_PASSWORD=your_password
RS_DB_NAME=rekonstrike

# Redis (for background task queue)
RS_REDIS_URL=redis://localhost:6379/0

# Tool execution mode
RS_TOOL_MODE=native           # native or docker

# API Keys
RS_API_KEYS__SECURITYTRAILS=your_key
RS_API_KEYS__GITHUB=your_token
RS_API_KEYS__WHOISXMLAPI=your_key
RS_API_KEYS__SHODAN=your_key
RS_API_KEYS__CENSYS=your_key

# Server
RS_SERVER_API_KEY=optional_auth_key

# Scan limits
RS_MAX_SUBDOMAINS=5000
RS_MAX_LIVE_SERVERS=500
```

### YAML Configuration

Alternatively, use `config.yaml`:

```yaml
db_type: sqlite
tool_mode: native
max_subdomains: 5000

api_keys:
  securitytrails: ""
  github: ""
  shodan: ""
```

View current config: `python -m rekonstrike config --show`

---

## Docker

For production deployment with PostgreSQL, Redis, and isolated tool containers:

```bash
# Build tool containers
cd rekonstrike/docker
bash build-tools.sh

# Start full stack
cd ../..
docker compose up -d

# Access:
# - Web UI: http://localhost:80
# - API:    http://localhost:8000
# - Docs:   http://localhost:8000/docs
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    RekonStrike Core                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │  Config  │  │ Database │  │  Output  │  │  Scope  │  │
│  │  Manager │  │ (SQLite/ │  │  (Rich)  │  │Validator│  │
│  │          │  │   PG)    │  │          │  │         │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
│  ┌──────────────────────────────────────────────────┐    │
│  │              Pipeline Engine                      │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │    │
│  │  │Phase 0 │→│Phase 1 │→│Phase 2 │→│Phase N │    │    │
│  │  │ Scope  │ │Passive │ │Active  │ │Report  │    │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘    │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Tool Runner (Async Subprocess)          │    │
│  │  subfinder amass httpx nuclei gau shuffledns...  │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
         ┌────┴────┐           ┌──────┴──────┐
         │   CLI   │           │  Web API    │
         │ (typer) │           │ (FastAPI)   │
         └─────────┘           └──────┬──────┘
                                      │
                                 ┌────┴─────┐
                                 │ React UI │
                                 │  (Vite)  │
                                 └──────────┘
```

---

## Examples

### Full Scan (All Phases)
```bash
# Enumerate everything
python -m rekonstrike scan example.com -t wildcard

# Run only specific phases
python -m rekonstrike scan example.com -t wildcard -p 0,1,2
```

### Company Recon
```bash
# Discover all assets owned by a company
python -m rekonstrike scan "Tesla" -t company
```

### Export Results
```bash
# Export via API
curl http://localhost:8000/targets/1/export/subdomains?format=csv -o subs.csv
curl http://localhost:8000/targets/1/export/vulnerabilities?format=json -o vulns.json
```

---

## FAQ

**Q: Do I need all the Go tools installed?**
A: No. Each tool is optional — the framework gracefully skips missing tools. Start with just Subfinder and Httpx, then add more as needed.

**Q: How is this different from ars0n-framework-v2?**
A: RekonStrike is built from scratch with modern Python 3.14 async, modular components (<300 lines each vs 25k-line monoliths), proper authentication, scalable PostgreSQL, and a professional UI without the spaghetti code.

**Q: Can I use SQLite in production?**
A: For single-user CLI use, yes. For the web UI or team use, use PostgreSQL (docker-compose provided).

**Q: How long does a scan take?**
A: Depends on the domain and phases. A typical wildcard scan with all 7 phases takes 5-30 minutes. Passive phases are fastest; content discovery depends on site size.

**Q: Is this safe for bug bounty hunting?**
A: Yes. Passive phases (0-1) don't touch the target. Active phases respect rate limits. Always confirm scope before scanning.

**Q: I'm a beginner. Where do I start?**
A: Start with a domain you own (e.g., your personal site) and run all 7 phases. Watch the real-time progress to understand each stage. Read the phase descriptions above to learn the "why" behind each step.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `certificate verify failed` | Update certifi: `pip install --upgrade certifi` |
| Tools not found | Run `python -m rekonstrike install` to check, then `go install <tool>@latest` |
| Port 8000 in use | Use `--port 8001` or kill the existing process |
| `relation "subdomains" does not exist` | Restart the server to run migrations automatically |
| crt.sh returns 0 results | Add a User-Agent header (already included in RekonStrike) |
| WebSocket not connecting | Check Vite proxy config in `ui/vite.config.js` |
| Docker permission denied | Add user to docker group: `sudo usermod -aG docker $USER` |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

RekonStrike stands on the shoulders of giants. Special thanks to the teams behind:

[Subfinder](https://github.com/projectdiscovery/subfinder) •
[Amass](https://github.com/owasp-amass/amass) •
[Httpx](https://github.com/projectdiscovery/httpx) •
[Nuclei](https://github.com/projectdiscovery/nuclei) •
[GAU](https://github.com/lc/gau) •
[ShuffleDNS](https://github.com/projectdiscovery/shuffledns) •
[DNSx](https://github.com/projectdiscovery/dnsx) •
[Naabu](https://github.com/projectdiscovery/naabu) •
[GoSpider](https://github.com/jaeles-project/gospider) •
[CloudEnum](https://github.com/initstring/cloud_enum) •
[Metabigor](https://github.com/j3ssie/metabigor) •
[Katana](https://github.com/projectdiscovery/katana) •
[FFuf](https://github.com/ffuf/ffuf) •
[CeWL](https://github.com/digininja/CeWL) •
[SecurityTrails](https://securitytrails.com) •
[FastAPI](https://fastapi.tiangolo.com) •
[React](https://react.dev) •

---

<div align="center">
  <sub>Built for the bug bounty community · <a href="https://github.com/your-org/rekonstrike/issues">Report Issue</a></sub>
</div>
