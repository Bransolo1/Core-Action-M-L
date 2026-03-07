@echo off
setlocal enabledelayedexpansion
title Core Action ML

echo.
echo   CORE ACTION ML ^| Inventory Forecast Tool ^| #RIDECORE
echo   =====================================================
echo.

:: ── [1/4] Node.js ─────────────────────────────────────────────────────────────
echo   [1/4] Checking Node.js...

node --version >/dev/null 2>&1
if %errorlevel% == 0 (
    for /f %%v in ('node --version') do echo         Found Node.js %%v
    goto :config
)

echo         Node.js not found — downloading automatically...

:: Try winget (available on Windows 10 1709+ and Windows 11)
winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements >/dev/null 2>&1
if %errorlevel% == 0 (
    echo         Installing via winget...
    goto :refresh_path
)

:: Fallback: download the MSI directly with PowerShell
echo         Downloading Node.js installer (this may take a minute)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile ($env:TEMP + '\node_install.msi') -UseBasicParsing"

echo         Installing Node.js (a UAC prompt may appear)...
msiexec /i "%TEMP%\node_install.msi" /quiet /norestart
del "%TEMP%\node_install.msi" 2>/dev/null

:refresh_path
:: Refresh PATH from the registry so node is available in this session
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do (
    set "SYS_PATH=%%B"
)
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do (
    set "USR_PATH=%%B"
)
set "PATH=!SYS_PATH!;!USR_PATH!;%PATH%"

node --version >/dev/null 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   ERROR: Could not auto-install Node.js.
    echo   Please install manually: https://nodejs.org/en/download
    echo   Then run this script again.
    pause
    exit /b 1
)
for /f %%v in ('node --version') do echo         Node.js %%v installed

:: ── [2/4] Configuration ────────────────────────────────────────────────────────
:config
echo.
echo   [2/4] Configuration...

if exist ".env.local" (
    echo         .env.local exists
    goto :check_key
)

:: Generate a random secret with PowerShell
for /f %%s in ('powershell -NoProfile -Command "[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))"') do set "SECRET=%%s"

(
echo DATABASE_URL="file:./local.db"
echo NEXTAUTH_SECRET=!SECRET!
echo NEXTAUTH_URL=http://localhost:3000
echo ANTHROPIC_API_KEY=
) > .env.local
echo         Created .env.local

:check_key
findstr /C:"ANTHROPIC_API_KEY=" .env.local | findstr /V "ANTHROPIC_API_KEY=$" >/dev/null 2>&1
if %errorlevel% == 0 goto :install

echo.
echo         Optional: Anthropic API key enables AI buying insights
echo         Free key at: https://console.anthropic.com
echo.
set /p "USER_KEY=        Paste key here (or press Enter to skip): "
if defined USER_KEY (
    powershell -NoProfile -Command ^
      "(Get-Content '.env.local') -replace 'ANTHROPIC_API_KEY=.*', ('ANTHROPIC_API_KEY=' + '!USER_KEY!') | Set-Content '.env.local'"
    echo         Key saved
) else (
    echo         AI features disabled
)

:: ── [3/4] Install & database ───────────────────────────────────────────────────
:install
echo.
echo   [3/4] Installing packages (first run ~1 min)...
call npm install --silent
if %errorlevel% neq 0 call npm install
echo         Packages ready

echo         Setting up database...
call npx prisma generate
call npx prisma db push --accept-data-loss
call npx tsx prisma/seed.ts 2>/dev/null
echo         Database ready

:: ── [4/4] Launch ──────────────────────────────────────────────────────────────
echo.
echo   [4/4] Starting...
echo.
echo   ====================================
echo    -^> http://localhost:3000
echo.
echo    Login: admin@ridecore.pro
echo    Pass:  CoreAction2026!
echo   ====================================
echo.
echo   Press Ctrl+C to stop.
echo.

:: Open browser after a delay
start /b powershell -NoProfile -Command "Start-Sleep 4; Start-Process 'http://localhost:3000'"

call npm run dev
endlocal
