# RekonStrike — Multi-stage production Docker image

# ── Stage 1: Build frontend ───────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui/ .
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

COPY --from=frontend-builder /ui/dist/ ui/dist/

RUN addgroup --system app && adduser --system --ingroup app app && \
    chown -R app:app /app
USER app

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["python3", "-m", "rekonstrike", "serve", "--host", "0.0.0.0", "--port", "8000"]

# ── Stage 3: Nginx (UI serving) ──────────────────────────────────────────
FROM nginx:alpine AS ui

COPY --from=frontend-builder /ui/dist/ /usr/share/nginx/html/

COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /health { proxy_pass http://api:8000; }
    location /phases { proxy_pass http://api:8000; }
    location /scan { proxy_pass http://api:8000; }
    location /targets { proxy_pass http://api:8000; }
    location /sessions { proxy_pass http://api:8000; }

    location /ws/ {
        proxy_pass http://api:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

EXPOSE 80
