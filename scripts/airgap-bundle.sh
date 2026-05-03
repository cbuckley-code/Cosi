#!/usr/bin/env bash
# airgap-bundle.sh — build all Cosi images and bundle them for air-gapped deployment.
#
# Usage:
#   ./scripts/airgap-bundle.sh [OUTPUT_FILE]
#
# Environment variables:
#   BASE_REGISTRY        — prefix for base images during build (e.g. my.registry.local/mirror/)
#   IMAGE_REGISTRY       — prefix to tag built Cosi images (e.g. my.registry.local/cosi/)
#   IMAGE_TAG            — tag for Cosi images (default: latest)
#   NPM_CONFIG_REGISTRY  — npm registry URL for the build (e.g. https://my.nexus.local/npm/)
#
# The resulting tarball can be transferred to an air-gapped host and loaded with:
#   ./scripts/airgap-load.sh OUTPUT_FILE

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BUNDLE="${1:-cosi-airgap-bundle.tar}"
TAG="${IMAGE_TAG:-latest}"
BASE_REGISTRY="${BASE_REGISTRY:-}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"

echo "=== Cosi air-gap bundle ==="
echo "  Output  : ${BUNDLE}"
echo "  Tag     : ${TAG}"
echo "  Base registry  : ${BASE_REGISTRY:-<default Docker Hub>}"
echo "  Image registry : ${IMAGE_REGISTRY:-<local>}"
echo ""

# ── Pull base images ───────────────────────────────────────────────────────────
BASE_IMAGES=(
  "${BASE_REGISTRY}node:20-alpine"
  "${BASE_REGISTRY}node:20-slim"
  "${BASE_REGISTRY}nginx:alpine"
  "${BASE_REGISTRY}redis:7-alpine"
)

echo "Pulling base images..."
for img in "${BASE_IMAGES[@]}"; do
  echo "  pull $img"
  docker pull "$img"
done

# ── Build Cosi service images ──────────────────────────────────────────────────
echo ""
echo "Building Cosi service images..."

cd "${REPO_ROOT}"

export BASE_REGISTRY IMAGE_REGISTRY IMAGE_TAG="${TAG}" NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-}"
docker compose build

# ── Collect all images to save ────────────────────────────────────────────────
COSI_IMAGES=(
  "${IMAGE_REGISTRY}cosi-ui:${TAG}"
  "${IMAGE_REGISTRY}cosi-orchestrator:${TAG}"
  "${IMAGE_REGISTRY}cosi-builder:${TAG}"
)

ALL_IMAGES=("${BASE_IMAGES[@]}" "${COSI_IMAGES[@]}")

# ── Save ──────────────────────────────────────────────────────────────────────
echo ""
echo "Saving ${#ALL_IMAGES[@]} images to ${BUNDLE}..."
docker save "${ALL_IMAGES[@]}" -o "${BUNDLE}"

BUNDLE_SIZE=$(du -sh "${BUNDLE}" | cut -f1)
echo ""
echo "Bundle ready: ${BUNDLE} (${BUNDLE_SIZE})"
echo ""
echo "Transfer to the air-gapped host and run:"
echo "  IMAGE_REGISTRY='${IMAGE_REGISTRY}' IMAGE_TAG='${TAG}' ./scripts/airgap-load.sh ${BUNDLE}"
