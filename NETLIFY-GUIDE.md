# How to Deploy to Netlify

This guide gets your app live in about 10 minutes. No experience needed.

---

## What you need

- A computer (Windows, Mac, or Linux)
- Node.js installed — download the **LTS version** from [nodejs.org](https://nodejs.org)
- A free Netlify account — sign up at [netlify.com](https://netlify.com) (you can use your GitHub or Google account)

---

## Step 1 — Download the project

In Manus, open the **Management UI** (right panel) → **Code** tab → click **"Download all files"**. You will get a ZIP file. Unzip it to a folder on your computer, for example `C:\hockey-lineup` or `~/hockey-lineup`.

---

## Step 2 — Build the app

The build process converts the source code into a simple folder of files that any web server can host.

**On Windows:**
1. Open the unzipped folder
2. Double-click **`build.bat`**
3. A terminal window opens and runs automatically — wait until you see **BUILD COMPLETE**

**On Mac or Linux:**
1. Open Terminal
2. Navigate to the folder: `cd ~/hockey-lineup`
3. Run: `chmod +x build.sh && ./build.sh`
4. Wait until you see **BUILD COMPLETE**

When the build finishes, a new folder called **`dist`** appears inside the project folder. That folder contains your entire app.

---

## Step 3 — Deploy to Netlify (drag and drop — no CLI needed)

1. Go to [app.netlify.com](https://app.netlify.com) and log in
2. On your dashboard, scroll down to the section that says **"Want to deploy a new site without connecting to Git?"**
3. You will see a large drop zone that says **"Drag and drop your site output folder here"**
4. Drag the **`dist`** folder from your computer directly onto that drop zone
5. Netlify uploads and deploys your app in about 30 seconds
6. You get a live URL like `https://random-name-123.netlify.app` — your app is online!

> **Tip:** To change the URL to something nicer, go to **Site settings → Domain management → Options → Edit site name** and type a custom name, for example `stalstadens-lineup`.

---

## Step 4 — Update the app later

Whenever you make changes and want to update the live site:

1. Run `build.bat` (Windows) or `./build.sh` (Mac/Linux) again
2. Go to your site on [app.netlify.com](https://app.netlify.com)
3. Go to **Deploys** tab → drag the new `dist` folder onto the deploy drop zone

---

## Alternative: Connect to GitHub for automatic deploys

If you export the project to GitHub (Manus → Settings → GitHub), you can connect the repository to Netlify and it will automatically rebuild and deploy every time you push a change. The `netlify.toml` file included in the project configures this automatically — Netlify will detect it and use the correct build settings.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `node` or `pnpm` not found | Install Node.js from [nodejs.org](https://nodejs.org) and restart your terminal |
| Build fails with errors | Make sure you are inside the project folder before running the script |
| App loads but shows blank page | Make sure you dragged the `dist` **folder**, not the files inside it |
| Images not loading | The app loads images from a CDN — make sure you have internet access |
