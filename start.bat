@echo off
setlocal enabledelayedexpansion

echo.
echo  CORE ACTION ML — Inventory Forecast Tool — #RIDECORE
echo  =====================================================
echo.

:: ── Detect runner ─────────────────────────────────────────────────────────

set USE_DOCKER=0
set USE_NODE=0

docker compose version >nul 2>&1
if %errorlevel% == 0 (
    set USE_DOCKER=1
    goto :check_key
)

node --version >nul 2>&1
if %errorlevel% == 0 (
    set USE_NODE=1
    goto :check_key
)

echo ERROR: Neither Docker nor Node.js found.
echo.
echo Install one of:
echo   Docker Desktop  ^>  https://www.docker.com/products/docker-desktop
echo   Node.js 18+     ^>  https://nodejs.org
pause
exit /b 1

:: ── API key ───────────────────────────────────────────────────────────────

:check_key
if exist ".env.local" (
    for /f "tokens=2 delims==" %%a in ('findstr "ANTHROPIC_API_KEY" .env.local 2^>nul') do set ANTHROPIC_API_KEY=%%a
)

if not defined ANTHROPIC_API_KEY (
    echo An Anthropic API key is needed for AI insights.
    echo Get one free at: https://console.anthropic.com
    echo.
    set /p "API_KEY=Paste your ANTHROPIC_API_KEY (or press Enter to skip): "
    if defined API_KEY (
        set ANTHROPIC_API_KEY=!API_KEY!
        echo ANTHROPIC_API_KEY=!API_KEY!> .env.local
        echo Key saved to .env.local
    ) else (
        echo AI insights will be disabled.
    )
)

:: ── Launch ────────────────────────────────────────────────────────────────

if %USE_DOCKER% == 1 (
    echo.
    echo Starting with Docker...
    echo First run builds the image - takes ~2 minutes.
    echo.
    docker compose up --build
    goto :end
)

if %USE_NODE% == 1 (
    echo.
    echo Starting with Node.js...
    echo.
    if not exist "node_modules" (
        echo Installing dependencies...
        npm install
    )
    npm run dev
)

:end
pause
