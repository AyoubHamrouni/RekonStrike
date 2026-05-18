rekonstrike browser-service

Minimal scaffold for a headless browser capture service. The service exposes:

POST /capture
- body: { target_url: string, auth_config?: object, max_steps?: number, scope?: object }
- response: { target_url, captured_at, raw_traffic, js_bundles, source_maps }

Development:

```bash
cd browser-service
npm ci
npm run dev
```

Docker (build):

```bash
cd browser-service
docker build -t rekonstrike/browser-service:latest .
```
