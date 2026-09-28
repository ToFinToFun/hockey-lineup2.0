/**
 * Frilägg spelaren i ett foto (ta bort bakgrunden) direkt i webbläsaren.
 *
 * Använder MediaPipe Selfie Segmentation (Apache-2.0) som ligger på vår egen
 * server under /mediapipe (kopieras vid bygget). Modellen (~6 MB) laddas först
 * när någon trycker "Frilägg" och återanvänds sedan. Den är gjord för porträtt
 * och överkropp – helkroppsbilder kan bli sämre, därför går effekten att dämpa.
 *
 * Resultatet är en gråskalemask (ljust = spelaren) som sparas med kortet.
 */

type SegResults = { segmentationMask: CanvasImageSource };
interface Segmenter {
  setOptions(o: Record<string, unknown>): void;
  onResults(cb: (r: SegResults) => void): void;
  initialize(): Promise<void>;
  send(input: { image: CanvasImageSource }): Promise<void>;
}

let segmenter: Promise<Segmenter> | null = null;
let resultCb: ((r: SegResults) => void) | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Friläggningen kunde inte laddas"));
    document.head.appendChild(s);
  });
}

async function getSegmenter(): Promise<Segmenter> {
  segmenter ??= (async () => {
    await loadScript("/mediapipe/selfie_segmentation.js");
    const Ctor = (window as unknown as { SelfieSegmentation?: new (o: { locateFile: (f: string) => string }) => Segmenter }).SelfieSegmentation;
    if (!Ctor) throw new Error("Friläggningen kunde inte starta");
    const seg = new Ctor({ locateFile: (f) => `/mediapipe/${f}` });
    seg.setOptions({ modelSelection: 0, selfieMode: false });
    seg.onResults((r) => resultCb?.(r));
    await seg.initialize();
    return seg;
  })().catch((e) => {
    segmenter = null;
    throw e;
  });
  return segmenter;
}

/** Mjukare men tydligare kant: dra isär osäkra värden runt mitten. Exporteras för test. */
export function sharpenMask(v: number): number {
  const t = Math.min(1, Math.max(0, (v / 255 - 0.3) / 0.4));
  return Math.round(t * t * (3 - 2 * t) * 255);
}

/** Räkna fram masken för ett foto. Returnerar PNG (base64) och en bild att rita med. */
export async function computeMask(photo: HTMLImageElement): Promise<{ base64: string; image: HTMLImageElement }> {
  const seg = await getSegmenter();
  const result = await new Promise<SegResults>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Friläggningen tog för lång tid")), 30_000);
    resultCb = (r) => { clearTimeout(timer); resolve(r); };
    seg.send({ image: photo }).catch((e) => { clearTimeout(timer); reject(e); });
  });
  resultCb = null;

  // Masken sparas i högst 600 px – kanterna är mjuka ändå
  const scale = Math.min(1, 600 / Math.max(photo.width, photo.height));
  const w = Math.round(photo.width * scale), h = Math.round(photo.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(result.segmentationMask, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  // Modellen ger säkerheten antingen som genomskinlighet eller som färg – använd det som varierar
  let alphaVaries = false;
  for (let i = 3; i < d.data.length; i += 4 * 97) if (d.data[i] < 250) { alphaVaries = true; break; }
  for (let i = 0; i < d.data.length; i += 4) {
    const raw = alphaVaries ? d.data[i + 3] : Math.max(d.data[i], d.data[i + 1], d.data[i + 2]);
    const v = sharpenMask(raw);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  const dataUrl = c.toDataURL("image/png");
  const image = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Masken kunde inte skapas"));
    i.src = dataUrl;
  });
  return { base64: dataUrl.split(",")[1] ?? "", image };
}
