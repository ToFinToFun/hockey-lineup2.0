@echo off
echo.
echo  Stalstadens Hockey Lineup - Build for Netlify
echo  ================================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Node.js is not installed.
  echo  Download it from https://nodejs.org ^(choose LTS version^)
  pause
  exit /b 1
)

echo  Node.js found: 
node -v
echo.

:: Install pnpm if missing
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
  echo  Installing pnpm...
  npm install -g pnpm
)

echo  Installing dependencies...
pnpm install

echo.
echo  Building production files...
pnpm build

echo.
echo  ================================================
echo  BUILD COMPLETE!
echo  ================================================
echo.
echo  Your app is ready in the "dist" folder.
echo  Upload that folder to Netlify (see NETLIFY-GUIDE.md)
echo.
pause
