@echo off
echo Starting AI Trading API (FastAPI)...
setlocal
cd /d "%~dp0"
set PYTHONPATH=src;.
call .venv\Scripts\activate.bat
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
