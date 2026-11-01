/**
 * Bild från telefonen → JPEG (base64) i lagom storlek: rätt vänd, högst
 * maxSide px och under maxChars tecken. Omkodningen tar också bort metadata
 * (t.ex. var bilden togs).
 */
export async function resizeToJpeg(f: File | Blob, maxSide = 1080, maxChars = 650_000): Promise<{ base64: string; width: number; height: number }> {
  const bmp = await createImageBitmap(f, { imageOrientation: "from-image" }).catch(async () => {
    const url = URL.createObjectURL(f);
    try {
      return await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bilden kunde inte läsas")); i.src = url; });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  });
  const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.86, url = c.toDataURL("image/jpeg", q);
  while (url.length > maxChars && q > 0.45) { q -= 0.08; url = c.toDataURL("image/jpeg", q); }
  return { base64: url.split(",")[1] ?? "", width: c.width, height: c.height };
}
