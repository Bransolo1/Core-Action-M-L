#!/usr/bin/env bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

echo ""
echo -e "${RED}█▀▀ █▀█ █▀█ █▀▀   █▀▄ █▀▀ ▀█▀ █ █▀█ █▄ █   █▀▄▀█ █${NC}"
echo -e "${RED}█▄▄ █▄█ █▀▄ ██▄   █▀▄ ██▄  █  █ █▄█ █ ▀█   █ ▀ █ █▄▄${NC}"
echo -e "${NC}  Inventory Forecast Tool — #RIDECORE"
echo ""

# ── Detect runner ────────────────────────────────────────────────────────────

USE_DOCKER=false
USE_NODE=false

if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  USE_DOCKER=true
elif command -v node &>/dev/null; then
  USE_NODE=true
else
  echo -e "${RED}ERROR:${NC} Neither Docker nor Node.js found."
  echo ""
  echo "Install one of:"
  echo "  • Docker Desktop  → https://www.docker.com/products/docker-desktop"
  echo "  • Node.js 18+     → https://nodejs.org"
  exit 1
fi

# ── API key ──────────────────────────────────────────────────────────────────

if [ -f ".env.local" ]; then
  # shellcheck disable=SC1091
  source .env.local 2>/dev/null || true
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo -e "${YELLOW}An Anthropic API key is needed for AI insights.${NC}"
  echo "Get one free at: https://console.anthropic.com"
  echo ""
  read -r -p "Paste your ANTHROPIC_API_KEY (or press Enter to skip AI features): " key
  if [ -n "$key" ]; then
    export ANTHROPIC_API_KEY="$key"
    echo "ANTHROPIC_API_KEY=$key" > .env.local
    echo -e "${GREEN}✓ Key saved to .env.local${NC}"
  else
    echo -e "${YELLOW}⚠ AI insights will be disabled (no key provided)${NC}"
  fi
fi

# ── Launch ───────────────────────────────────────────────────────────────────

if $USE_DOCKER; then
  echo ""
  echo -e "${GREEN}▶ Starting with Docker...${NC}"
  echo "  (first run builds the image — takes ~2 min)"
  echo ""
  docker compose up --build
else
  echo ""
  echo -e "${GREEN}▶ Starting with Node.js $(node -v)...${NC}"
  echo ""

  if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
  fi

  npm run dev
fi
