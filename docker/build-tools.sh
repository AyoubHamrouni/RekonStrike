#!/bin/bash
# RekonStrike — Build all Docker tool containers
set -euo pipefail

TOOLS=(
    subfinder httpx nuclei gau shuffledns dnsx
    amass naabu gospider metabigor github-subdomains
    katana ffuf cewl
)

DOCKER_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKERFILE="$DOCKER_DIR/tools/Dockerfile"

for tool in "${TOOLS[@]}"; do
    echo "==> Building rekonstrike/${tool}:latest"
    docker build \
        --build-arg TOOL="$tool" \
        -t "rekonstrike/${tool}:latest" \
        -f "$DOCKERFILE" \
        "$DOCKER_DIR/tools"
    echo "    Done."
done

echo "==> All containers built successfully"
docker images --filter "reference=rekonstrike/*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
