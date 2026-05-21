<div align="center">
  <h1>RekonStrike</h1>
</div>

<p align="center">
  <em>Professional Reconnaissance & Attack Surface Mapping Framework</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api">API</a> •
  <a href="#docker">Docker</a>
</p>

---

RekonStrike is a **professional reconnaissance and attack surface mapping framework** for bug bounty hunters and penetration testers. It augments human methodology — it does not replace it. The human stays in the loop at every meaningful decision point.

---

## Features

| Category | Feature |
|----------|---------|
| **Reconnaissance** | Subdomain discovery, HTTP probing, tech detection, content discovery |
| **Vulnerability Scanning** | Nuclei-based scanning, targeted template execution by tech stack |
| **Threat Modeling** | AI-driven surface analysis with tiered LLM support (fast/deep), user context from guided questioning |
| **Attack Surface Mapping** | Live host inventory, endpoint discovery, JS bundle extraction, source map analysis |
| **Headless Browser** | TypeScript Playwright service with DNS timeout, private IP blocking, CDP traffic interception |
| **Proxy Capture** | Embedded mitmproxy addon with scope filtering, sensitive data scrubbing, async batch writer |
| **AI Intelligence** | 11 standardized 5-section prompts, provider-agnostic (OpenAI/Anthropic/Google/OpenRouter), strategist + triager agents |
| **Guided Testing** | 3-panel workspace with finding list, exploitation advice, test result submission, pagination |
| **Scoring** | ROI scoring engine with 50+ signals, bounty-aware prioritization |
| **Platform Integration** | HackerOne, Bugcrowd, Intigriti scope sync |
| **Rate Limiting** | Tiered slowapi: 60/min default, 5/min threat model, 10/min questioning |
| **Security** | Input sanitization, XSS prevention, finding validation, form-data body scrubbing |
| **Real-Time Streaming** | WebSocket for scan pipeline, SSE for agent progress |
| **Containerized** | Docker Compose with API, PostgreSQL 17, Redis 7, and 12+ tool containers |

---

## Quick Start

### 1. Backend

```bash
git clone <repo-url> && cd rekonstrike
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m rekonstrike
```

### 2. Frontend

```bash
cd ui && npm install && npm run dev
```

### 3. Docker (full stack)

```bash
docker compose up -d
# With tool containers:
docker compose --profile tools up -d
```

---

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/config` | Configured providers |
| **Agent** | | |
| POST | `/api/v1/targets/{id}/agent/run` | Run agent synchronously |
| POST | `/api/v1/targets/{id}/agent/start` | Start async agent session |
| GET | `/api/v1/targets/{id}/agent/{sid}/stream` | SSE agent progress stream |
| POST | `/api/v1/targets/{id}/agent/{sid}/feedback` | Send interrupt/feedback |
| GET | `/api/v1/targets/{id}/agent/{sid}/state` | Get session state |
| **Targets** | | |
| GET | `/api/v1/targets` | List targets |
| POST | `/api/v1/targets` | Create target |
| GET | `/api/v1/targets/{id}` | Get target details |
| GET | `/api/v1/targets/{id}/subdomains` | Subdomain results |
| GET | `/api/v1/targets/{id}/live-hosts` | Live web servers |
| GET | `/api/v1/targets/{id}/vulnerabilities` | Vulnerabilities |
| **Scans** | | |
| POST | `/api/v1/scan` | Initiate scan |
| GET | `/api/v1/scan/phases` | List phases |
| WS | `/api/v1/scan/ws/{id}` | Real-time scan events |
| **AI Analysis** | | |
| POST | `/api/v1/targets/{id}/ai/surface` | Surface analysis |
| POST | `/api/v1/targets/{id}/ai/triage` | Vulnerability triage |
| POST | `/api/v1/targets/{id}/ai/advisor` | Test suggestions |
| POST | `/api/v1/targets/{id}/ai/report` | Report drafting |
| **Threat Model** | | |
| POST | `/api/v1/targets/{id}/threat-model/analyze` | Run threat model analysis (5/min) |
| GET | `/api/v1/targets/{id}/threat-model/findings` | Get threat model findings |
| PATCH | `/api/v1/targets/{id}/threat-model/findings/{idx}` | Update finding status/notes |
| **Questioning** | | |
| POST | `/api/v1/targets/{id}/questioning/generate` | Generate AI questions (10/min) |
| POST | `/api/v1/targets/{id}/questioning/submit` | Submit user answers |
| GET | `/api/v1/targets/{id}/questioning/session` | Get questioning session |
| **Testing Workspace** | | |
| POST | `/api/v1/targets/{id}/testing/session` | Start testing session |
| GET | `/api/v1/targets/{id}/testing/session` | Get session with paginated findings |
| POST | `/api/v1/targets/{id}/testing/result` | Submit test result |
| PATCH | `/api/v1/targets/{id}/testing/session` | Pause/complete session |
| GET | `/api/v1/targets/{id}/testing/advice/{id}` | Get exploitation advice |

---

## Project Structure

```
src/rekonstrike/      Python backend (FastAPI + LangGraph)
  api/                FastAPI routers, deps, server, rate limiting
  agent/              LangGraph agent (state, graph, runner, tools)
  ai/                 LLM factory, prompts, agents, schemas
  phases/             Reconnaissance pipeline (validation through scoring)
  integrations/       Browser service client
  platforms/          HackerOne/Bugcrowd/Intigriti clients
  repositories/       SQLAlchemy async repositories
  services/           Scan orchestration
  tools/              Go tool wrappers, subprocess calls
  database.py         Async SQLAlchemy models (20+ tables)
  config.py           Pydantic-settings configuration
  scoring.py          ROI scoring engine
  scope.py            Scope validation

browser-service/      TypeScript Playwright headless capture
proxy-service/        mitmproxy addon (separate process)
filter/               Go-based traffic dedup/normalization CLI
ui/                   Next.js + TypeScript + Tailwind frontend
tests/                Python test suite (148 tests)
docker/               Tool isolation containers
```

---

## License

MIT
