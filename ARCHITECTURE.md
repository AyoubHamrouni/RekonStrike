# RekonStrike v2 Architecture

## Core Principles
1. **PostgreSQL-only** — All data persists to PostgreSQL via asyncpg + SQLAlchemy async
2. **Autonomous agent-driven** — LangGraph handles multi-tool coordination
3. **Web UI primary** — All user interaction goes through React + WebSocket, not CLI
4. **Multi-model LLM** — Support Anthropic, OpenAI, Google Gemini via LangChain

## Technology Stack
- **Backend:** FastAPI (async) + SQLAlchemy ORM (async) + PostgreSQL
- **Agent:** LangGraph (StatieGraph) + LangChain (model abstraction)
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

## Workflow
1. User links a bug bounty program (HackerOne/Bugcrowd/Intigriti)
2. User clicks "Start Reconnaissance"
3. LangGraph agent spins up with the program's scope rules
4. Agent autonomously decides: passive recon → DNS resolution → HTTP probing → tool execution
5. Agent discovers findings, surfaces anomalies, asks human for interrupt decisions
6. Human reviews findings in the dashboard
7. Human exports formatted bug report via one-click UI button

## Next Build Steps
- [] Complete database models (8 core models)
- [ ] Spike 1: Tool layer (PassiveReconTool, HttpProbeTool, ...)
- [ ] Spike 2: ReconState + StateGraph
- [ ] Spike 3: Agent runner + end-to-end test
- [ ] API routers (scan, targets, platforms, ai, ws)
- [ ] React UI for agent 