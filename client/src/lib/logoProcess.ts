/**
 * Gör en uppladdad bild till en sponsorlogga: tar (valfritt) bort vit bakgrund,
 * gör (valfritt) loggan helt vit, beskär tomma kanter och skalar ner till en
 * fast maxstorlek. Resultatet är en PNG som data-URL.
 */

export const LOGO_MAX_W = 600;
export const LOGO_MAX_H = 240;

export interface LogoOptions {
  /** Gör nästan vita pixlar genomskinliga (för loggor på vit bakgrund, t.ex. JPG). */
  removeWhite: boolean;
  /** Färga alla synliga pixlar vita (för mörka loggor på mörk bakgrund). */
  makeWhite: boolean;
}

/** Ljusare än så här räknas som bakgrund. Mjuk övergång ner till WHITE_SOFT. */
const WHITE_HARD = 245;
const WHITE_SOFT = 215;

/** Ändrar pixlarna på plats. Exporteras för test. */
export function processPixels(data: Uint8ClampedArray, opts: LogoOptions) {
  for (let i = 0; i < data.length; i += 4) {
    if (opts.removeWhite) {
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      if (min >= WHITE_HARD) data[i + 3] = 0;
      else if (min > WHITE_SOFT) data[i + 3] = Math.round(data[i + 3] * ((WHITE_HARD - min) / (WHITE_HARD - WHITE_SOFT)));
    }
    if (opts.makeWhite) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
}

/** Minsta ruta som innehåller synliga pixlar, eller null om bilden är tom. Exporteras för test. */
export function visibleBounds(data: Uint8ClampedArray, width: number, height: number, alphaMin = 16) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= alphaMin) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Bilden kunde inte läsas. Använd PNG, JPG, WebP eller SVG."));
      img.src = url;
    });
  } finally {
    // Bilden är redan avkodad när onload körts
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function processLogo(file: File, opts: LogoOptions): Promise<string> {
  const img = await fileToImage(file);
  const srcW = img.naturalWidth || img.width || 1200;
  const srcH = img.naturalHeight || img.height || 480;

  // Arbeta i högst 1600 px för att hålla nere minnet på mobil
  const work = Math.min(1, 1600 / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * work));
  const h = Math.max(1, Math.round(srcH * work));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Webbläsaren kan inte bearbeta bilder");
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  processPixels(imageData.data, opts);
  const box = visibleBounds(imageData.data, w, h);
  if (!box) throw new Error("Bilden blev tom. Prova utan \"Ta bort vit bakgrund\".");
  ctx.putImageData(imageData, 0, 0);

  const scale = Math.min(1, LOGO_MAX_W / box.w, LOGO_MAX_H / box.h);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(box.w * scale));
  out.height = Math.max(1, Math.round(box.h * scale));
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Webbläsaren kan inte bearbeta bilder");
  octx.imageSmoothingQuality = "high";
  octx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
