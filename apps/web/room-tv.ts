import * as THREE from "three";
import { blotch, burn, crack, css, ctx2d, drip, scratches, screw, seeded } from "./sprites.ts";
import { BARS, COL, RAMP } from "./room-palette.ts";
import { drawLogo } from "./logo.ts";
import {
  TEAK,
  TV_Y,
  basic,
  box,
  cyl,
  label,
  lambert,
  r,
  rough,
  tex,
  speckle,
} from "./room-materials.ts";
import { renderer, scene, textTex } from "./room-render.ts";
import { LOW } from "./room-state.ts";
import { collapse, drawPower, powerStage } from "./room-power.ts";
import { CHANNELS, ON_AIR } from "./broadcast.ts";

export const TW = 640,
  TH = 480;
export const tvCanvas = document.createElement("canvas");
tvCanvas.width = TW;
tvCanvas.height = TH;
export const tvCtx = ctx2d(tvCanvas, { willReadFrequently: true });
export const tvTex = textTex(new THREE.CanvasTexture(tvCanvas));
tvTex.magFilter = THREE.LinearFilter;
tvTex.minFilter = THREE.LinearFilter;
tvTex.generateMipmaps = false;
tvTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
tvTex.colorSpace = THREE.SRGBColorSpace;
tvTex.repeat.set(0.78 / 0.74, 0.585 / 0.545);
tvTex.offset.set((1 - tvTex.repeat.x) / 2, (1 - tvTex.repeat.y) / 2);
export const tv = new THREE.Group();
tv.position.set(0, TV_Y, -1.4);
scene.add(tv);
export const teak = rough(
  tex(128, 64, (g, w, h) => {
    TEAK(g, w, h);
    const tr = seeded(17);
    g.strokeStyle = COL.grime;
    for (const [x, y, rad] of [
      [30, 22, 11],
      [37, 26, 10],
      [96, 40, 8],
    ]) {
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    scratches(g, tr, [0, 0, w, h], 30, COL.char, 0.6);
    scratches(g, tr, [0, 0, w, h], 12, COL.rust, 0.4);
  }),
);
export const body = box(1.02, 0.8, 0.63, teak);
body.position.z = -0.045;
tv.add(body);
export const ivory = lambert({
  map: tex(
    128,
    128,
    (g, w, h) => {
      g.fillStyle = COL.bone;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.45;
      g.fillStyle = COL.sulfur;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.1;
      g.fillStyle = COL.rust;
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.arc(r() * w, r() * h, 4 + r() * 14, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      speckle(g, w, h, [COL.grime], 40);
    },
    [2, 2],
  ),
  color: new THREE.Color().setScalar(0.62),
});
export const rounded = (
  p: THREE.Path | CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
): void => {
  p.moveTo(x + c, y);
  p.lineTo(x + w - c, y);
  p.quadraticCurveTo(x + w, y, x + w, y + c);
  p.lineTo(x + w, y + h - c);
  p.quadraticCurveTo(x + w, y + h, x + w - c, y + h);
  p.lineTo(x + c, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - c);
  p.lineTo(x, y + c);
  p.quadraticCurveTo(x, y, x + c, y);
};
export const maskOutline = new THREE["Shape"]();
rounded(maskOutline, -0.505, -0.395, 1.01, 0.79, 0.02);
export const hole = new THREE.Path();
rounded(hole, -0.47, -0.315, 0.82, 0.63, 0.08);
maskOutline.holes.push(hole);
export const mask = new THREE.Mesh(
  new THREE.ExtrudeGeometry(maskOutline, {
    depth: 0.092,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 6,
  }),
  [ivory, ivory],
);
export const MASK = { x: -0.505, y: -0.395, w: 1.01, h: 0.79, px: 600 };
export const maskTex = tex(
  Math.round(MASK.w * MASK.px),
  Math.round(MASK.h * MASK.px),
  (g, w, h) => {
    const wr = seeded(13),
      at = (x: number, y: number): [number, number] => [
        (x - MASK.x) * MASK.px,
        (MASK.y + MASK.h - y) * MASK.px,
      ];
    g.fillStyle = COL.bone;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.5;
    g.fillStyle = COL.sulfur;
    g.fillRect(0, 0, w, h);
    g.fillStyle = COL.rust;
    for (let y = 0; y < h; y++) {
      g.globalAlpha = 0.28 * (1 - y / h) ** 2;
      g.fillRect(0, y, w, 1);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 10; i++) blotch(g, wr, wr() * w, wr() * h, 30 + wr() * 70, COL.rust, 0.07);
    const [hx, hy] = at(-0.47, 0.315);
    const hw = 0.82 * MASK.px,
      hh = 0.63 * MASK.px;
    for (const [lw, a, c] of [
      [22, 0.12, COL.grime],
      [12, 0.22, COL.grime],
      [5, 0.45, COL.soot],
    ] as const) {
      g.globalAlpha = a;
      g.strokeStyle = c;
      g.lineWidth = lw;
      g.beginPath();
      rounded(g, hx, hy, hw, hh, 0.08 * MASK.px);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 4; i++)
      drip(g, wr, 30 + wr() * (w - 60), 0, 40 + wr() * 90, 4, COL.rustDeep, 0.35);
    for (const [x, y] of [
      [16, 16],
      [w - 16, 16],
      [16, h - 16],
      [w - 16, h - 16],
    ])
      screw(g, wr, x, y, 7, COL.grime, COL.rustDeep);
    crack(g, wr, hx + 6, hy + hh - 10, 90, 2.4, COL.soot);
    crack(g, wr, hx + hw - 8, hy + 10, 60, -0.7, COL.soot);
    scratches(g, wr, [0, 0, w, h], 90, COL.grime, 0.35);
    scratches(g, wr, [hx, hy + hh + 6, hw, h - hy - hh - 12], 40, COL.soot, 0.4);
    burn(g, hx + hw * 0.72, hy + hh + 34, 7, COL.soot, COL.rustDeep);
    burn(g, hx + hw * 0.8, hy + hh + 46, 5, COL.soot, COL.rustDeep);
    g.globalAlpha = 0.3;
    g.fillStyle = COL.bloodDeep;
    for (let f = 0; f < 4; f++) {
      const fx = w - 34 + f * 7;
      for (let y = 0; y < 150 + f * 20; y++)
        g.fillRect(fx + Math.sin(y * 0.05 + f) * 2, 190 + y, 4 - y / 90, 1);
    }
    g.globalAlpha = 1;
    const [gx, gy] = at(0.37, 0.35);
    const gw = 0.12 * MASK.px,
      gh = 0.7 * MASK.px,
      grilleH = 0.36 * MASK.px;
    g.fillStyle = COL.soot;
    g.beginPath();
    rounded(g, gx, gy, gw, gh, 8);
    g.fill();
    g.fillStyle = COL.grime;
    for (let y = gy + 8; y < gy + grilleH; y += 8)
      for (let x = gx + 7 + ((y / 8) % 2) * 4; x < gx + gw - 6; x += 8) g.fillRect(x, y, 3, 3);
    for (let x = gx + 6; x < gx + gw - 4; x += 6)
      g.fillRect(x, gy + grilleH + 10, 2, gh - grilleH - 18);
    g.save();
    g.translate(hx + 90, hy + hh + 26);
    g.scale(0.8, 0.8);
    g.rotate(-0.06);
    g.fillStyle = COL.bone;
    g.fillRect(-80, -15, 160, 30);
    g.globalAlpha = 0.45;
    g.fillStyle = COL.sulfur;
    g.fillRect(-80, -15, 160, 30);
    g.globalAlpha = 1;
    g.restore();
  },
);
maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
maskTex.repeat.set(1 / MASK.w, 1 / MASK.h);
maskTex.offset.set(-MASK.x / MASK.w, -MASK.y / MASK.h);
mask.material = [
  lambert({
    map: maskTex,
    bumpMap: maskTex,
    bumpScale: 0.35,
    color: new THREE.Color().setScalar(0.62),
  }),
  lambert({ color: new THREE.Color(COL.bone).multiplyScalar(0.28) }),
];
mask.position.z = 0.278;
tv.add(mask);
export const loop = (x: number, y: number, w: number, h: number, c: number): THREE.Vector2[] => {
  const sh = new THREE["Shape"]();
  rounded(sh, x, y, w, h, c);
  return sh.getSpacedPoints(64);
};
export const mouth = loop(-0.47, -0.315, 0.82, 0.63, 0.08),
  throat = loop(-0.43, -0.2725, 0.74, 0.545, 0.06);
export const funnelPos: number[] = [];
for (let i = 0; i < mouth.length - 1; i++) {
  const [a, b, c, d] = [mouth[i], mouth[i + 1], throat[i + 1], throat[i]];
  if (!a || !b || !c || !d) continue;
  funnelPos.push(
    a.x,
    a.y,
    0.378,
    b.x,
    b.y,
    0.378,
    c.x,
    c.y,
    0.28,
    a.x,
    a.y,
    0.378,
    c.x,
    c.y,
    0.28,
    d.x,
    d.y,
    0.28,
  );
}
export const funnelGeo = new THREE.BufferGeometry();
funnelGeo.setAttribute("position", new THREE.Float32BufferAttribute(funnelPos, 3));
funnelGeo.computeVertexNormals();
tv.add(
  new THREE.Mesh(
    funnelGeo,
    lambert({
      color: new THREE.Color(COL.bone).multiplyScalar(0.45),
      side: THREE.DoubleSide,
    }),
  ),
);
export const badge = new THREE.Mesh(
  new THREE.PlaneGeometry(0.17, 0.026),
  lambert({ map: label("HORROR TUBE", COL.rustDeep, COL.bone, 340, 52, 30) }),
);
badge.position.set(-0.06, -0.337, 0.3785);
tv.add(badge);
export const knobM = lambert({ color: COL.soot });
export const knobMetal = lambert({ color: new THREE.Color(COL.bone).multiplyScalar(0.7) });
const knob = (x: number, y: number, rad: number, depth: number): void => {
  const k = cyl(rad, rad * 1.08, depth, knobMetal, 14);
  k.rotation.x = Math.PI / 2;
  k.position.set(x, y, 0.378 + depth / 2);
  const capM = cyl(rad * 0.45, rad * 0.45, 0.004, knobM, 10);
  capM.rotation.x = Math.PI / 2;
  capM.position.set(x, y, 0.378 + depth + 0.002);
  tv.add(k, capM);
};
for (const y of [-0.05, -0.13, -0.21]) knob(0.43, y, 0.02, 0.026);
knob(0.43, -0.3, 0.038, 0.036);
export const ears = new THREE.Group();
ears.position.set(0.12, 0.4, -0.08);
export const earBase = cyl(0.045, 0.06, 0.035, knobM, 12);
earBase.position.y = 0.0175;
ears.add(earBase);
for (const side of [-1, 1]) {
  const rod = cyl(0.0035, 0.0035, 0.52, ivory, 5);
  rod.geometry.translate(0, 0.26, 0);
  rod.position.y = 0.03;
  rod.rotation.set(-0.2, 0, side < 0 ? -0.45 : 1.05);
  ears.add(rod);
  if (side < 0) {
    const foil = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.02, 0),
      lambert({ color: new THREE.Color(COL.bone).multiplyScalar(0.5) }),
    );
    foil.position.y = 0.52;
    foil.rotation.set(0.4, 0.9, 0.2);
    rod.add(foil);
  }
}
tv.add(ears);
export const crt = new THREE.PlaneGeometry(0.78, 0.585, 32, 24);
export const cp = crt.getAttribute("position"),
  cuv = crt.getAttribute("uv");
export const BULGE = 0.025,
  BARREL = 0.06;
for (let i = 0; i < cp.count; i++) {
  const x = cp.getX(i) / 0.39,
    y = cp.getY(i) / 0.2925,
    u = cuv.getX(i) - 0.5,
    v = cuv.getY(i) - 0.5;
  cp.setZ(i, BULGE * (1 - x * x) * (1 - y * y));
  cuv.setXY(i, 0.5 + u * (1 + BARREL * 4 * v * v), 0.5 + v * (1 + BARREL * 4 * u * u));
}
crt.computeVertexNormals();
export const screen = new THREE.Mesh(crt, basic({ map: tvTex, fog: false }));
screen.position.set(-0.06, 0, 0.28);
tv.add(screen);
export const glass = new THREE.Mesh(
  crt,
  basic({
    map: tex(64, 48, (g, w, h) => {
      const hl = g.createRadialGradient(14, 10, 0, 14, 10, 40);
      hl.addColorStop(0, COL.bone);
      hl.addColorStop(1, COL.soot);
      g.globalAlpha = 0.12;
      g.fillStyle = hl;
      g.fillRect(0, 0, w, h);
    }),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
glass.position.set(-0.06, 0, 0.282);
tv.add(glass);
export const smudge = new THREE.Mesh(
  crt,
  basic({
    map: tex(390, 292, (g, w, h) => {
      const sr = seeded(29);
      g.clearRect(0, 0, w, h);
      const print = (x: number, y: number, a: number): void => {
        g.strokeStyle = COL.grime;
        g.lineWidth = 1;
        g.globalAlpha = 0.16;
        for (let k = 2; k < 13; k += 2) {
          g.beginPath();
          g.ellipse(x, y, k * 0.8, k, a, 0, Math.PI * 2);
          g.stroke();
        }
      };
      print(w * 0.82, h * 0.86, 0.3);
      print(w * 0.88, h * 0.8, 0.5);
      print(w * 0.12, h * 0.9, -0.2);
      g.globalAlpha = 0.07;
      g.fillStyle = COL.grime;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.ellipse(
          sr() * w,
          h * (0.6 + sr() * 0.4),
          30 + sr() * 50,
          8 + sr() * 10,
          sr() - 0.5,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
      g.globalAlpha = 0.18;
      g.fillStyle = COL.bone;
      for (let i = 0; i < 140; i++) g.fillRect(sr() * w, sr() * h, 1, 1);
      g.globalAlpha = 0.5;
      crack(g, sr, w - 4, h - 30, 80, 3.6, COL.bone);
      g.globalAlpha = 1;
    }),
    transparent: true,
    depthWrite: false,
  }),
);
smudge.position.set(-0.06, 0, 0.283);
tv.add(smudge);
for (const m of [glass.material.map, smudge.material.map]) if (m) textTex(m);
export const tvGlow = new THREE.PointLight(COL.body, 1.2, 0, 2);
tvGlow.position.set(0, TV_Y - 0.02, -0.8);
scene.add(tvGlow);

export const video = document.createElement("video");
video.playsInline = true;
video.autoplay = true;
video.muted = true;
const STALE_MS = 2500;
let lastFrameAt = 0;
let lastTime = -1;
const onFrame = (): void => {
  lastFrameAt = performance.now();
  video.requestVideoFrameCallback(onFrame);
};
if ("requestVideoFrameCallback" in HTMLVideoElement.prototype)
  video.requestVideoFrameCallback(onFrame);
const hasPicture = (now: number): boolean => {
  if (video.readyState >= 2 && video.currentTime !== lastTime) {
    lastTime = video.currentTime;
    lastFrameAt = now;
  }
  return ON_AIR.link === "live" && video.videoWidth > 0 && now - lastFrameAt < STALE_MS;
};
export const small = document.createElement("canvas");
small.width = 320;
small.height = 240;
export const sg = ctx2d(small, { willReadFrequently: true });

export function crop(
  sw0: number,
  sh0: number,
  dw: number,
  dh: number,
): [number, number, number, number] {
  let sw = sw0,
    sh = sw0 / (dw / dh);
  if (sh > sh0) {
    sh = sh0;
    sw = sh0 * (dw / dh);
  }
  return [(sw0 - sw) / 2, (sh0 - sh) / 2, sw, sh];
}
export function videoFrame(dx = 0, dy = 0, dw = TW, dh = TH): void {
  const w = 320,
    h = Math.round((320 * dh) / dw);
  if (small.height !== h) small.height = h;
  const sw0 = video.videoWidth;
  const sh0 = video.videoHeight;
  if (sw0 === 0 || sh0 === 0) return;
  sg.drawImage(video, ...crop(sw0, sh0, dw, dh), 0, 0, w, h);
  const img = sg.getImageData(0, 0, w, h),
    d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r0 = d[i] ?? 0,
      g0 = d[i + 1] ?? 0,
      b0 = d[i + 2] ?? 0,
      l = Math.min(1, Math.max(0, ((0.3 * r0 + 0.59 * g0 + 0.11 * b0) / 255 - 0.08) * 1.35)),
      p = l * 3,
      k = Math.min(2, p | 0),
      f = p - k,
      red = r0 > 110 && r0 > g0 * 1.8,
      lo = RAMP[k] ?? [],
      hi = RAMP[k + 1] ?? [];
    for (let c = 0; c < 3; c++) {
      const a = lo[c] ?? 0,
        warm = a + ((hi[c] ?? 0) - a) * f,
        v = d[i + c] ?? 0;
      d[i + c] = red ? warm * 0.4 + v * 0.6 : warm * 0.6 + v * 0.4;
    }
  }
  sg.putImageData(img, 0, 0);
  const g = tvCtx,
    sy = dh / h;
  g.imageSmoothingEnabled = false;
  if (Math.random() < 0.05) {
    const y = (Math.random() * (h - 10)) | 0;
    g.drawImage(small, 0, 0, w, y, dx, dy, dw, y * sy);
    g.drawImage(small, 0, y, w, 10, dx + 24, dy + y * sy, dw, 10 * sy);
    g.drawImage(small, 0, y + 10, w, h - y - 10, dx, dy + (y + 10) * sy, dw, (h - y - 10) * sy);
  } else g.drawImage(small, 0, 0, w, h, dx, dy, dw, dh);
}
export let tvNoise = 0;
const ALIVE = css("--alive");
const SNOW = Float32Array.from({ length: 1 << 18 }, () => (Math.random() - 0.5) * 255);
const pad = (n: number): string => String(n).padStart(2, "0");
const clock = (p: number): string => {
  const m = Math.floor(Math.min(1, Math.max(0, p)) * 60);
  return `${2 + Math.floor(m / 60)}:${pad(m % 60)} AM`;
};
const blink = (now: number, ms: number): boolean => ((now / ms) | 0) % 2 === 0;
function line(
  g: CanvasRenderingContext2D,
  t: string,
  y: number,
  size: number,
  color = COL.bone,
  face = "Silkscreen",
  weight = 700,
): void {
  g.font = `${weight} ${size}px ${face}`;
  const width = g.measureText(t).width,
    max = TW - 64;
  if (width > max) g.font = `${weight} ${Math.floor((size * max) / width)}px ${face}`;
  g.textAlign = "center";
  g.fillStyle = color;
  g.fillText(t, TW / 2, y);
}
function figure(g: CanvasRenderingContext2D, d: number, alpha: number): void {
  if (d < 0.05 || alpha <= 0) return;
  const s = Math.min(1, Math.max(0, (d - 1) / 3)),
    h = TH * (0.15 + 0.85 * s),
    x = TW * (0.72 - 0.22 * s) + (d > 2.5 ? (Math.random() - 0.5) * h * 0.012 : 0),
    foot = TH * (0.66 + 0.38 * s),
    y0 = foot - h,
    hr = h * (0.06 + 0.03 * s),
    hy = y0 + hr * 1.35,
    sy = hy + hr * 1.6,
    sw = h * 0.13,
    bw = h * 0.19,
    hand = y0 + h * 0.78;
  g.globalAlpha = alpha * Math.min(1, d);
  g.fillStyle = COL.soot;
  g.beginPath();
  for (const side of [-1, 1]) {
    g.moveTo(x + side * sw, sy);
    g.lineTo(x + side * (sw + h * 0.035), sy + h * 0.03);
    g.lineTo(x + side * (sw + h * 0.075), hand);
    g.lineTo(x + side * (sw + h * 0.04), hand);
    g.closePath();
  }
  g.moveTo(x - sw, sy);
  g.quadraticCurveTo(x, sy - hr * 0.6, x + sw, sy);
  g.lineTo(x + bw, foot);
  g.lineTo(x - bw, foot);
  g.closePath();
  g.fill();
  const skin = g.createRadialGradient(x - hr * 0.3, hy - hr * 0.4, hr * 0.1, x, hy, hr * 1.4);
  skin.addColorStop(0, COL.bone);
  skin.addColorStop(1, COL.grime);
  g.fillStyle = skin;
  g.strokeStyle = COL.soot;
  g.lineWidth = Math.max(1.5, hr * 0.08);
  g.beginPath();
  g.ellipse(x, hy, hr, hr * 1.35, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.globalAlpha = 1;
}
function standBy(g: CanvasRenderingContext2D, d: number): void {
  const top = TH * 0.62,
    bw = TW / BARS.length,
    cx = TW / 2,
    cy = TH * 0.36,
    rad = TH * 0.3;
  BARS.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(i * bw, 0, bw + 1, top);
  });
  g.globalAlpha = 0.55;
  BARS.forEach((c, i) => {
    g.fillStyle = BARS[BARS.length - 1 - i] ?? c;
    g.fillRect(i * bw, top, bw + 1, TH * 0.04);
  });
  g.globalAlpha = 1;
  g.strokeStyle = COL.bone;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 0.6;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - rad, cy);
  g.lineTo(cx + rad, cy);
  g.moveTo(cx, cy - rad);
  g.lineTo(cx, cy + rad);
  g.stroke();
  g.globalAlpha = Math.min(0.6, 0.12 + d * 0.13);
  g.fillStyle = COL.soot;
  g.fillRect(0, 0, TW, TH);
  g.globalAlpha = 1;
  g.fillRect(0, TH * 0.66, TW, TH * 0.1);
  line(g, "PLEASE STAND BY", TH * 0.66 + 36, 30, COL.bone);
  figure(g, d, 1);
}
function endCard(g: CanvasRenderingContext2D): void {
  const bw = TW / BARS.length;
  BARS.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(i * bw, 0, bw + 1, TH);
  });
  g.fillStyle = COL.soot;
  g.fillRect(0, TH * 0.38, TW, TH * 0.24);
  if (ON_AIR.ending === "caught") {
    line(g, "OFF AIR", TH * 0.38 + 58, 48, COL.blood);
    line(g, clock(ON_AIR.progress), TH * 0.38 + 98, 26, COL.bone, "DotGothic16", 400);
  } else line(g, "GOOD NIGHT", TH * 0.38 + 72, 52, COL.bone);
}
function osd(g: CanvasRenderingContext2D, now: number, big: boolean): void {
  g.textAlign = "left";
  g.fillStyle = ALIVE;
  g.font = `700 ${big ? 44 : 26}px Silkscreen`;
  g.fillText(`CH ${pad(ON_AIR.channel)}`, 28, big ? 64 : 46);
  g.font = `400 ${big ? 24 : 18}px DotGothic16`;
  g.fillText(CHANNELS[ON_AIR.channel - 1]?.name ?? "", 28, big ? 94 : 70);
  const live = "LIVE";
  g.textAlign = "right";
  g.font = "700 22px Silkscreen";
  g.fillStyle = COL.bone;
  g.fillText(live, TW - 28, 46);
  if (blink(now, 600)) {
    g.fillStyle = COL.blood;
    g.beginPath();
    g.arc(TW - 44 - g.measureText(live).width, 38, 8, 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = "left";
  g.fillStyle = COL.bone;
  g.fillText(clock(ON_AIR.progress), 28, TH - 92);
  if (ON_AIR.phase === "signoff") {
    g.fillStyle = COL.soot;
    g.fillRect(0, TH * 0.4, TW, 56);
    line(g, "THIS CONCLUDES OUR BROADCAST DAY", TH * 0.4 + 37, 24, COL.bone);
  }
  if (ON_AIR.drift > 0 && blink(now, 450)) {
    for (const [dx, c] of [
      [4, COL.soot],
      [0, ALIVE],
    ] as const) {
      g.save();
      g.translate(dx, dx);
      line(g, `CH ${pad(ON_AIR.drift)}`, TH * 0.55, 96, c);
      g.restore();
    }
  }
}
let promptSeen = 0;
let coverFrom = -Infinity;
let chSeen = 0;
let chAt = -Infinity;
let shown = 0;
export function drawTV(): void {
  const g = tvCtx,
    W = TW,
    H = TH,
    now = performance.now(),
    phase = ON_AIR.phase,
    dark = ON_AIR.blackoutUntil - now;
  if (ON_AIR.promptAt !== promptSeen) {
    promptSeen = ON_AIR.promptAt;
    coverFrom = now;
  }
  if (ON_AIR.channel !== chSeen) {
    chSeen = ON_AIR.channel;
    chAt = now;
  }
  shown = phase === "playing" || phase === "caught" ? shown + (ON_AIR.dread - shown) * 0.15 : 0;
  g.imageSmoothingEnabled = false;
  g.fillStyle = COL.soot;
  g.fillRect(0, 0, W, H);
  g.textBaseline = "alphabetic";
  let noise = 0.06;
  let onAir = false;
  if (powerStage(now) !== "") noise = drawPower(g, W, H, now);
  else if (dark > 0) {
    collapse(g, W, H, LOW ? 1 : (1500 - dark) / 320);
    noise = 0;
  } else if (phase === "attract") {
    noise = 0.12;
    BARS.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect((i * W) / BARS.length, 0, W / BARS.length + 1, 48);
    });
    drawLogo(g, W / 2, 230, 440);
  } else if (phase === "ended") {
    noise = 0.08;
    endCard(g);
  } else {
    onAir = true;
    const picture = hasPicture(now),
      base = 0.05 + ON_AIR.dread * 0.05 + (ON_AIR.lookingAway ? 0.12 : 0) + (picture ? 0 : 0.06),
      cover = picture ? (now - coverFrom) / 2800 : 1;
    if (picture) videoFrame();
    else standBy(g, shown);
    noise = base;
    if (cover < 1) {
      noise = 0.55 + (base - 0.55) * cover;
      figure(g, ON_AIR.dread, 0.6 * (1 - cover));
    }
    if (now < ON_AIR.burstUntil) {
      noise = Math.max(noise, 0.7);
      figure(g, ON_AIR.dread, 0.35 + Math.random() * 0.25);
    }
    if (ON_AIR.drift > 0) noise = 0.85;
  }
  const img = g.getImageData(0, 0, W, H),
    d = img.data,
    wrapAt = SNOW.length - 1;
  let j = (Math.random() * SNOW.length) | 0;
  for (let y = 0; y < H; y++) {
    const dim = y % 4 === 0 ? 0.85 : 1;
    for (let i = y * W * 4, end = i + W * 4; i < end; i += 4) {
      const n = SNOW[j++ & wrapAt] * noise;
      d[i] = (d[i] + n) * dim;
      d[i + 1] = (d[i + 1] + n) * dim;
      d[i + 2] = (d[i + 2] + n) * dim;
    }
  }
  g.putImageData(img, 0, 0);
  tvNoise = noise;
  if (onAir) osd(g, now, now - chAt < 2500);
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.85);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  tvTex.needsUpdate = true;
}
