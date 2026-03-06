#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Core Action ML — One-click launcher
# Download → Unzip → Run this script → Open browser
# No Docker, no database setup — everything is handled automatically.
# ─────────────────────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

cd "$(dirname "$0")"

echo ""
echo -e "${RED}█▀▀ █▀█ █▀█ █▀▀   █▀▄ █▀▀ ▀█▀ █ █▀█ █▄ █   █▀▄▀█ █${NC}"
echo -e "${RED}█▄▄ █▄█ █▀▄ ██▄   █▀▄ ██▄  █  █ █▄█ █ ▀█   █ ▀ █ █▄▄${NC}"
echo -e "  Inventory Forecast Tool — ${BOLD}#RIDECORE${NC}"
echo ""

# ── Step 1: Check Node.js ────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js not found.${NC}"
  echo ""
  echo "  Please install Node.js 18+ from: ${CYAN}https://nodejs.org${NC}"
  echo "  (Download the LTS version, install it, then re-run this script)"
  echo ""
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}✗ Node.js version too old ($(node -v)). Need 18+.${NC}"
  echo "  Download from: ${CYAN}https://nodejs.org${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# ── Step 2: Install dependencies ─────────────────────────────────────────────

if [ ! -d "node_modules" ]; then
  echo ""
  echo -e "${CYAN}Installing dependencies (first run only, ~30 seconds)...${NC}"
  npm install --no-audit --no-fund 2>&1 | tail -1
  echo -e "${GREEN}✓${NC} Dependencies installed"
fi

# ── Step 3: Setup environment ────────────────────────────────────────────────

mkdir -p data

if [ ! -f ".env.local" ]; then
  GENERATED_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  cat > .env.local << EOF
DATABASE_URL=file:./data/coreaction.db
NEXTAUTH_SECRET=${GENERATED_SECRET}
NEXTAUTH_URL=http://localhost:3000
EOF
  echo -e "${GREEN}✓${NC} Environment configured"
else
  # Ensure DATABASE_URL points to SQLite if it still has a PostgreSQL URL
  if grep -q "postgresql://" .env.local 2>/dev/null; then
    echo -e "${YELLOW}⚠ Updating DATABASE_URL from PostgreSQL to SQLite...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' 's|DATABASE_URL=postgresql://.*|DATABASE_URL=file:./data/coreaction.db|' .env.local
    else
      sed -i 's|DATABASE_URL=postgresql://.*|DATABASE_URL=file:./data/coreaction.db|' .env.local
    fi
  fi
  echo -e "${GREEN}✓${NC} Environment file exists"
fi

# ── Step 4: Setup database ───────────────────────────────────────────────────

echo -e "${CYAN}Setting up database...${NC}"
npx prisma generate --no-hints 2>/dev/null
npx prisma db push --skip-generate --accept-data-loss 2>/dev/null
echo -e "${GREEN}✓${NC} Database ready"

# Seed admin user if database is empty
USER_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count().then(c => { console.log(c); p.\$disconnect(); });
" 2>/dev/null || echo "0")

if [ "$USER_COUNT" = "0" ]; then
  echo -e "${CYAN}Creating admin account...${NC}"
  npx tsx prisma/seed.ts 2>/dev/null
  echo ""
  echo -e "  ${BOLD}Login credentials:${NC}"
  echo -e "  Email:    ${CYAN}admin@ridecore.pro${NC}"
  echo -e "  Password: ${CYAN}CoreAction2026!${NC}"
  echo ""
fi

# ── Step 5: Optional — Anthropic API key ─────────────────────────────────────

if ! grep -q "ANTHROPIC_API_KEY=sk-" .env.local 2>/dev/null; then
  echo -e "${YELLOW}Optional:${NC} AI insights require an Anthropic API key."
  echo -e "  Get one at: ${CYAN}https://console.anthropic.com${NC}"
  echo ""
  read -r -p "  Paste your API key (or press Enter to skip): " key
  if [ -n "$key" ]; then
    echo "ANTHROPIC_API_KEY=$key" >> .env.local
    echo -e "  ${GREEN}✓${NC} API key saved"
  else
    echo -e "  ${YELLOW}⚠${NC} Skipped — AI features disabled"
  fi
  echo ""
fi

# ── Step 6: Launch ───────────────────────────────────────────────────────────

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ▶ Starting Core Action ML...${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Open in your browser: ${BOLD}${CYAN}http://localhost:3000${NC}"
echo ""

# Open browser automatically (best-effort, non-blocking)
(sleep 3 && {
  if command -v open &>/dev/null; then
    open "http://localhost:3000" 2>/dev/null
  elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3000" 2>/dev/null
  fi
}) &

npx next dev
