#!/usr/bin/env bash
# airgap-load.sh — load a Cosi air-gap bundle and optionally push to a local registry.
#
# Usage:
#   ./scripts/airgap-load.sh [BUNDLE_FILE]
#
# Environment variables:
#   IMAGE_REGISTRY  — registry prefix the images were tagged with during bundling.
#                     Must match what was used in airgap-bundle.sh.
#   IMAGE_TAG       — image tag (default: latest)
#
# After loading, start the stack with:
#   IMAGE_REGISTRY=... IMAGE_TAG=... docker compose up -d

set -euo pipefail

BUNDLE="${1:-cosi-airgap-bundle.tar}"
TAG="${IMAGE_TAG:-latest}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"

if [[ ! -f "${BUNDLE}" ]]; then
  echo "Error: bundle not found: ${BUNDLE}" >&2
  exit 1
fi

echo "=== Cosi air-gap load ==="
echo "  Bundle : ${BUNDLE}"
echo "  Tag    : ${TAG}"
echo ""

echo "Loading images..."
docker load < "${BUNDLE}"

echo ""
echo "Loaded images:"
for svc in cosi-ui cosi-orchestrator cosi-builder; do
  echo "  ${IMAGE_REGISTRY}${svc}:${TAG}"
done

echo ""
echo "Start the stack:"
if [[ -n "${IMAGE_REGISTRY}" ]]; then
  echo "  IMAGE_REGISTRY='${IMAGE_REGISTRY}' IMAGE_TAG='${TAG}' docker compose up -d"
else
  echo "  IMAGE_TAG='${TAG}' docker compose up -d"
fi
