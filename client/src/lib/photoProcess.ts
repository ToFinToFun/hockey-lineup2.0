/**
 * Gör en uppladdad bild till en liten profilbild: kvadrat beskuren från mitten
 * (lite ovanför mitten för porträtt), 320×320 px, JPEG. Blir oftast 15–40 kB.
 */
export const PHOTO_SIZE = 320;

/** Kvadratisk beskärning: mitten i bredd, ovanför mitten i höjd (ansikten sitter ofta högt). Exporteras för test. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  const sx = Math.round((w - side) / 2);
  const sy = h > w ? Math.round((h - side) * 0.3) : Math.round((h - side) / 2);
  return { sx, sy, side };
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
  const { sx, sy, side } = squareCrop(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Webbläsaren kan inte bearbeta bilder");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#1b1f1d";
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  if ("close" in img && typeof img.close === "function") img.close();
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
}
