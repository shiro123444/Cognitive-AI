#!/usr/bin/env bash
set -euo pipefail

# ── EDUFISH Engine — one-click deployment ────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo " EDUFISH Engine — One-Click Setup"
echo "============================================"
echo ""

# 1. Check prerequisites
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "[ERROR] '$1' is required but not found. Please install it first."
    exit 1
  fi
}

# Accept either docker compose (V2 plugin) or docker-compose (V1 standalone)
if docker compose version &>/dev/null; then
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  DOCKER_COMPOSE="docker-compose"
else
  echo "[ERROR] Docker Compose is required but not found."
  echo "  Install Docker Desktop: https://docs.docker.com/get-docker/"
  exit 1
fi

# 2. Create .env if missing
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "[*] Creating .env from template..."
  cp "$SCRIPT_DIR/.env.template" "$SCRIPT_DIR/.env"
  echo "[!] Please edit deploy/.env with your LLM API key and other settings."
  echo ""
fi

# Source .env for local variable access (safe — only sets exported vars)
set -a
# shellcheck source=/dev/null
. "$SCRIPT_DIR/.env" 2>/dev/null || true
set +a

# 3. Build and start
echo "[*] Building and starting EDUFISH Engine..."
cd "$PROJECT_DIR"
$DOCKER_COMPOSE -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

# 4. Wait for healthy
ENGINE_PORT="${ENGINE_PORT:-5001}"
echo "[*] Waiting for engine to become healthy..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${ENGINE_PORT}/health" >/dev/null 2>&1; then
    echo "[OK] Engine is healthy at http://localhost:${ENGINE_PORT}"
    break
  fi
  sleep 2
done

# 5. Print integration info
FRONTEND_PORT="${FRONTEND_PORT:-3025}"
echo ""
echo "============================================"
echo " EDUFISH Engine is running!"
echo "============================================"
echo ""
echo "  Frontend:   http://localhost:${FRONTEND_PORT}"
echo "  API base:   http://localhost:${ENGINE_PORT}/api/v1"
echo "  Health:     http://localhost:${ENGINE_PORT}/health"
echo ""
echo "  Quick test:"
echo "    curl http://localhost:${ENGINE_PORT}/health"
echo ""
echo "============================================"
