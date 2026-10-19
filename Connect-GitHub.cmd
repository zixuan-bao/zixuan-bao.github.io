@echo off
cd /d "%~dp0"
echo Sign in as zixuanb3 to enable the editor's Publish button.
git credential-manager github login --username zixuanb3 --browser
pause
