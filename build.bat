@echo off
title Stalstadens Hockey Lineup - Build
echo.
echo  ================================================
echo   Stalstadens Hockey Lineup - Build for Netlify
echo  ================================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Node.js is not installed.
  echo.
  echo  Please download and install it from:
  echo  https://nodejs.org  (choose the LTS version)
  echo.
  echo  After installing, run this script again.
  echo.
  pause
  exit /b 1
)

echo  Node.js found:
node -v
echo.

:: Install pnpm if missing
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
  echo  pnpm not found - installing it now...
  npm install -g pnpm
  if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Could not install pnpm.
    echo  Try running this script as Administrator (right-click - Run as administrator)
    echo.
    pause
    exit /b 1
  )
)

echo  Installing project dependencies...
echo  (this may take a minute the first time)
echo.
call pnpm install
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Dependency installation failed.
  echo  Make sure you have internet access and try again.
  echo.
  pause
  exit /b 1
)

echo.
echo  Building production files...
echo.
call pnpm build
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Build failed. See error message above.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================
echo   BUILD COMPLETE!
echo  ================================================
echo.
echo    The "dist\public" folder is now ready inside this folder.
echo    Drag that "dist\public" folder onto Netlify to deploy.
echo.
echo  Press any key to open the project folder...
pause >nul
explorer dist\public
