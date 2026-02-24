# Stålstadens Hockey Lineup – Deployment Guide

This guide explains how to run, build, and deploy the app outside of Manus.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| pnpm | any | `npm install -g pnpm` |
| Git | any | https://git-scm.com |

---

## Quick Start (Local Development)

```bash
# 1. Download the project (Management UI → Code → Download all files)
# 2. Unzip and enter the folder
cd hockey-lineup

# 3. Install dependencies
pnpm install

# 4. Start the development server
pnpm dev
# → App runs at http://localhost:3000
```

---

## Automated Deploy Script

The included `deploy.sh` script handles everything interactively:

```bash
chmod +x deploy.sh
./deploy.sh
```

You will be prompted to choose a deployment target:

| Option | Description |
|--------|-------------|
| 1 – Local preview | Serves the production build at `http://localhost:4173` |
| 2 – Netlify | Deploys to Netlify (free tier available) |
| 3 – Vercel | Deploys to Vercel (free tier available) |
| 4 – GitHub Pages | Deploys to the `gh-pages` branch of your repository |
| 5 – Build only | Outputs static files to `dist/` for manual upload |

---

## Manual Build

```bash
pnpm build
# Output: dist/  ← upload this folder to any static host
```

The `dist/` folder is a fully self-contained static site with no server required.

---

## Hosting Options

### Netlify (Recommended – easiest)

1. Create a free account at https://netlify.com
2. Drag and drop the `dist/` folder onto the Netlify dashboard, **or** run:
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod --dir=dist
   ```

### Vercel

1. Create a free account at https://vercel.com
2. Run:
   ```bash
   npm install -g vercel
   vercel --prod
   ```
   Vercel auto-detects the Vite project and configures everything.

### GitHub Pages

1. Push the project to a GitHub repository
2. Run:
   ```bash
   npx gh-pages -d dist
   ```
3. In your repository: **Settings → Pages → Branch: gh-pages**

### Any Static Host (Apache, Nginx, S3, etc.)

Upload the contents of `dist/` to your web server root. No server-side configuration needed — the app is 100% client-side.

---

## Environment Variables

The app uses Vite environment variables. For self-hosting, the analytics variables are optional and can be left empty. Create a `.env` file in the project root if needed:

```env
# Optional – Umami analytics (leave empty to disable)
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=
```

---

## Data Persistence

All lineup data (player positions, team assignments, formations) is saved to **localStorage** in the browser. No backend or database is required. Data persists across page reloads on the same device and browser.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `pnpm: command not found` | Run `npm install -g pnpm` |
| Port 3000 already in use | Run `pnpm dev --port 3001` |
| White screen after build | Check that `base` in `vite.config.ts` matches your hosting path |
| Images not loading | The background image and logos are served from a CDN — ensure internet access |
