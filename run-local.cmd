@echo off
rem Starts the whole local MAIL_PLATFORM stack. Double-click this file, or run run-local.cmd from a terminal.
rem Needs Docker Desktop running. Press Ctrl+C in this window to stop the services.
cd /d "%~dp0"
set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm;%ProgramFiles%\Docker\Docker\resources\bin"

docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo Docker is not running. Start Docker Desktop, wait until it says "Engine running", then run this again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call pnpm.cmd install || goto :failed
)
if not exist .env (
  call pnpm.cmd setup || goto :failed
)

echo [1/3] Starting Postgres, Redis, Postfix, Mailpit and the MX simulator...
call pnpm.cmd dev:infra || goto :failed
echo [2/3] Applying database migrations...
call pnpm.cmd db:migrate || goto :failed
echo.
echo [3/3] Starting all services. Once you see "Local: http://localhost:5173", open:
echo        Dashboard   http://localhost:5173
echo        API docs    http://localhost:3000/docs
echo        Mailpit     http://localhost:8025   (captured outgoing mail)
echo.
call pnpm.cmd dev
exit /b 0

:failed
echo.
echo Something failed above. Copy the error and ask for help.
pause
exit /b 1
