#!/usr/bin/env bash
echo ""
echo " Stalstadens Hockey Lineup - Build for Netlify"
echo " ================================================"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo " ERROR: Node.js is not installed."
  echo " Download it from https://nodejs.org (choose LTS version)"
  exit 1
fi
echo " Node.js found: $(node -v)"

# Install pnpm if missing
if ! command -v pnpm &>/dev/null; then
  echo " Installing pnpm..."
  npm install -g pnpm
fi

echo " Installing dependencies..."
pnpm install

echo ""
echo " Building production files..."
pnpm build

echo ""
echo " ================================================"
echo " BUILD COMPLETE!"
echo " ================================================"
echo ""
echo " Your app is ready in the 'dist' folder."
echo " Upload that folder to Netlify (see NETLIFY-GUIDE.md)"
echo ""
