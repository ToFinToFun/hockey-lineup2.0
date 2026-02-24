#!/usr/bin/env bash
# =============================================================================
# Stålstadens Hockey Lineup – Build & Deploy Script
# =============================================================================
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Supports:
#   1. Local preview (serve dist/ locally)
#   2. Netlify (via Netlify CLI)
#   3. Vercel (via Vercel CLI)
#   4. GitHub Pages (via gh-pages npm package)
#   5. Build only (output to dist/)
# =============================================================================

set -e

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}ℹ  $*${NC}"; }
success() { echo -e "${GREEN}✔  $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠  $*${NC}"; }
error()   { echo -e "${RED}✖  $*${NC}"; exit 1; }

# ── Check prerequisites ───────────────────────────────────────────────────────
check_node() {
  if ! command -v node &>/dev/null; then
    error "Node.js is not installed. Download it from https://nodejs.org (v18+ required)"
  fi
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    error "Node.js v18+ required (found v$(node -v)). Please upgrade."
  fi
  success "Node.js $(node -v) found"
}

check_package_manager() {
  if command -v pnpm &>/dev/null; then
    PKG="pnpm"
  elif command -v npm &>/dev/null; then
    PKG="npm"
  else
    error "No package manager found. Install pnpm (https://pnpm.io) or npm."
  fi
  success "Package manager: $PKG"
}

# ── Install dependencies ──────────────────────────────────────────────────────
install_deps() {
  info "Installing dependencies..."
  $PKG install
  success "Dependencies installed"
}

# ── Build ─────────────────────────────────────────────────────────────────────
build() {
  info "Building production bundle..."
  $PKG run build
  success "Build complete → dist/"
}

# ── Deploy targets ────────────────────────────────────────────────────────────
deploy_local() {
  info "Starting local preview server on http://localhost:4173"
  warn "Press Ctrl+C to stop"
  $PKG run preview
}

deploy_netlify() {
  if ! command -v netlify &>/dev/null; then
    info "Installing Netlify CLI..."
    npm install -g netlify-cli
  fi
  info "Deploying to Netlify..."
  netlify deploy --prod --dir=dist
  success "Deployed to Netlify!"
}

deploy_vercel() {
  if ! command -v vercel &>/dev/null; then
    info "Installing Vercel CLI..."
    npm install -g vercel
  fi
  info "Deploying to Vercel..."
  vercel --prod
  success "Deployed to Vercel!"
}

deploy_github_pages() {
  if ! $PKG list gh-pages &>/dev/null 2>&1; then
    info "Installing gh-pages..."
    $PKG add -D gh-pages 2>/dev/null || npm install -g gh-pages
  fi

  # Prompt for repo URL if not set
  GIT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if [ -z "$GIT_REMOTE" ]; then
    echo -n "Enter your GitHub repository URL (e.g. https://github.com/user/repo): "
    read -r GIT_REMOTE
    git remote add origin "$GIT_REMOTE"
  fi

  info "Deploying to GitHub Pages (branch: gh-pages)..."
  npx gh-pages -d dist
  success "Deployed to GitHub Pages!"
  warn "Enable GitHub Pages in your repo: Settings → Pages → Branch: gh-pages"
}

# ── Menu ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Stålstadens Hockey Lineup – Deploy Tool   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Where do you want to deploy?"
echo ""
echo "  1) Local preview    (http://localhost:4173)"
echo "  2) Netlify          (free hosting, requires account)"
echo "  3) Vercel           (free hosting, requires account)"
echo "  4) GitHub Pages     (free, requires GitHub repo)"
echo "  5) Build only       (output to dist/ folder)"
echo ""
echo -n "  Enter choice [1-5]: "
read -r CHOICE
echo ""

# ── Run ───────────────────────────────────────────────────────────────────────
check_node
check_package_manager
install_deps
build

case "$CHOICE" in
  1) deploy_local ;;
  2) deploy_netlify ;;
  3) deploy_vercel ;;
  4) deploy_github_pages ;;
  5) success "Build complete. Files are in the dist/ folder." ;;
  *) error "Invalid choice: $CHOICE. Run the script again and enter 1–5." ;;
esac
