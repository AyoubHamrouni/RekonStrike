<div align="center">
  <h1>RekonStrike </h1>
</div>

<p align="center">
  <em>Autonomous Attack Surface Management & AI-Driven Security Intelligence Platform</em>
</p>

<p align="center">
  <a href="#three-plane-architecture">Architecture</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#agent">Agent</a> •
  <a href="#api">API</a> •
  <a href="#docker">Docker</a>
</p>

---

RekonStrike is a **professional-grade attack surface management platform** that extends beyond reconnaissance into threat modeling, attack surface mapping, and AI-driven security intelligence. It organizes the offensive security workflow into three distinct planes: **Automation Engine**, **Manual Workspace**, and **AI Intelligence** — coordinated by an autonomous **LangGraph-based agent** with strategist/triager roles.

---

## Three-Plane Architecture

### 1. Automation Engine (Bottom Plane)
*Deterministic, phase-driven reconnaissance and discovery.*
- **Phases**: OSINT, Subdomain Enumeration, HTTP Probing, Content Discovery, Vulnerability Scanning, ROI Scoring.
- **Strategy-Aware Execution**: Phases adjust behavior based on LLM-generated strategy (priority targets, depth-vs-breadth, focus areas).
- **Entity Normalization**: Strict hostname-centric deduplication across all phases.
- **Tool Registry**: 30s timeout, input validation, structured logging.

### 2. Manual Testing Workspace (Middle Plane)
*Guided workflows where the platform supports human judgment.*
- **Interactive Surface Map**: Unified view of all assets, endpoints, subdomains, and findings.
- **Guided Modules**: Step-by-step checklists for Auth (BOLA), Injection, Logic, and Infra (SSRF).
- **Headless Browser Capture**: Playwright-based service for JS bundle extraction, source map discovery, and full-page screenshots.

### 3. AI Intelligence Layer (Top Plane)
*LLM-driven agent with dual roles — strategist + triager.*
- **Strategist**: Analyzes program context (bounty range, scope freshness, competition) and sets the reconnaissance strategy.
- **Triager**: Interprets phase results through a bug bounty lens, highlights interesting findings, decides next action.
- **AI Endpoints**: Surface analysis, triage, false-positive filtering, scope advisory, report drafting.
- **Vector Memory**: Persistent AI memory via `AIVectorMemory` model.

---

## Agent Architecture

The autonomous agent uses a **LangGraph StateGraph** with a structured pipeline:

```
START → input → strategy (LLM: sets approach)
              → executor (deterministic phase)
              → triage (LLM: interprets results)
              → executor → triage → ... → stop
```

Key capabilities:
- **Platform-Aware**: Integrates with HackerOne, Bugcrowd, and Intigriti for scope synchronization.
- **Session-Based Streaming**: SSE-powered real-time guidance and state updates.
- **Feedback Loop**: User can interrupt, redirect, or stop the agent mid-mission.
- **Phase Pipeline**: 6 deterministic phases (validate, passive, httpprobe, content, vulnscan, scoring) with strategy-aware execution.

---

## Features

| Category | Feature |
|----------|---------|
| **Reconnaissance** | Subdomain discovery, HTTP probing, tech detection, content discovery |
| **Vulnerability Scanning** | Nuclei-based scanning, targeted template execution by tech stack |
| **Threat Modeling** | AI-driven strategy generation, platform context analysis, ROI-based prioritization |
| **Attack Surface Mapping** | Live host inventory, endpoint discovery, JS bundle extraction, source map analysis |
| **Headless Browser** | Playwright-based capture of traffic, JS bundles, source maps, screenshots |
| **AI Intelligence** | Strategist + triager LLM roles, surface analysis, false-positive filtering, report drafting |
| **Scoring** | 50+ ROI signals, bounty-aware scoring, severity aggregation |
| **Platform Integration** | HackerOne, Bugcrowd, Intigriti scope sync |
| **Real-Time Streaming** | SSE for agent progress, WebSocket for scan pipeline |
| **Containerized** | Docker Compose with API, PostgreSQL 17, Redis 7, and 12+ tool containers |

---

## Quick Start

### 1. Installation
```bash
git clone https://github.com/your-org/rekonstrike.git
cd rekonstrike
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
```

### 2. Start the Unified Server
```bash
python -m rekonstrike
```

### 3. Start Frontend Development
```bash
cd ui && npm install && npm run dev
```

### 4. Run the Autonomous Agent Demo
```bash
python src/rekonstrike/agent/demo.py
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
| GET | `/api/v1/targets/{id}/subdomains` | Subdomain results |
| GET | `/api/v1/targets/{id}/live-hosts` | Live web servers |
| GET | `/api/v1/targets/{id}/vulnerabilities` | Vulnerabilities |
| **Scans** | | |
| POST | `/api/v1/scan` | Initiate scan |
| GET | `/api/v1/scan/phases` | List phases |
| WS | `/api/v1/scan/ws/{id}` | Real-time scan events |
| **AI** | | |
| POST | `/api/v1/targets/{id}/ai/surface` | Surface analysis |
| POST | `/api/v1/targets/{id}/ai/triage` | Vulnerability triage |
| POST | `/api/v1/targets/{id}/ai/fp-filter` | False-positive filtering |
| POST | `/api/v1/targets/{id}/ai/report` | Report drafting |
| POST | `/api/v1/targets/{id}/ai/advisor` | Test suggestions |

---

## Docker

Deploy the full stack with PostgreSQL, Redis, isolated tool containers, and the browser capture service:

```bash
docker compose up -d
# With tool containers:
docker compose --profile tools up -d
```

| Service | Port | Purpose |
|---------|------|---------|
| API | 8000 | FastAPI backend |
| UI | 80 | Nginx-served frontend |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Task queue |
| Browser Service | 3001 | Playwright headless capture |

---

## Project Structure

```
src/rekonstrike/
  agent/          LangGraph agent (state, graph, phases, runner, tools)
  api/            FastAPI (routers, deps, server)
  tools/          External tool wrappers, browser client
  platforms/      HackerOne/Bugcrowd/Intigriti clients
  repositories/   SQLAlchemy async repositories
  services/       Scan orchestration
  database.py     Async SQLAlchemy models
  config.py       Pydantic-settings
  scoring.py      ROI scoring (50+ signals)
  scope.py        Wildcard/domain/CIDR matching
  engine.py       Legacy pipeline

browser-service/  Playwright headless capture service
filter/           Go-based result filtering CLI
ui/               React + TypeScript + Vite + Tailwind frontend
```

---

## License

RekonStrike is released under the **MIT License**. See [LICENSE](LICENSE) for details.
