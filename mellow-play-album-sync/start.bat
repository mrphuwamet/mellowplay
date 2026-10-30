@echo off
REM Double-click this to run the tool. The window has to stay open — closing
REM it stops the watcher, same as closing any other running program.
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
  echo No .env file found yet.
  echo Copy .env.example to .env, open it in Notepad, and fill in your CRM
  echo admin email/password and which folder to watch. Then run this again.
  echo.
  pause
  exit /b 1
)

call npm start
pause
