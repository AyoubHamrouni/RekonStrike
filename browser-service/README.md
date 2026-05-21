# RekonStrike Browser Service

Playwright-based headless browser capture service for JS bundle extraction,
source map discovery, and full-page screenshots.

## API

### POST /capture

Captures a target URL with optional scope constraints.

Request:
```json
{
  "target_url": "https://example.com",
  "scope": ["*.example.com"],
  "auth_config": {},
  "capture_screenshot": false,
  "wait_for": ".app-loaded"
}
```

Response:
```json
{
  "target_url": "https://example.com",
  "captured_at": "2026-01-01T00:00:00Z",
  "rendered_html": "<html>...</html>",
  "network_logs": [
    {"url": "...", "method": "GET", "status": 200, "request_headers": {}, "response_headers": {}, "timestamp": "..."}
  ],
  "cookies_set": [{"name": "...", "value": "...", "domain": "...", "path": "/", "httpOnly": true, "secure": true, "sameSite": "Lax"}],
  "local_storage": {"origin": "https://example.com", "localStorage": {}, "sessionStorage": {}},
  "session_storage": {"origin": "https://example.com", "localStorage": {}, "sessionStorage": {}},
  "javascript_errors": [{"message": "...", "source": "...", "lineno": 1, "colno": 1}],
  "execution_time_ms": 1234,
  "screenshot_base64": "iVBOR...",
  "js_bundles": [{"url": "...", "content": "..."}],
  "source_maps": [{"url": "...", "source_map_url": "..."}],
  "note": "optional note"
}
```

### GET /health

```json
{ "status": "ok" }
```

## Development

```bash
cd browser-service
npm ci
npm run dev
```

## Test

```bash
npx jest
```

## Docker

```bash
docker build -t rekonstrike/browser-service:latest .
```
