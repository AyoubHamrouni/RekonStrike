# RekonStrike v2

Advanced Reconnaissance & Asset Discovery Framework organized into a Three-Plane Architecture.

## 🏛 Project Overview

RekonStrike v2 is a professional-grade offensive security framework that separates reconnaissance into three distinct layers:
1.  **⚡ Automation Engine:** Deterministic recon phases (OSINT, DNS, HTTP, Vuln scanning).
2.  **🛠 Manual Workspace:** Guided workflows for human-driven verification (BOLA, Injection, Logic).
3.  **🤖 AI Intelligence:** LLM-powered triage, pattern recognition, and report generation.

### Core Technologies
- **Backend:** Python 3.14+, FastAPI, Typer (CLI), SQLAlchemy (Async/PostgreSQL), ARQ (Redis task queue).
- **Frontend:** React 19, Vite 8, Tailwind CSS 4, Lucide React, Recharts.
- **Infrastructure:** Docker, Docker Compose, Redis, PostgreSQL.
- **Recon Tools:** Wraps external Go/Python tools like Subfinder, Httpx, Nuclei, Amass, Katana, etc.

## 🚀 Building and Running

### Backend Setup
1.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
2.  **Install external tools:**
    ```bash
    # Checks for required Go/Python tools
    python3 -m rekonstrike install
    ```
3.  **Database Migrations:**
    ```bash
    alembic upgrade head
    ```

### Running the Application (Unified Mode)
The simplest way to run RekonStrike is using the unified server, which hosts both the API and the Web UI.

- **Option A: One-Click Script (Recommended)**
    ```bash
    ./run.sh
    ```
- **Option B: CLI Unified Server**
    ```bash
    # Serve Web UI + API on http://0.0.0.0:8000
    rekonstrike serve --port 8000 --reload
    ```
- **Option C: Docker (Full Stack)**
    ```bash
    docker compose up -d
    ```

### Component-Specific Running (Development)
If you are developing and need separate hot-reloading:
- **API Server Only:**
    ```bash
    uvicorn rekonstrike.api.server:app --host 0.0.0.0 --port 8000 --reload
    ```
- **Frontend Dev Server:**
    ```bash
    cd ui && npm run dev
    ```

### Testing
```bash
pytest
```

## 🛠 Development Conventions

### Architecture Patterns
- **Repository Pattern:** Located in `src/rekonstrike/repositories/`. Decouples business logic from database operations.
- **Service Layer:** `src/rekonstrike/services/` orchestrates complex multi-repository workflows.
- **Phase Plugin System:** Each recon phase is a class decorated with `@phase`. Phases share data via `PhaseContext`.
- **Async First:** The entire backend is built using `async/await` for high-concurrency tool execution.

### Coding Style
- **Type Safety:** Heavily uses Pydantic for configuration and schemas.
- **CLI:** Built with `Typer` for a modern, help-first command-line experience.
- **Frontend:** Functional React components with Tailwind CSS for rapid UI development.

### Recon Phases
- **Phase 0:** Target Validation.
- **Phase 1:** Passive OSINT (Subdomain enumeration).
- **Phase 2:** Active Enumeration (DNS, Ports).
- **Phase 3:** HTTP Probing (Tech detection).
- **Phase 4:** Content Discovery (Crawling, Fuzzing).
- **Phase 5:** Vulnerability Scanning (Nuclei).
- **Phase 6:** ROI Scoring (Prioritization).

## 📂 Key Files
- `src/rekonstrike/cli.py`: Main CLI entry point.
- `src/rekonstrike/engine.py`: Pipeline execution logic.
- `src/rekonstrike/config.py`: Pydantic settings and YAML configuration.
- `src/rekonstrike/api/server.py`: FastAPI application setup.
- `src/rekonstrike/tasks.py`: ARQ background task definitions.
- `ui/src/App.jsx`: React frontend entry point.
- `alembic.ini`: Database migration configuration.
