@echo off
echo ===================================================
echo   Starting Website Localization Automation Tool
echo ===================================================

echo Starting FastAPI Backend in a new window...
start "Backend (FastAPI)" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate && uvicorn app.main:app --port 8000 --reload"

echo Starting Next.js Frontend in a new window...
start "Frontend (Next.js)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ===================================================
echo   Services are starting up!
echo   - Backend:  http://localhost:8000
echo   - Frontend: http://localhost:3000
echo ===================================================
echo.
pause
