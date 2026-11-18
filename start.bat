、

@echo off
echo Starting Day-Day...
start "DayDay-Server" /B node server.js
timeout /t 2 /nobreak >nul
echo.
echo Public URL:
npx localtunnel --port 3099 --subdomain synesthesia0216-dayday
pause
