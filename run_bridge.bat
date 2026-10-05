@echo off
echo Starting MT5 Bridge...
setlocal
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python -m uvicorn mt5_bridge:app --host 127.0.0.1 --port 8001 --reload
pause
