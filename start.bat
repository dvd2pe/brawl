@echo off
echo Avvio Brawl Hero Studio...
cd /d "%~dp0"
python -m http.server 8000
pause
