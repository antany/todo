#!/usr/bin/env bash
# Build one multi-arch image (linux/amd64 + linux/arm64) from the bootJar.
# Usage: scripts/build-multiarch.sh [image]           build into a local manifest list
#        scripts/build-multiarch.sh [image] --push    ...and push it (podman login first)
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE="${1:-localhost/todo-app:latest}"

./gradlew :backend:bootJar

podman manifest rm "$IMAGE" 2>/dev/null || true
podman build --platform linux/amd64,linux/arm64 -f podman/Containerfile --manifest "$IMAGE" .

if [ "${2:-}" = "--push" ]; then
  podman manifest push --all "$IMAGE" "docker://$IMAGE"
fi
podman manifest inspect "$IMAGE" | grep -E '"(architecture|os)"'
