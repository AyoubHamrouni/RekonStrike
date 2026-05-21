# RekonStrike Architecture

## Core Principles
1. **PostgreSQL-only persistence** — All data persists via asyncpg + SQLAlchemy async
2. **Deterministic by default** — Only use AI where a 10-line function cannot solve the problem
3. **Provider-agnostic LLM** — Support OpenAI, Anthropic, Google Gemini, and OpenRouter via LangChain; model selected by capability tier (fast/deep), not hardcoded name
4. **Human-in-the-loop** — The framework augments, never replaces, the security professional

## Technology Stack
- **Backend:** Python 3.13+ / FastAPI (async) + SQLAlchemy ORM (async) + PostgreSQL
- **Agent:** LangGraph (StateGraph) + LangChain (model abstraction)
- **API:** RESTful routes + WebSocket for real-time scan events
- **Frontend:** Next.js 14+ / React / TypeScript / TailwindCSS
- **Browser:** Node.js 22 / Playwright / Express (separate service)
- **Proxy:** mitmproxy addon (separate process)
- **Filter:** Go-based traffic dedup/normalization CLI
- **Infrastructure:** Docker Compose (PostgreSQL 17 + Redis 7 + 12+ tool containers)

## Data Model (20+ tables)

| Model | Table | Purpose |
|-------|-------|---------|
| `User` | `users` | User accounts (single-user by default) |
| `ScopeTarget` | `scope_targets` | Target domain/host being investigated |
| `Program` | `programs` | Bug bounty program metadata |
| `ProgramScope` | `program_scopes` | In-scope/out-of-scope rules |
| `ScanSession` | `scan_sessions` | Autonomous agent run |
| `Subdomain` | `subdomains` | Discovered subdomains |
| `LiveHost` | `live_hosts` | Probed, responding web servers |
| `Vulnerability` | `vulnerabilities` | Findings from tools or manual testing |
| `AIInsight` | `ai_insights` | AI agent reasoning output |
| `FindingReport` | `finding_reports` | Formatted bug reports |
| `RawHTTPCapture` | `raw_http_captures` | Proxy-captured HTTP traffic |
| `BrowserCapture` | `browser_captures` | Playwright capture results |
| `TestingSession` | `testing_sessions` | Guided testing workspace sessions |
| `TestResult` | `test_results` | Individual finding test results |
| `AIVectorMemory` | `ai_vector_memory` | PGVector long-term memory |

## Service Architecture

```
User browser (Next.js UI)
    ↕ REST + WebSocket
Python backend (FastAPI)
    ↕ subprocess / Docker API
Go tool containers (subfinder, httpx, nuclei, etc.)
    ↕ HTTP API
TypeScript browser-service (Playwright)
    ↕ proxy-service/ (mitmproxy addon, separate process)
PostgreSQL
```

The Python backend is the single orchestrator. No service calls another service except through Python. The browser-service does not call Go tools. The frontend does not call the browser-service directly.

## Workflow

1. User creates a target or links a bug bounty program
2. LangGraph agent runs: strategy → executor (deterministic phase) → triage → loop
3. User reviews reconnaissance results (subdomains, live hosts, tech stack)
4. User starts proxy capture or imports Burp/Caido data
5. JS bundle analysis runs on captured endpoints
6. AI-guided questioning identifies gaps in surface understanding
7. Threat model analysis produces ranked findings with exploitation paths
8. User works through findings in the guided testing workspace
9. Confirmed vulnerabilities are drafted into platform-formatted reports
