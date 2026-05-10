# RekonStrike v2 Architecture

## Core Principles
1. **PostgreSQL-only** — All data persists to PostgreSQL via asyncpg + SQLAlchemy async
2. **Autonomous agent-driven** — LangGraph handles multi-tool coordination with strategist/triager LLM reasoning
3. **Web UI primary** — All user interaction goes through React + WebSocket, not CLI
4. **Multi-model LLM** — Support Anthropic, OpenAI, Google Gemini via LangChain
5. **Guidance as primary output** — The AI teaches the user. Every decision comes with an explanation.
6. **Program awareness** — Platform integration (HackerOne/Bugcrowd/Intigriti) drives ROI-informed targeting

## Technology Stack
- **Backend:** FastAPI (async) + SQLAlchemy ORM (async) + PostgreSQL
- **Agent:** LangGraph (StateGraph) + LangChain (model abstraction)
- **API:** RESTful routes + WebSocket for real-time agent communication
- **Frontend:** React + TypeScript + TailwindCSS
- **Infrastructure:** Docker Compose (PostgreSQL + Redis + app)

## Data Model
- `ScopeTarget` — what we're hunting (example.com)
- `Program` — linked bug bounty program (HackerOne, Bugcrowd, Intigriti)
- `ProgramScope` — in-scope/out-of-scope rules from the program
- `ScanSession` — an autonomous agent run
- `Subdomain` — discovered subdomains
- `LiveHost` — probed, responding web servers
- `Vulnerability` — findings (from tools or manual testing)
- `AIInsight` — agent reasoning output (triage, surface analysis, advice)
- `FindingReport` — formatted bug report ready to submit
- `Endpoint` — discovered URL paths/parameters
- `DNSRecord` — DNS resolution data (A, AAAA, CNAME, MX, NS)
- `ScanArtifact` — tool output files (raw JSON, screenshots)
- `SecretFinding` — leaked credentials, API keys
- `TakeoverFinding` — subdomain takeover candidates

## Workflow
1. User links a bug bounty program (HackerOne/Bugcrowd/Intigriti)
2. User selects a program → runner syncs scope + platform context (bounty range, asset freshness)
3. Agent **strategist** (LLM call 1) analyzes program data, sets strategy, decides first phase
4. Agent **executor** runs the chosen phase deterministically (passive recon → DNS → HTTP probe → ...)
5. Agent **triager** (LLM call 2) interprets results, highlights interesting findings, produces guidance
6. Steps 4-5 loop until the agent decides to stop, re-strategize, or interrupt for human input
7. Human reviews findings + guidance in the dashboard
8. Human exports formatted bug report via one-click UI button

---

## Agent Architecture (Strategist + Triager)

The agent uses **two distinct LLM roles** rather than a single "what next?" loop:

```
START → input → strategy (LLM: "what's our approach?")
                → executor (deterministic phase)
                → triage (LLM: "what did we find?")
                → executor → triage → ... → stop
```

### Two LLM Roles

| Role | When | Prompt Focus | Output |
|------|------|-------------|--------|
| **Strategist** | Once at start (or major pivot) | Program context, bounty range, scope freshness, competition | `strategy` dict, `guidance` list, `next_action` |
| **Triager** | After every phase execution | Phase results, progress so far, interesting findings | `analysis` dict, `guidance` list, `next_action` |

**Why two roles?** A single "what next?" LLM call conflates two different cognitive tasks. The strategist needs broad program awareness; the triager needs detailed result interpretation. Separating them produces better output and uses fewer tokens overall.

### Graph Flow

```
START → input → strategy → executor → triage → executor → triage → ... → stop
                                        ↑         │
                                        └─────────┘ (loop back to executor)

                                          triage → strategy (re-pivot)
```

**Routing:**

| Edge | Condition | Target |
|------|-----------|--------|
| `route_from_strategy` | `next_action` starts with `phase_` | executor |
| | `next_action == "interrupt"` | interrupt |
| | `next_action == "stop"` | stop |
| `route_from_executor` | Always (even on failure) | triage |
| `route_from_triage` | `next_action == "re_strategize"` | strategy |
| | `next_action` starts with `phase_` | executor |
| | `next_action == "interrupt"` | interrupt |
| | `next_action == "stop"` | stop |

### Full System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        USER                                 │
│  (Bug Bounty Hunter)                                        │
│  • Selects program                                          │
│  • Reviews guidance + strategy                              │
│  • Interrupts / redirects agent                             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│               RUNNER (ReconAgentRunner)                     │
│  • Accepts target + platform + program_handle               │
│  • Syncs program scope from HackerOne/Bugcrowd/Intigriti    │
│  • Populates platform_context with bounty data              │
│  • Builds initial ReconState                                │
│  • Invokes LangGraph StateGraph                             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│           LANGGRAPH STATEGRAPH (6 nodes)                    │
│                                                             │
│  START                                                      │
│    │                                                        │
│    ▼                                                        │
│  ┌─────────┐                                                │
│  │  INPUT  │  Initialize state, validate target             │
│  └────┬────┘                                                │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────┐   ┌───────────────────────────────────┐       │
│  │STRATEGY  │───│ LLM: Analyze program, set focus   │       │
│  │  (LLM)   │   │ areas, priority targets, decide   │       │
│  └────┬─────┘   │ first phase. Produce guidance.    │       │
│       │         └───────────────────────────────────┘       │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────┐   ┌───────────────────────────────────┐       │
│  │EXECUTOR  │───│ Run chosen phase deterministically│       │
│  │ (phase)  │   │ Store detailed phase_results       │       │
│  └────┬─────┘   └───────────────────────────────────┘       │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────┐   ┌───────────────────────────────────┐       │
│  │ TRIAGE   │───│ LLM: Interpret results, highlight  │       │
│  │  (LLM)   │   │ interesting findings, produce     │       │
│  └────┬─────┘   │ guidance, decide next action       │       │
│       │         └───────────────────────────────────┘       │
│  ┌────┼────┐                                                │
│  │    │    │                                                │
│  ▼    ▼    ▼                                                │
│ EXEC  STRAT  STOP                                           │
│ (loop) (re-pivot)                                           │
│                                                             │
│  ┌──────────┐  ┌──────────┐                                 │
│  │INTERRUPT │  │   STOP   │  Final summary + guidance       │
│  │ (pause)  │  │          │                                 │
│  └──────────┘  └──────────┘                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent State (`ReconState`)

The state is a Pydantic `BaseModel` with 14 fields across 5 categories:

```python
class ReconState(BaseModel):
    model_config = ConfigDict(frozen=False)

    # ── Program Context (set by runner, read by strategy) ──
    target_domain: str
    goal: str
    program_scope: Dict[str, List[str]]          # in_scope + out_of_scope asset lists
    platform_context: Dict[str, Any]             # bounty range, fresh assets, competition

    # ── Strategy (set by strategy_node, read by phases + triage) ──
    strategy: Dict[str, Any]                     # focus_areas, priority_targets, depth_vs_breadth
    guidance: List[str]                          # human-readable explanations (PRIMARY UX OUTPUT)

    # ── Execution State (accumulated by phases) ──
    discovered_subdomains: List[str]
    live_hosts: List[Dict[str, Any]]
    findings: List[Dict[str, Any]]
    phase_results: Dict[str, Dict[str, Any]]     # per-phase output keyed by phase name
    tools_tried: List[str]
    phases_tried: List[str]

    # ── Agent Loop (set by LLM nodes + router) ──
    next_action: str
    reasoning: str
    interrupt_reason: str

    # ── Metadata ──
    started_at: datetime
    step_count: int = 0
    max_steps: int = 10
    last_tool_result: Dict[str, Any]
```

**Key design decisions:**
- `guidance` is the **primary UX contract** — every LLM node appends to it, the stop node adds a final summary
- `phase_results` preserves per-phase data (not just merged lists), enabling detailed triage analysis
- `strategy` is set by the strategist, consumed by phases (for priority sorting) and triage (for context)
- All new fields have empty defaults (`dict`/`list`) for backward compatibility with existing test code

---

## Phase Pipeline

### Registration

Phases are registered via decorator:

```python
@register_phase("phase_1_passive", 1, "Passive recon — discover subdomains", ["phase_0_validate"])
async def phase_1_passive(state: ReconState, registry: ToolRegistry) -> dict:
    ...
```

### Current Phases

| Phase | Description | Dependencies | Tools Used |
|-------|-------------|-------------|------------|
| `phase_0_validate` | Validate target, prepare scope | — | — |
| `phase_1_passive` | OSINT subdomain discovery | phase_0_validate | `passive_recon` |
| `phase_3_httpprobe` | HTTP probing, tech detection | phase_1_passive | `http_probe` |
| `phase_4_content` | Endpoint discovery (placeholder) | phase_3_httpprobe | — |
| `phase_5_vulnscan` | Nuclei vulnerability scanning (placeholder) | phase_3_httpprobe | — |
| `phase_6_scoring` | ROI prioritization (placeholder) | phase_4, phase_5 | — |

### Strategy Awareness

Phases receive `state.strategy` and can adjust behavior:
- `phase_1_passive`: Prioritizes subdomains matching `priority_targets`
- `phase_3_httpprobe`: Probes priority targets first (sorted before other targets)
- Future phases can use `focus_areas` to select relevant tool templates

---

## Tool Layer

### Architecture

```
ToolBase (abstract)
  ├── PassiveReconTool  → mock subdomain discovery
  └── HttpProbeTool     → mock HTTP probing with scope filtering

ToolRegistry
  ├── register(tool)     → stores tool by name
  ├── call_tool(name)    → validate_input → execute (with 30s timeout)
  └── list_tools()       → returns metadata
```

### Contract

Every tool returns:
```python
{
    "success": bool,
    "data": Any,
    "error": str | None,
    "duration_seconds": float
}
```

All tools are async. The registry wraps execution with `asyncio.wait_for(..., timeout=30.0)` and validation via `tool.validate_input(**kwargs)`.

---

## Platform Integration

### Architecture

```
PlatformClient (abstract)
  ├── HackerOneClient   → api.hackerone.com/v1
  ├── BugcrowdClient    → api.bugcrowd.com/v2
  └── IntigritiClient   → api.intigriti.com

PlatformManager
  ├── get_client(platform)  → routes to correct client
  └── sync_program_scope()  → fetches + stores scope in DB
```

### Data Flow

1. User connects platform API key (stored in `Settings`)
2. User selects a program → `PlatformManager.get_client("hackerone")`
3. `client.fetch_scope(program_handle)` returns:
   ```python
   {
       "in_scope": ["*.example.com", "api.example.com"],
       "out_of_scope": ["internal.example.com"],
       "bounty_min": 500,
       "bounty_max": 5000,
       "currency": "USD"
   }
   ```
4. Runner enriches `platform_context` and passes into `ReconState`
5. Strategy node's prompt includes bounty range, scope stats, recent additions
6. The strategist produces ROI-informed strategy: "Fresh assets get priority; high bounty ceiling justifies deep recon"

---

## API Layer

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/targets/{id}/agent/run` | Start agent session, return state with guidance |
| `GET` | `/health` | Health check |
| `GET` | `/config` | Configured providers (no keys) |

### Agent Endpoint Contract

**Request:**
```json
{
    "goal": "find all vulnerabilities",
    "program_scope": {"in_scope": [...], "out_of_scope": [...]},
    "platform": "hackerone",
    "program_handle": "some-program",
    "max_steps": 10
}
```

**Response:**
```json
{
    "target_domain": "example.com",
    "status": "completed | interrupted | error",
    "phases_executed": ["phase_1_passive"],
    "tools_executed": ["passive_recon"],
    "subdomains_count": 5,
    "live_hosts_count": 3,
    "findings_count": 1,
    "step_count": 4,
    "guidance": [
        "I'll start with passive recon to map the attack surface.",
        "Found admin.example.com — worth investigating.",
        "Recon complete. 2 live hosts, 1 finding."
    ],
    "strategy": {
        "focus_areas": ["api"],
        "priority_targets": ["api.example.com"]
    },
    "platform_context": {
        "bounty_min": 500,
        "bounty_max": 5000
    },
    "error": null
}
```

### Legacy AI Endpoints

The old `ai.py` router has fragmented endpoints (`/surface`, `/triage`, `/fp-filter`, `/scope`, `/advisor`, `/report`) that make independent LLM calls. These are superseded by the unified agent endpoint.

---

## Data Flow Example

### User: "Recon program X on HackerOne"

```
1. Runner.run_reconnaissance(
       target_domain="example.com",
       platform="hackerone",
       program_handle="some-program"
   )

2. Runner syncs HackerOne scope:
   - in_scope: ["*.example.com", "admin.example.com"]
   - bounty_min: 500
   - bounty_max: 2000
   - 3 assets added this week

3. Graph executes:
   a. INPUT: validate target, set program_scope
   b. STRATEGY (LLM call 1):
      - Analyzes: "VDP program, 50 in-scope assets,
        3 added this week, $500-$2000 bounty"
      - Sets strategy: {focus: "fresh assets", depth: "breadth"}
      - Decides: "Start with passive recon"
      - Guidance: "I'll prioritize the 3 recently-added
        assets since they're less tested."
   c. EXECUTOR: runs phase_1_passive, discovers 12 subdomains,
      sorts priority targets first, stores in phase_results
   d. TRIAGE (LLM call 2):
      - "Found 12 subdomains, 5 live hosts"
      - "Interesting: admin-panel.fresh-asset.com"
      - Guidance: "admin-panel on a fresh asset is high-value.
        Running HTTP probe next."
      - Next action: "phase_3_httpprobe"
   e. EXECUTOR: runs phase_3_httpprobe, probes priority targets
      first, admin-panel.fresh-asset.com → 200 (Django 3.2)
   f. TRIAGE (LLM call 3):
      - "Django 3.2 on admin panel — known CVEs"
      - Guidance: "Django 3.2 has CVE-2024-XXXX. Running
        targeted vuln scan."
      - Next action: "phase_5_vulnscan"
   g. ... continues until stop or interrupt

4. STOP: final guidance summary
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Strategist + Triager split** | Two distinct LLM roles with focused prompts produce better reasoning than a single overloaded "what next?" loop |
| **Guidance as primary output** | The AI teaches the user. Every decision comes with an explanation. This is the key UX differentiator. |
| **Phase pipeline (not tool pipeline)** | LLM decides WHICH PHASE to run, not which tool. Each phase runs all its tools deterministically — no token waste on per-tool decisions. |
| **Phase results preserved** | Per-phase data is stored separately so triage can reference it. Phase 1 discovered X, Phase 3 found Y on those X. |
| **Executor always routes to triage** | Even on failure, the LLM explains what happened and suggests alternatives instead of auto-interrupting. |
| **PostgreSQL only** | SQLite's single-writer model breaks parallel tool execution. PostgreSQL MVCC handles concurrent reads + writes. |
| **Platform context in strategy prompt** | The strategist needs program awareness to make ROI-informed decisions. Without bounty data, it's flying blind. |
| **Platform sync before graph** | The graph never makes API calls. All platform data is fetched before graph execution and passed through state. |
| **CLI admin-only** | Recon work lives in Web UI. CLI only handles install, config, health, and DB migrations. |

## Build Status

- [x] Complete database models (14 models)
- [x] Tool layer (PassiveReconTool, HttpProbeTool, ToolRegistry)
- [x] ReconState + StateGraph (strategist/triager split)
- [x] Agent runner + end-to-end test (61 tests passing)
- [x] Platform integration (HackerOne, Bugcrowd, Intigriti clients + manager)
- [x] API agent endpoint (`POST /api/v1/targets/{id}/agent/run`)
- [ ] Wire real API calls into tools (replace mocks with subfinder, httpx, etc.)
- [ ] SSE streaming for real-time guidance output
- [ ] React UI for agent dashboard
- [ ] WebSocket for interrupt/feedback mechanism
- [ ] Docker compose for full stack
