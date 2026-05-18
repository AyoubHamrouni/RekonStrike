# AGENTS.md — RekonStrike

Primary context file for AI coding agents (Claude Code, Codex, etc.).
Read this entire file before touching any code.

---

## What this project is

RekonStrike is a professional reconnaissance and attack surface mapping framework
for bug bounty hunters and penetration testers. It augments human methodology — it
does not replace it. The human stays in the loop at every meaningful decision point.

Target users are technical professionals. They know proxies, terminals, Burp Suite,
and security tooling. No hand-holding UX assumptions.

Core principle: only delegate to AI what cannot be solved deterministically. Every
LLM call has a bounded input, a structured output, and a clear reason it cannot be
a script.

---

## Repository layout

```
rekonstrike/
├── AGENTS.md                  # this file
├── ARCHITECTURE.md            # stack decisions and rationale
├── docker-compose.yml
├── .github/workflows/ci.yml
│
├── rekonstrike/               # Python backend (FastAPI + LangGraph)
│   ├── api/
│   │   ├── server.py          # FastAPI app, lifespan, CORS
│   │   ├── deps.py            # dependency injection
│   │   ├── manager.py         # WebSocket connection manager
│   │   └── routers/
│   │       ├── scans.py       # scan start/cancel/ws
│   │       ├── targets.py     # subdomains, live hosts, vulns
│   │       ├── ai.py          # AI analysis endpoints
│   │       └── agent.py       # autonomous agent SSE streaming
│   ├── agent/                 # LangGraph autonomous recon agent
│   │   ├── graph.py           # StateGraph: input→strategy→executor→triage
│   │   ├── state.py           # ReconState Pydantic model
│   │   ├── phases.py          # deterministic phase registry
│   │   ├── runner.py          # ReconAgentRunner (batch + stream)
│   │   ├── tools.py           # PassiveRecon, HttpProbe, ContentDiscovery, VulnScan
│   │   ├── tool_registry.py   # ToolRegistry with timeout handling
│   │   └── tools_base.py      # ToolBase ABC
│   ├── ai/                    # AI intelligence layer
│   │   ├── factory.py         # get_llm() — Anthropic/OpenAI/Google/OpenRouter
│   │   ├── memory.py          # PGVector long-term memory
│   │   ├── agents/
│   │   │   ├── triage_agent.py    # LangGraph triage with tool use
│   │   │   ├── surface_agent.py   # attack surface analyzer
│   │   │   ├── advisor_agent.py   # per-feature test suggestions
│   │   │   └── report_agent.py    # bug report drafter
│   │   └── tools/
│   │       └── scope_tools.py     # scope advisor
│   ├── phases/                # deterministic pipeline phases
│   │   ├── validation.py      # phase 0
│   │   ├── passive_recon.py   # phase 1
│   │   ├── active_enum.py     # phase 2
│   │   ├── dns_brute.py       # phase 2b — takeover detection
│   │   ├── http_probing.py    # phase 3
│   │   ├── content_discovery.py # phase 4
│   │   ├── js_analysis.py     # phase 4b — JS secret scanning
│   │   ├── vuln_scan.py       # phase 5
│   │   ├── roi_scoring.py     # phase 6
│   │   └── intelligence.py    # phase 7 — AI layer
│   ├── platforms/             # HackerOne, Bugcrowd, Intigriti clients
│   ├── repositories/          # data access layer (repository pattern)
│   ├── services/              # business logic orchestration
│   ├── tools/                 # Go tool wrappers (subprocess calls)
│   ├── database.py            # SQLAlchemy models
│   ├── config.py              # pydantic-settings Settings
│   ├── engine.py              # Pipeline orchestrator
│   ├── scoring.py             # ROI scoring engine
│   ├── scope.py               # scope validation
│   └── cli.py                 # admin CLI (typer)
│
├── browser-service/           # TypeScript — Playwright browser automation
│   ├── src/
│   │   ├── index.ts           # Express HTTP server
│   │   ├── agent.ts           # browser surface agent loop
│   │   ├── capture.ts         # network traffic capture
│   │   ├── extractor.ts       # JS bundle + source map analysis
│   │   └── types.ts           # shared TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
│
├── proxy-service/             # mitmproxy addon (Python, runs embedded)
│   ├── addon.py               # scope-filtered traffic capture addon
│   └── README.md
│
├── ui/                        # React + TypeScript frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── types/
│   ├── package.json
│   └── tsconfig.json
│
└── docker/
    └── tools/
        └── Dockerfile         # multi-stage Go tool builder (TOOL build arg)
```

---

## Stack — what runs where and why

### Python (backend core)

**Runtime**: Python 3.13+
**Framework**: FastAPI with asyncio throughout — no sync code in hot paths
**Why Python here**: the LLM ecosystem (LangChain, LangGraph, anthropic-sdk,
langchain-anthropic) is Python-first. Every library needed exists and is mature.
This layer is IO-bound (waiting on LLM responses and network calls), not
CPU-bound, so Python's GIL is not a bottleneck.

Responsibilities:

- FastAPI REST API and WebSocket server
- LangGraph autonomous recon agent
- All LLM calls via LangChain abstraction
- mitmproxy addon (embedded, same process)
- PostgreSQL via SQLAlchemy async
- Phase pipeline orchestration
- Business logic, repository pattern, services

Key libraries:

```
fastapi uvicorn
langchain langchain-anthropic langchain-openai langchain-google-genai
langgraph
anthropic openai
sqlalchemy[asyncio] asyncpg alembic
pydantic pydantic-settings
mitmproxy
aiohttp
playwright  # fallback only — primary browser work is in browser-service
typer rich
ruff pytest pytest-asyncio
```

### TypeScript / Node.js (browser service)

**Runtime**: Node.js 22
**Framework**: Express (thin HTTP wrapper)
**Why TypeScript here**: Playwright's primary implementation is Node.js.
The Python Playwright bindings are a port that lags behind. For real browser
automation — TLS interception at the browser level, Chrome DevTools Protocol
access, network event hooks — the Node.js API is more complete and reliable.
This is not a preference. It is a technical correctness decision.

Responsibilities:

- Autonomous browser agent loop (perceive → decide → act)
- Network traffic interception via CDP
- DOM analysis and form extraction
- JS bundle static analysis (route extraction, API string extraction)
- Source map detection and parsing
- Exposes a simple HTTP API consumed by the Python backend

This service is called by Python. Python does not do browser automation directly.

Key libraries:

```
playwright
express
typescript
@types/node @types/express
source-map
acorn  # JS AST parser for bundle analysis
```

### Go (security tools)

**Why Go here**: subfinder, httpx, nuclei, katana, ffuf, dnsx, shuffledns,
naabu, gospider, gau, amass, trufflehog — all written in Go, all
battle-tested, all containerized. You do not reimplement these. You call them.
Performance for network-intensive concurrent scanning (port scanning, DNS
resolution at scale) is genuinely better in Go than Python.

These run as Docker containers. Python backend calls them via subprocess or
Docker API, captures stdout, parses JSON output.

Never call Go tools directly from frontend or browser service.
Always route through the Python backend.

### React + TypeScript (frontend)

Standard SPA. Communicates with Python backend via REST and WebSocket.
WebSocket receives real-time scan events, agent guidance messages, and
proxy capture progress.

No direct communication with browser-service or Go tools.

### PostgreSQL

Single database. All services that need persistence go through the Python
backend's repository layer. The browser-service does not connect to the
database directly — it returns results to Python which writes them.

---

## User workflow (implement in this order)

### 1. Program analysis — optional, implement last

User connects HackerOne / Bugcrowd / Intigriti API key.
Platform client fetches program list and scope data.
Single LLM call analyzes each program: bounty range, scope quality, asset
types, out-of-scope restrictions, recently disclosed reports as signal.
Output: ranked recommendation with specific reasoning.

LLM model: use a fast cheap model (haiku-class). Input is small and structured.

### 2. Reconnaissance — core, largely done

Deterministic pipeline. Phases 0–6 already implemented.
AI touches two points only:

- After httpx: triage pass to flag anomalous hosts
- ROI scoring: prioritize discovered assets

Do not add LLM calls to other phases. If you find yourself wanting to,
the answer is a deterministic heuristic instead.

### 3. Post-recon prioritization — core

Single LLM call after recon completes.
Input: structured recon output (subdomains, live hosts, tech stack, ROI scores,
takeover findings, secret findings).
Output: ranked target list with specific grounded reasoning.
Model: haiku-class is sufficient. Input is structured, output is short.

### 4. Authenticated surface mapping — core for web targets

#### 4a. Embedded proxy (mitmproxy addon)

User starts proxy via UI or CLI.
Proxy runs on localhost:8080.
User configures browser to use it (they know how — target users are technical).
All traffic to in-scope domains is captured and written to the database.
Out-of-scope traffic is silently passed through, never stored.

The mitmproxy addon lives in proxy-service/addon.py.
It imports from the Python backend to write directly to the database.
It is not a separate service — it runs in the same Python process.

Scope enforcement is not optional. Every captured request must be validated
against the program's in-scope rules before storage. This is a hard requirement.

Burp Suite XML export and Caido JSON export must be importable as an
alternative to live proxy capture.

#### 4b. JS bundle analysis (browser-service)

After proxy capture, the Python backend sends captured JS bundle URLs to
the browser-service.
Browser-service fetches each bundle and runs static analysis:

- React Router / Next.js route extraction
- API endpoint string extraction (regex + AST)
- Environment variable and config object detection
- Source map detection — if .map file exists, fetch and parse it

Results returned as structured JSON to Python backend, stored as
discovered endpoints enriching the surface model.

#### 4c. Browser agent (browser-service) — optional, implement last

Only used when the user explicitly requests autonomous exploration.
Python backend sends target URL and auth config to browser-service HTTP API.
Browser-service runs the perceive → decide → act loop using Playwright.
Each step streams progress back via HTTP chunked response or Redis queue.
Python backend writes findings to database and streams to frontend via WebSocket.

Token cost: use haiku-class for navigation decisions. Reserve opus-class
for the final analysis call only.

Hard constraints the browser agent must enforce:

- Never navigate outside the target domain
- Never click logout, delete, or any destructive action
- Never submit forms with real sensitive data
- Detect session expiry (redirect to login URL) and halt with clear error
- Stuck detection: if URL unchanged for 3 consecutive steps, force navigation
  to an unvisited link from the nav or sitemap

### 5. AI-guided questioning — core

After proxy capture and JS analysis complete, before running threat model.
AI reviews collected surface data and identifies genuine gaps.
Generates 3–5 targeted questions — not a generic checklist.
Questions must be grounded in what was actually found.
Bad: "what authentication mechanism does the app use?"
Good: "we saw JWT tokens in Authorization headers but also a separate
cookie-based session for the admin path — do these share the same
validation logic?"

User answers conversationally in the UI.
Answers are stored and used as additional context for the threat model call.

### 6. Attack surface modeling and threat modeling — core

Single large LLM call. This is the most expensive call in the system.
Use opus-class model here. The quality of this output is the core value
proposition of the product.

Input (all structured):

- Recon output summary
- Proxy-captured endpoints with methods, parameters, response shapes
- JS bundle analysis results
- User answers from questioning step
- Program scope and bounty context

Output (strict JSON schema):

- Feature inventory
- API endpoint map with parameter analysis
- Auth and authorization boundary map
- Data flow model
- Threat model: per-feature vulnerability classes, specific concrete test cases,
  priority ranking with reasoning

Validate the output schema strictly. If the LLM returns malformed JSON,
retry once with the schema reminder appended. Do not silently accept
partial output.

### 7. Guided testing workspace — core, largely designed

User works through prioritized test cases.
Guided checklists per vulnerability class (auth, injection, logic, infra).
AI advisor available for questions during testing — this is a stateful
conversation grounded in the specific target's surface model.
Finding tracker for confirmed vulnerabilities.

### 8. Report drafting — optional

User marks finding confirmed.
Single LLM call: haiku-class is sufficient for report structure,
opus-class if quality of language matters to the user.
Output formatted for target platform (HackerOne markdown, Bugcrowd format).

---

## AI usage rules — read before adding any LLM call

**Use AI for:**

- Program scoring and recommendation
- Recon anomaly triage and ROI scoring
- Post-recon target prioritization
- Gap detection and targeted question generation
- Attack surface modeling and threat modeling
- Per-feature test suggestions during manual testing
- Bug report drafting

**Do not use AI for:**

- Running reconnaissance tools (use subprocess)
- Scope validation (use deterministic string matching)
- Deduplication (use sets and DB unique constraints)
- Parsing tool output (use JSON parsing and regex)
- Any task a 10-line Python function can handle reliably

**Model selection:**

- haiku-class: navigation decisions, triage, ROI scoring, program analysis,
  report drafting, any call where input is small and output is short
- opus-class: attack surface modeling, threat modeling, any call where
  reasoning quality directly determines the value of the output

**Every LLM call must have:**

- A defined input schema
- A defined output schema (JSON with field descriptions)
- A retry policy (once, with schema reminder on failure)
- A fallback behavior (graceful degradation, not crash)

**Token discipline:**

- Never send raw HTML to the LLM. Extract and structure first.
- Never send full tool output. Summarize or select relevant fields.
- Never run the browser agent loop with opus-class. haiku-class for steps,
  opus-class for the single final analysis call.
- Cap proxy capture context sent to LLM: deduplicate by method+path,
  max 200 unique endpoints, truncate long request bodies.

---

## Data flow between services

```
User browser (React UI)
    ↕ REST + WebSocket
Python backend (FastAPI)
    ↕ subprocess / Docker API
Go tool containers (subfinder, httpx, nuclei, etc.)
    ↕ HTTP API
TypeScript browser-service (Playwright)
    ↕ mitmproxy addon (embedded in Python process)
PostgreSQL
```

The Python backend is the single orchestrator. No service calls another
service except through Python. The browser-service does not call Go tools.
The frontend does not call the browser-service directly.

---

## Scope enforcement — non-negotiable

Every component that touches the target must validate against scope.

Python backend: validate every scan target against program in_scope and
out_of_scope rules before dispatching to any tool.

mitmproxy addon: validate every intercepted request before writing to DB.
Out-of-scope requests are passed through silently, never stored.

Browser agent: validate every navigation target before calling page.goto().
Refuse to navigate outside the declared domain. Log the refusal.

Scope rules live in the ProgramScope database model. Load them once per
session and pass them through. Do not re-fetch from DB on every request.

---

## What is implemented and working

- FastAPI server with health endpoint
- Database models (all tables defined)
- Repository pattern (TargetRepository, HostRepository, SessionRepository)
- Recon phase pipeline (phases 0–7 scaffolded, phases 1–5 functional)
- LangGraph agent (strategy → executor → triage loop)
- Tool wrappers (all Go tools wrapped, mock fallback when tool not installed)
- ROI scoring engine
- Platform clients (HackerOne, Bugcrowd, Intigriti)
- AI agent layer (triage, surface, advisor, report agents scaffolded)
- CI pipeline (lint, test, build-frontend, docker)

## What needs to be built

- mitmproxy embedded addon (proxy-service/addon.py)
- Burp XML and Caido JSON import endpoints
- TypeScript browser-service (entire service)
- JS bundle static analysis
- AI-guided questioning flow (API endpoint + frontend UI)
- Attack surface modeling endpoint (the large threat model call)
- Proxy capture UI (start/stop proxy, coverage visibility)
- Guided testing workspace frontend
- Program analysis and recommendation feature
- Report drafting endpoint and UI

## What needs to be fixed

- config.py is missing: platform_api_keys, auth_cookie, auth_token,
  auth_local_storage, max_subdomains, data_dir, scope_file, platform,
  program_handle, db_type fields referenced in phases but not defined
- database.py: normalize_host function referenced in phases but not defined
- database.py: AIVectorMemory model referenced in memory.py but not defined
- host_repo.py: HostRepository constructor takes db_type in some phases
  but not in its current definition
- platforms/base.py: syntax error on bare except clause (line with
  aiohttp.ClientError, asyncio.TimeoutError — missing parentheses)
- api/server.py: only agent router is registered — scans, targets, ai
  routers are missing from include_router calls
- ci.yml: PYTHON_VERSION set to 3.14 which does not exist yet — use 3.13
