# RekonStrike v2

Offensive security recon framework. Three-plane architecture: Automation Engine (deterministic phases), Manual Workspace (guided workflows), AI Intelligence (LLM-driven agent with strategist/triager split).

## Entrypoints & Structure

- **CLI entry**: `src/rekonstrike/cli.py` → `rekonstrike.cli:app` (Typer). Admin-only commands: `install`, `config`, `serve`, `health`, `db migrate`.
- **API entry**: `src/rekonstrike/api/server.py` → FastAPI with lifespan-managed Alembic migrations
- **Agent entry**: `src/rekonstrike/agent/runner.py` → `ReconAgentRunner` wraps the LangGraph StateGraph
- **Package lives under `src/`** — set `PYTHONPATH=src` (run.sh does this; alembic.ini has `prepend_sys_path = src`)
- **Build**: hatchling (`[project.scripts]` + `[tool.hatch.build.targets.wheel]` with `packages = ["src/rekonstrike"]`)

## Running

| Action | Command |
|--------|---------|
| Unified server (API + UI) | `rekonstrike serve --port 8000 --reload` |
| One-click | `./run.sh` |
| API only | `uvicorn rekonstrike.api.server:app --reload` |
| Agent demo | `python src/rekonstrike/agent/demo.py` |
| Frontend dev | `cd ui && npm run dev` |
| Check tools | `rekonstrike install` |
| Run migrations | `rekonstrike db migrate` |
| Health check | `rekonstrike health` |

## Config

- Pydantic-settings in `src/rekonstrike/config.py:Settings` — reads `.env` file. Fields: `database_url`, `anthropic_api_key`, `openai_api_key`, `google_api_key`, `ai_provider`, `default_ai_model`
- **PostgreSQL only** (`postgresql+asyncpg://...`) — SQLite removed. Default: `postgresql+asyncpg://postgres:postgres@localhost:5432/rekonstrike`. Override via `database_url` env var or `.env`
- Redis optional — `TaskManager` falls back to direct asyncio execution if Redis unavailable
- Tool execution: `ToolRunner` in `runner.py` — native (subprocess) or Docker. Mode and concurrency set in `config.yaml`
- Platform API keys stored in `Settings` (used by `PlatformManager` to sync program scope)
- `.env.example` shows current field names

## Testing

```bash
python -m pytest tests/ src/rekonstrike/agent/ -x -q
```

- Tests require `pytest-asyncio` — each test needs `@pytest.mark.asyncio`
- Fixtures: `settings`, `db` (Database), `session` (AsyncSession), `scope_wildcard`/`scope_domain`, `runner`, `scorer`
- `conftest.py` is at `tests/conftest.py`
- Tests require a running PostgreSQL. Override URL via `TEST_DATABASE_URL` env var (default: `postgresql+asyncpg://vulnbank:vulnbank_password@localhost:5432/rekonstrike_test`)
- Agent tests use `@patch('rekonstrike.agent.graph.get_llm')` to mock the LLM
- Mock LLM responses must include `next_action` + `reasoning` (minimal); `guidance`, `strategy`, `analysis` are optional (default to empty)
- Test agent e2e flows with `ReconAgentRunner` + mocked LLM `side_effect`

## Linting

```bash
ruff check src/rekonstrike/
```

No type checker configured.

## Agent Architecture (Strategist + Triager)

The agent uses **two distinct LLM roles** rather than a single "what next?" loop:

```
START → input → strategy (LLM: "what's our approach?")
                → executor (deterministic phase)
                → triage (LLM: "what did we find?")
                → executor → triage → ... → stop
```

**Strategist** (runs once at start, optionally at major pivots):
- Analyzes program context (bounty range, scope freshness, competition)
- Sets `strategy` dict with focus areas, priority targets, depth-vs-breadth
- Produces initial `guidance` for the user
- Decides first phase to execute

**Triager** (runs after every phase):
- Interprets phase results through a bug bounty lens
- Highlights interesting findings
- Produces `guidance` explaining what was found and why it matters
- Decides next action: next phase, re-strategize, interrupt, or stop

Neither decides individual tool calls — phases handle that deterministically.

### Agent State (`ReconState`)

| Field | Type | Set by | Purpose |
|-------|------|--------|---------|
| `target_domain` | `str` | caller | Target being recon'd |
| `goal` | `str` | caller | High-level objective |
| `program_scope` | `Dict[str, List[str]]` | caller / runner | In-scope and out-of-scope assets |
| `platform_context` | `Dict[str, Any]` | runner | Platform metadata (bounty, freshness, competition) |
| `strategy` | `Dict[str, Any]` | strategy_node | Focus areas, priority targets, depth-vs-breadth |
| `guidance` | `List[str]` | all LLM nodes | Human-readable explanations (primary UX output) |
| `phase_results` | `Dict[str, Dict]` | executor | Detailed per-phase output keyed by phase name |
| `discovered_subdomains` | `List[str]` | phases | Accumulated subdomains |
| `live_hosts` | `List[Dict]` | phases | Accumulated live hosts |
| `findings` | `List[Dict]` | phases | Accumulated findings |
| `phases_tried` | `List[str]` | executor | Ordered list of executed phases |
| `next_action` | `str` | LLM nodes | What to do next |
| `guidance` is the **primary UX contract**. Every LLM node appends to it. The stop_node adds a final summary.

### LLM Prompt Structure

**Strategy prompt** includes: platform context (bounty range, scope stats, recently-added assets), available phases, and asks for strategy + guidance + next_action.

**Triage prompt** includes: last phase result summary, overall progress, strategy, and asks for analysis + guidance + next_action.

Both prompts require JSON output with `next_action` and `reasoning`. Strategy additionally requires `strategy` dict and `guidance` list. Triage additionally requires `analysis` dict and `guidance` list.

### Guidance Output

Guidance accumulates across all nodes and is the primary UX output. Example:

```
Strategy guidance: "I'll focus on the 3 recently-added assets — they're less tested."
Triage guidance:    "Found Django 3.2 on admin.example.com — known CVEs, running vuln scan."
Stop guidance:      "Recon complete. 2 live hosts, 1 finding. Review in dashboard."
```

### Platform Context Wiring

`ReconAgentRunner.run_reconnaissance()` accepts `platform` and `program_handle` params. When provided:
1. Creates a `PlatformManager` from settings
2. Calls `client.fetch_scope(program_handle)` on HackerOne/Bugcrowd/Intigriti
3. Enriches `program_scope` with platform asset lists
4. Populates `platform_context` with: bounty min/max, asset counts, currency
5. Passes everything into the initial `ReconState`

The strategy_node's prompt includes platform_context so the LLM can make ROI-informed decisions.

### Strategy-Aware Phases

Phases receive `state.strategy` and can adjust behavior:
- `phase_1_passive`: prioritizes subdomains matching `priority_targets`
- `phase_3_httpprobe`: probes priority targets first
- Future phases can use `focus_areas` to select relevant tool templates

### Phase Pipeline

- Registered via `@register_phase(name, number, description, dependencies)` decorator
- 7 phases: `phase_0_validate` → `phase_1_passive` → `phase_3_httpprobe` → `phase_4_content` → `phase_5_vulnscan` → `phase_6_scoring`
- Each phase runs tools deterministically via `ToolRegistry` (no LLM calls)
- Orchestrated by the graph: LLM chooses phase → executor runs it → triage interprets results

## Database

- SQLAlchemy async: models in `src/rekonstrike/database.py` (self-contained, not split per model)
- Migrations via Alembic (`migrations/` dir, config at `alembic.ini`)
- Key tables: `scope_targets`, `subdomains`, `live_hosts`, `scan_sessions`, `vulnerabilities`, `dns_records`
- Repositories in `src/rekonstrike/repositories/` — `TargetRepository`, `SessionRepository`, `HostRepository`
- `Database.get_session()` returns an `AsyncSession` directly (not an async generator). Use `async with db.get_session() as s:` (no `await`).

## CI

`.github/workflows/ci.yml`: lint (`ruff check`) → test (`pytest tests/ -v --tb=short`) → frontend build (`npm ci && npm run build`) → docker build for each tool + API image.

Quirk: CI assumes the repo is checked out inside a parent `rekonstrike/` directory (uses `working-directory: rekonstrike`, paths like `rekonstrike/requirements.txt`). Only matters if debugging CI.

## Docker

- `docker-compose.yml`: API + PostgreSQL 17 + Redis 7
- `Dockerfile`: multi-stage — builds frontend (Node 22), then Python 3.14-slim runtime, then Nginx UI stage
- Tool containers built per-tool via `docker/rekonstrike/tools/Dockerfile` (matrix of subfinder, httpx, nuclei, etc.)

## External Tools

`rekonstrike install` checks availability. All are Go binaries except `cloud_enum` (Python) and `cewl` (Ruby gem). Tool wrappers in `src/rekonstrike/tools/wrappers.py`. `ToolRunner` in `src/rekonstrike/runner.py` handles native subprocess and Docker execution with semaphore-based concurrency.

## Key Architecture Files

| File | Purpose |
|------|---------|
| `src/rekonstrike/agent/state.py` | `ReconState` — 14 fields across 5 categories (program context, strategy, execution, loop, metadata) |
| `src/rekonstrike/agent/graph.py` | LangGraph StateGraph with 6 nodes: input → strategy → executor → triage → interrupt/stop |
| `src/rekonstrike/agent/phases.py` | Phase registry with `@register_phase` decorator + 7 strategy-aware phase implementations |
| `src/rekonstrike/agent/runner.py` | `ReconAgentRunner` — wraps graph.ainvoke with platform context sync + config setup |
| `src/rekonstrike/agent/tools_base.py` | Abstract `ToolBase` with async execute/validate_input |
| `src/rekonstrike/agent/tools.py` | `PassiveReconTool`, `HttpProbeTool` implementations |
| `src/rekonstrike/agent/tool_registry.py` | `ToolRegistry` with 30s timeout, validation gate, structured logging |
| `src/rekonstrike/agent/_graph_fallback.py` | Mock LangGraph when langgraph not installed |
| `src/rekonstrike/config.py` | Pydantic Settings |
| `src/rekonstrike/database.py` | SQLAlchemy async models + `Database` class |
| `src/rekonstrike/platforms/manager.py` | `PlatformManager` — routes to HackerOne/Bugcrowd/Intigriti clients |
| `src/rekonstrike/scope.py` | Wildcard/domain/CIDR scope matching |
| `src/rekonstrike/scoring.py` | ROI scoring (50+ signals) |
| `src/rekonstrike/engine.py` | Old pipeline + `@phase` decorator (legacy, agent uses agent/phases.py instead) |
| `src/rekonstrike/api/server.py` | FastAPI app with lifespan + agent router |
| `src/rekonstrike/api/routers/agent.py` | `POST /api/v1/targets/{id}/agent/run` — runs agent, returns state with guidance |
| `src/rekonstrike/api/routers/ai.py` | Legacy fragmented AI endpoints (surface, triage, fp-filter, scope, advisor, report) |
| `src/rekonstrike/api/deps.py` | FastAPI DI (repos, auth, DB session) |
| `src/rekonstrike/services/scan_service.py` | Scan orchestration |
