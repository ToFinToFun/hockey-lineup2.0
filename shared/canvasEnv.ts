/**
 * Var bilder ritas: webbläsaren (DOM-canvas) eller servern (@napi-rs/canvas).
 * Hockeykort och nyhetsbilden ritas med samma kod på båda ställena; servern
 * byter miljö med setCanvasEnv innan den ritar.
 */
export interface CanvasEnv {
  createCanvas(w: number, h: number): HTMLCanvasElement;
  loadImage(src: string): Promise<HTMLImageElement>;
}

export const browserCanvasEnv: CanvasEnv = {
  createCanvas(w, h) {
    // OBS: måste vara DOM-canvas här (inte canvasEnv().createCanvas – då anropar den sig själv)
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  },
  loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(`Kunde inte ladda ${src}`));
      img.src = src;
    });
  },
};

let env: CanvasEnv = browserCanvasEnv;

export const canvasEnv = (): CanvasEnv => env;

export function setCanvasEnv(e: CanvasEnv) {
  env = e;
}
