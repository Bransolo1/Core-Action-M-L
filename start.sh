#!/usr/bin/env bash
# Core Action ML — One-click launcher for Mac and Linux.
# Automatically downloads and installs Node.js if needed, then runs the app.

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

echo ""
echo -e "  ${RED}${BOLD}CORE ACTION ML${NC} — Inventory Forecast Tool  #RIDECORE"
echo "  ──────────────────────────────────────────────────"
echo ""

# ── [1/4] Node.js ─────────────────────────────────────────────────────────────
echo -e "  ${BLUE}[1/4]${NC} Checking Node.js..."

NODE_OK=false
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
  if [ "${NODE_VER:-0}" -ge 18 ] 2>/dev/null; then
    NODE_OK=true
    echo -e "        ${GREEN}✓${NC} Node.js $(node -v) found"
  fi
fi

if ! $NODE_OK; then
  OS="$(uname -s)"
  echo -e "        Downloading Node.js 20 LTS..."

  if [ "$OS" = "Darwin" ]; then
    curl -fsSL "https://nodejs.org/dist/v20.11.1/node-v20.11.1.pkg" -o /tmp/node_install.pkg
    echo -e "        Installing... (may prompt for your Mac password)"
    sudo installer -pkg /tmp/node_install.pkg -target / >/dev/null 2>&1
    rm -f /tmp/node_install.pkg
    export PATH="/usr/local/bin:/usr/bin:$PATH"
  else
    # Linux — install via nvm (no root required)
    export NVM_DIR="$HOME/.nvm"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash >/dev/null 2>&1
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20 >/dev/null 2>&1
    nvm use 20 >/dev/null 2>&1
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo -e "  ${RED}Could not auto-install Node.js.${NC}"
    echo "  Install manually from: https://nodejs.org/en/download"
    exit 1
  fi
  echo -e "        ${GREEN}✓${NC} Node.js $(node -v) installed"
fi

# ── [2/4] Configuration ────────────────────────────────────────────────────────
echo ""
echo -e "  ${BLUE}[2/4]${NC} Configuration..."

if [ ! -f ".env.local" ]; then
  SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -d '\n')
  printf 'DATABASE_URL="file:./local.db"\nNEXTAUTH_SECRET=%s\nNEXTAUTH_URL=http://localhost:3000\nANTHROPIC_API_KEY=\n' "$SECRET" > .env.local
  echo -e "        ${GREEN}✓${NC} Created .env.local"
else
  echo -e "        ${GREEN}✓${NC} .env.local exists"
fi

CURRENT_KEY=$(grep 'ANTHROPIC_API_KEY' .env.local 2>/dev/null | sed 's/ANTHROPIC_API_KEY=//' | tr -d '"' | tr -d "'" | xargs 2>/dev/null || true)
if [ -z "$CURRENT_KEY" ]; then
  echo ""
  echo -e "        ${YELLOW}Optional:${NC} Anthropic API key — enables AI buying insights"
  echo "        Free key at: https://console.anthropic.com"
  echo ""
  read -r -p "        Paste key (or Enter to skip): " USER_KEY
  if [ -n "$USER_KEY" ]; then
    sed -i.bak "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${USER_KEY}|" .env.local && rm -f .env.local.bak
    echo -e "        ${GREEN}✓${NC} Key saved"
  else
    echo -e "        ${YELLOW}⚠${NC}  AI features disabled"
  fi
fi

# ── [3/4] Install & database ───────────────────────────────────────────────────
echo ""
echo -e "  ${BLUE}[3/4]${NC} Installing packages (first run ~1 min)..."
npm install --silent 2>/dev/null || npm install
echo -e "        ${GREEN}✓${NC} Packages ready"

echo -e "        Setting up database..."
npx prisma generate 2>/dev/null
npx prisma db push --accept-data-loss 2>/dev/null || npx prisma db push
npx tsx prisma/seed.ts 2>/dev/null || true
echo -e "        ${GREEN}✓${NC} Database ready"

# ── [4/4] Launch ──────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BLUE}[4/4]${NC} Starting..."
echo ""
echo -e "  ════════════════════════════════════"
echo -e "   ${GREEN}${BOLD}→ http://localhost:3000${NC}"
echo ""
echo -e "   Login: admin@ridecore.pro"
echo -e "   Pass:  CoreAction2026!"
echo -e "  ════════════════════════════════════"
echo ""
echo -e "  Press Ctrl+C to stop."
echo ""

(sleep 4 && (open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null || true)) &

npm run dev
