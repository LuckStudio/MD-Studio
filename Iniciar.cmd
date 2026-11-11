@echo off
rem Arranca el servidor local y abre la app en el navegador (necesita Node.js).
cd /d "%~dp0"
if not exist node_modules ( echo Instalando dependencias... & call npm install )
rem Libera el puerto 8765 por si quedó un servidor antiguo (sirve los .ts con tipo equivocado y rompe la app)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
start "" http://localhost:8765
node tools/serve.mjs
