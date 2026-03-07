@echo off
echo Starting DiaCare CRM Backend on port 8001...
cd /d "%~dp0"
pip install -r requirements.txt -q
python main.py
