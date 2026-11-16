@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先从 https://nodejs.org 安装 Node.js 22 或 24 LTS，然后重新运行。
  pause
  exit /b 1
)
if not exist node_modules call npm ci
if errorlevel 1 goto failed
if not exist public\python\pyodide.asm.wasm call npm ci
if errorlevel 1 goto failed
call npm run dev -- --open
pause
exit /b
:failed
echo 安装失败，请检查网络后重试。
pause
exit /b 1
