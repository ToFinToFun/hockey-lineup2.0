#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requiredAssets = [
  "client/public/favicon.ico",
  "client/public/favicon-32.png",
  "client/public/apple-touch-icon.png",
  "client/public/pwa-icon-192.png",
  "client/public/pwa-icon-512.png",
  "client/public/pwa-icon-maskable-192.png",
  "client/public/pwa-icon-maskable-512.png",
  "client/public/images/background.jpg",
  "client/public/images/logo-white.png",
  "client/public/images/logo-green.png",
];

async function collectSourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collectSourceFiles(relativePath));
    else if (/\.(?:html|css|ts|tsx)$/.test(entry.name)) files.push(relativePath);
  }
  return files;
}

const sourceFiles = ["client/index.html", ...await collectSourceFiles("client/src")];

const forbiddenAssetHosts = ["d2xsxph8kpxj0f.cloudfront.net", "files.manuscdn.com"];
let failed = false;

for (const asset of requiredAssets) {
  try {
    await access(resolve(root, asset), constants.R_OK);
    console.log(`OK       ${asset}`);
  } catch {
    failed = true;
    console.error(`MISSING  ${asset}`);
  }
}

for (const file of sourceFiles) {
  const contents = await readFile(resolve(root, file), "utf8");
  for (const host of forbiddenAssetHosts) {
    if (contents.includes(host)) {
      failed = true;
      console.error(`EXTERNAL ${file} references ${host}`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("\nAll required application-owned assets are present and locally hosted.");
}
