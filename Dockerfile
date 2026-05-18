# RekonStrike — Multi-stage production Docker image

# ── Stage 1: Build frontend ───────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ .
ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=$API_PROXY_TARGET
RUN npm run build

# ── Stage 2: Python runtime (API server) ──────────────────────────────────
FROM python:3.14-slim AS api

WORKDIR /app
ENV PYTHONPATH=/app/src

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/
COPY migrations/ migrations/
COPY alembic.ini .
COPY config.yaml .

RUN addgroup --system app && adduser --system --ingroup app app && \
    chown -R app:app /app
USER app

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["python3", "-m", "rekonstrike", "serve", "--host", "0.0.0.0", "--port", "8000"]

# ── Stage 3: Next.js UI server ────────────────────────────────────────────
FROM node:22-alpine AS ui

WORKDIR /app

COPY --from=frontend-builder /ui/.next/standalone ./
COPY --from=frontend-builder /ui/.next/static ./.next/static
COPY --from=frontend-builder /ui/public ./public

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["node", "server.js"]
