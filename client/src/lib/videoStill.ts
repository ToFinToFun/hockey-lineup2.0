/**
 * Bild före klippet: Media ritar bilden i båda formaten (4:5 och 9:16) och
 * lämnar över den till Video, som använder den som passar videons format.
 * Hålls i minnet (bara mellan sidorna i samma flik).
 */
export interface VideoStill {
  title: string;
  /** PNG som data-URL: 4:5 (1080×1350) och 9:16 (1080×1920) */
  feed: string;
  reel: string;
}

let pending: VideoStill | null = null;

export function setVideoStill(s: VideoStill | null) {
  pending = s;
}

export function peekVideoStill(): VideoStill | null {
  return pending;
}

/** Nästa besök i Video börjar utan bild */
export function clearVideoStill() {
  pending = null;
}

/**
 * Valfri bild (uppladdad i Video) i båda formaten: hela bilden syns, kanterna
 * fylls med en suddig, mörkad kopia – samma som klippet får i videon.
 */
export function stillFromImage(img: CanvasImageSource & { width: number; height: number }, title = "Bild"): VideoStill {
  const draw = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, w, h);
    const s1 = Math.max(w / img.width, h / img.height);
    ctx.filter = "blur(30px) brightness(0.8)";
    ctx.drawImage(img, (w - img.width * s1) / 2, (h - img.height * s1) / 2, img.width * s1, img.height * s1);
    ctx.filter = "none";
    const s2 = Math.min(w / img.width, h / img.height);
    ctx.drawImage(img, (w - img.width * s2) / 2, (h - img.height * s2) / 2, img.width * s2, img.height * s2);
    return c.toDataURL("image/png");
  };
  return { title, feed: draw(1080, 1350), reel: draw(1080, 1920) };
}
