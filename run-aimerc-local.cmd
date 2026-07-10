@echo off
set ROOT=C:\Users\Samuel Wildary\Desktop\aimerc

echo Starting AiMerc backend on http://127.0.0.1:4100
start "AiMerc Backend" cmd /k "cd /d %ROOT%\backend && npm run dev"

timeout /t 2 >nul

echo Starting supermarket dashboard on http://127.0.0.1:4201
start "AiMerc Dashboard" cmd /k "cd /d %ROOT%\supermarket-dashboard && npm run dev"

echo Starting SaaS admin on http://127.0.0.1:4202
start "AiMerc SaaS Admin" cmd /k "cd /d %ROOT%\saas-admin && npm run dev"

echo.
echo AiMerc local stack requested.
echo Backend: http://127.0.0.1:4100/api/health
echo Dashboard: http://127.0.0.1:4201
echo SaaS Admin: http://127.0.0.1:4202
pause
