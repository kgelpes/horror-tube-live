export const $ = (sel: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
};

export const ROUND_S = 120;

export const LOW = matchMedia("(prefers-reduced-motion: reduce)").matches;

export type G = CanvasRenderingContext2D;

export const lines = (g: G, text: string, maxW: number): string[] => {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? line + " " + word : word;
    if (g.measureText(test).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
};

export const wrap = (
  g: G,
  text: string,
  x: number,
  y0: number,
  maxW: number,
  lh: number,
): number => {
  const ls = lines(g, text, maxW);
  ls.forEach((l, i) => g.fillText(l, x, y0 + i * lh));
  return y0 + Math.max(ls.length, 1) * lh;
};
