@echo off
cd /d "%~dp0"
title Personal website preview
echo Your preview will be available at http://localhost:1313/
echo Keep this window open while viewing the website. Press Ctrl+C to stop.
node scripts\hugo.mjs server --bind 127.0.0.1 --port 1313 --disableFastRender
pause
