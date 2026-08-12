@echo off
setlocal
cd /d "%~dp0"

echo Installing PyInstaller (if needed)...
python -m pip install --upgrade pyinstaller
if errorlevel 1 (
  echo Failed to install PyInstaller.
  pause
  exit /b 1
)

echo.
echo Building VoxieServe.exe ...
python -m PyInstaller --noconfirm --clean --onefile --console --name VoxieServe run.py
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

copy /Y "dist\VoxieServe.exe" "VoxieServe.exe" >nul
echo.
echo Done: %~dp0VoxieServe.exe
echo Keep this .exe in the same folder as index.html
echo.
pause
