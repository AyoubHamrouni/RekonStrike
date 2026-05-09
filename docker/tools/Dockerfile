# RekonStrike Tool Container — Multi-stage Go build
# Build: docker build --build-arg TOOL=subfinder -t rekonstrike/subfinder:latest .
# Run:   docker run --rm -i rekonstrike/subfinder:latest -d example.com -silent

ARG TOOL

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder
ARG TOOL
RUN apk add --no-cache git ca-certificates

RUN case "$TOOL" in \
    subfinder)         go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest ;; \
    httpx)             go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest ;; \
    nuclei)            go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest ;; \
    gau)               go install -v github.com/lc/gau/v2/cmd/gau@latest ;; \
    shuffledns)        go install -v github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest ;; \
    dnsx)              go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest ;; \
    amass)             go install -v github.com/owasp-amass/amass/v4/...@master ;; \
    naabu)             go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest ;; \
    gospider)          go install -v github.com/jaeles-project/gospider@latest ;; \
    metabigor)         go install -v github.com/j3ssie/metabigor@latest ;; \
    github-subdomains) go install -v github.com/gwen001/github-subdomains@latest ;; \
    katana)            go install -v github.com/projectdiscovery/katana/cmd/katana@latest ;; \
    ffuf)              go install -v github.com/ffuf/ffuf/v2@latest ;; \
    cewl)              apk add --no-cache ruby ruby-dev && gem install cewl ;; \
    *)                 echo "Unknown tool: $TOOL" && exit 1 ;; \
    esac

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM alpine:3.21
ARG TOOL
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /go/bin/${TOOL} /usr/local/bin/tool
LABEL tool="${TOOL}" maintainer="RekonStrike"
ENTRYPOINT ["/usr/local/bin/tool"]
