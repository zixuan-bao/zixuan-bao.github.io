@echo off
setlocal
cd /d "%~dp0"
title Website Editor
set "WEBSITE_NODE="
if exist "%ProgramFiles%\nodejs\node.exe" set "WEBSITE_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined WEBSITE_NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "WEBSITE_NODE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined WEBSITE_NODE for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined WEBSITE_NODE set "WEBSITE_NODE=%%N"
if not defined WEBSITE_NODE (
  echo Node.js was not found. Install Node.js LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
echo Opening your website editor: http://localhost:1314/
echo Keep this window open while editing. Closing it stops this editor session.
"%WEBSITE_NODE%" "%~dp0scripts\start-editor.mjs"
if errorlevel 1 (
  echo.
  echo The editor could not start. Please keep this message and ask for help.
  pause
  exit /b 1
)
echo.
echo Editor address: http://localhost:1314/
echo If the browser did not appear, copy this address into your browser.
echo Press any key to close this launcher window.
pause >nul
