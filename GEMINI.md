# RekonStrike v2: Advanced Reconnaissance Framework

RekonStrike v2 is a professional-grade reconnaissance and asset discovery framework organized into a **Three-Plane Architecture**. It combines deterministic automation with human judgment and AI-driven analysis.

## 🏛 Architecture Overview

1.  **⚡ Automation Engine (Bottom Plane):** High-performance, deterministic reconnaissance phases (OSINT, DNS, HTTP Probing, Tech Detection).
2.  **🛠 Manual Testing Workspace (Middle Plane):** A guided web-based workbench for human researchers to verify findings and perform deep manual testing.
3.  **🤖 AI Intelligence Layer (Top Plane):** A LangGraph-powered autonomous agent that uses LLMs (OpenAI, Anthropic, or Gemini) to strategize and triage reconnaissance results.

## 🚀 Key Commands

### Backend (Python)
- **Install:** `pip install -e .` (Requires Python 3.14+)
- **Run API & UI:** `python -m rekonstrike`
- **Database Migrations:** `alembic upgrade head`
- **Run Agent Demo:** `python src/rekonstrike/agent/demo.py`
- **Health Check:** `curl http://localhost:8000/health`

### Frontend (React)
- **Install:** `cd ui && npm install`
- **Development:** `npm run dev`
- **Build:** `npm run build`

### Infrastructure
- **Full Stack:** `docker compose up -d`
- **One-click Start:** `./run.sh`

## 🛠 Technology Stack

- **Backend:** FastAPI, SQLAlchemy (Async), PostgreSQL, LangGraph, LangChain.
- **Frontend:** React 19, TypeScript, TailwindCSS 4, Vite 8, Recharts.
- **Database:** PostgreSQL (Required, no SQLite support).
- **Agent:** LangGraph `StateGraph` with Strategist and Triager roles.
- **Tools Wrapper:** `Subfinder`, `Httpx`, `Nuclei`, `Katana`, `Gau`, `Naabu`, `GoSpider`, `CloudEnum`, etc.
- **Configuration:** Pydantic `BaseSettings` reading from `.env`.

## 📂 Project Structure

- `src/rekonstrike/`: Main Python package.
    - `agent/`: LangGraph agent logic, state, and strategy-aware phases.
    - `api/`: FastAPI routers and server entry point.
    - `tools/`: Low-level tool wrappers and `ToolRunner`.
    - `database.py`: SQLAlchemy models and database management.
- `ui/`: React frontend source code.
- `migrations/`: Alembic database migration scripts.
- `docker/`: Dockerfiles for the application and various recon tools.

## 📝 Development Conventions

- **Repository Pattern:** Database access is abstracted into repositories (e.g., `TargetRepository`, `HostRepository`).
- **Strategy-Aware Phases:** Agent phases in `src/rekonstrike/agent/phases.py` prioritize targets based on the LLM-generated strategy.
- **Mock Fallbacks:** Agent tools (`src/rekonstrike/agent/tools.py`) fall back to mock data if binary tools are missing, facilitating development without a full recon stack.
- **Async First:** The entire backend is built on `asyncio`. Use `await` for database and tool execution.
- **Testing:** Uses `pytest` and `pytest-asyncio`. Run with `python -m pytest tests/`. Agent tests often mock LLM responses.
- **Linting:** `ruff check src/rekonstrike/`

## ⚙️ Configuration

Set these in your `.env` file:
- `DATABASE_URL`: `postgresql+asyncpg://user:pass@localhost:5432/dbname`
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`: For agent intelligence.
- `AI_PROVIDER`: `openai`, `anthropic`, or `google`.
- `TOOL_MODE`: `native` (default) or `docker`.
