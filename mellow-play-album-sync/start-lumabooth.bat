@echo off
REM Run this ALONGSIDE start.bat (not instead of it) — this one only moves
REM photos out of LumaBooth's export folder into New/; start.bat is what
REM actually uploads them from there into the album.
cd /d "%~dp0"

if not exist node_modules (
  echo Installing (first time only, takes a minute)...
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Node.js needs to be installed first: https://nodejs.org
    pause
    exit /b 1
  )
)

if not exist .env (
  echo.
  echo No .env file found yet. Set it up first — see start.bat / README.md.
  echo.
  pause
  exit /b 1
)

call npm run lumabooth
pause
