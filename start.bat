@echo off
setlocal enabledelayedexpansion
:: ─────────────────────────────────────────────────────────────────────────────
:: Core Action ML — One-click launcher (Windows)
:: Download → Unzip → Double-click this file → Browser opens
:: No Docker, no database setup — everything is handled automatically.
:: ─────────────────────────────────────────────────────────────────────────────

cd /d "%~dp0"

echo.
echo   CORE ACTION ML — Inventory Forecast Tool — #RIDECORE
echo   ====================================================
echo.

:: ── Step 1: Check Node.js ──────────────────────────────────────────────────

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js not found.
    echo.
    echo   Please install Node.js 18+ from: https://nodejs.org
    echo   Download the LTS version, install it, then re-run this script.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_VER=%NODE_VER:v=%

echo   [OK] Node.js v%NODE_VER%

:: ── Step 2: Install dependencies ───────────────────────────────────────────

if not exist "node_modules" (
    echo.
    echo   Installing dependencies (first run only, ~30 seconds^)...
    npm install --no-audit --no-fund >nul 2>&1
    echo   [OK] Dependencies installed
)

:: ── Step 3: Setup environment ──────────────────────────────────────────────

if not exist "data" mkdir data

if not exist ".env.local" (
    for /f "delims=" %%s in ('node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"') do set SECRET=%%s
    (
        echo DATABASE_URL=file:./data/coreaction.db
        echo NEXTAUTH_SECRET=!SECRET!
        echo NEXTAUTH_URL=http://localhost:3000
    ) > .env.local
    echo   [OK] Environment configured
) else (
    echo   [OK] Environment file exists
)

:: ── Step 4: Setup database ─────────────────────────────────────────────────

echo   Setting up database...
call npx prisma generate --no-hints >nul 2>&1
call npx prisma db push --skip-generate --accept-data-loss >nul 2>&1
echo   [OK] Database ready

:: Check if admin user exists
for /f %%c in ('node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(c=>{console.log(c);p.$disconnect();})" 2^>nul') do set USER_COUNT=%%c

if "%USER_COUNT%"=="0" (
    echo   Creating admin account...
    call npx tsx prisma/seed.ts >nul 2>&1
    echo.
    echo   Login credentials:
    echo     Email:    admin@ridecore.pro
    echo     Password: CoreAction2026!
    echo.
)

:: ── Step 5: Optional — API key ─────────────────────────────────────────────

findstr /c:"ANTHROPIC_API_KEY=sk-" .env.local >nul 2>&1
if %errorlevel% neq 0 (
    echo   [Optional] AI insights need an Anthropic API key.
    echo   Get one at: https://console.anthropic.com
    echo.
    set /p "API_KEY=  Paste your API key (or press Enter to skip): "
    if defined API_KEY (
        echo ANTHROPIC_API_KEY=!API_KEY!>> .env.local
        echo   [OK] API key saved
    ) else (
        echo   [SKIP] AI features disabled
    )
    echo.
)

:: ── Step 6: Launch ─────────────────────────────────────────────────────────

echo   ════════════════════════════════════════════════════════
echo     Starting Core Action ML...
echo   ════════════════════════════════════════════════════════
echo.
echo   Open in your browser: http://localhost:3000
echo.

:: Open browser after a short delay
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

call npx next dev

pause
