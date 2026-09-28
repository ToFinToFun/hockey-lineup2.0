/**
 * Webbläsardelen av hockeykorten: läsa in ett foto från fil. Själva ritningen
 * ligger i shared/cardRender.ts (används även av servern).
 */
import { autoLevels, type CardSettings } from "@shared/cardRender";

/** Laddar ett foto från fil, förminskar till max 1200 px och ger JPEG (base64) + autonivåer. */
export async function prepareSourcePhoto(file: File): Promise<{ base64: string; auto: CardSettings["auto"] }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(async () => {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("Bilden kunde inte läsas"));
        i.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  });
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  const auto = autoLevels(ctx.getImageData(0, 0, c.width, c.height).data);
  let q = 0.86;
  let dataUrl = c.toDataURL("image/jpeg", q);
  while (dataUrl.length > 1_400_000 && q > 0.5) {
    q -= 0.08;
    dataUrl = c.toDataURL("image/jpeg", q);
  }
  return { base64: dataUrl.split(",")[1] ?? "", auto };
}
