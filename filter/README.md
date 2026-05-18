# Filter service

This binary reads a JSON array of HTTP traffic records from stdin and emits a
single `SurfaceCapture` JSON object to stdout.

## Input

JSON array of objects with fields:
- `id` (string) — UUID assigned by the proxy
- `timestamp` (int64) — unix milliseconds
- `method` (string)
- `url` (string) — full URL including scheme, host, path, query
- `request_headers` (map[string]string)
- `request_body` (string)
- `response_status` (int)
- `response_headers` (map[string]string)
- `response_body` (string)
- `content_type` (string)
- `duration` (int64) — response time in milliseconds

## Output

`SurfaceCapture` JSON with:
- `endpoints` — normalized, deduplicated endpoints with observed count, body schemas, param type inference
- `findings` — security-relevant observations (deltas, multi-auth, status code variance)
- `entropy_high` — parameters with Shannon entropy > 4.5 (likely tokens/JWTs)
- `sequences` — temporal patterns (auth dependency, parallel bursts, CSRF refresh)
- `clusters` — endpoints sharing ≥70% parameter names
- `auth_mutations` — token rotation and mixed auth detection

## Build

```bash
cd filter
go build -o filter
```

## Run

```bash
cat requests.json | ./filter
```

With debug output (detailed per-stage traces to stderr):

```bash
cat requests.json | ./filter --debug
```

## Test

```bash
go test ./...
```

## Architecture

Three-stage pipeline:

1. **Normalization** (5 passes): static elimination → URL normalization → dedup → header normalization → body schema extraction
2. **Extraction** (5 parallel extractors): entropy, delta, sequence, clustering, auth
3. **Assembly**: combines groups + extractor results into final SurfaceCapture

All logic is deterministic. No random, external calls, or LLM.
