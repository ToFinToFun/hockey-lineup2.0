// Kopierar MediaPipes friläggningsmodell (Apache-2.0) från node_modules till
// client/public/mediapipe så att den serveras från vår egen server – ingen extern tjänst.
// Körs före vite build/dev. Filerna laddas bara när någon trycker "Frilägg".
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const src = path.dirname(require.resolve("@mediapipe/selfie_segmentation/package.json"));
const dest = path.resolve("client/public/mediapipe");
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) {
  if (/\.(js|wasm|tflite|binarypb|data)$/.test(f)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
console.log(`[mediapipe] kopierade till ${dest}`);
