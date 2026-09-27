/**
 * Gör en uppladdad bild till en liten stående profilbild (3:4, som ett porträtt):
 * beskuren från mitten i bredd och lite ovanför mitten i höjd, 240×320 px, JPEG.
 * Blir oftast 15–35 kB.
 */
export const PHOTO_W = 240;
export const PHOTO_H = 320;

/** Stående 3:4-beskärning. Ansikten sitter ofta högt, så höjdöverskottet tas mest nedifrån. Exporteras för test. */
export function portraitCrop(w: number, h: number): { sx: number; sy: number; sw: number; sh: number } {
  const ratio = PHOTO_W / PHOTO_H; // 0.75
  if (w / h > ratio) {
    const sw = Math.round(h * ratio);
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h };
  }
  const sh = Math.round(w / ratio);
  return { sx: 0, sy: Math.round((h - sh) * 0.3), sw: w, sh };
}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  // createImageBitmap följer mobilbildernas EXIF-rotation
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* faller tillbaka på <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Bilden kunde inte läsas. Använd JPG, PNG eller WebP."));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Returnerar JPEG som base64 (utan data:-prefix). */
export async function processPlayerPhoto(file: File): Promise<string> {
  const img = await decode(file);
  const { sx, sy, sw, sh } = portraitCrop(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_W;
  canvas.height = PHOTO_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Webbläsaren kan inte bearbeta bilder");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#1b1f1d";
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
  if ("close" in img && typeof img.close === "function") img.close();
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
}
