const ctx = new AudioContext();
export const SOUND = {
  breath: new URL("./assets/scare/breath.mp3", import.meta.url).href,
  glitch: new URL("./assets/scare/glitch.mp3", import.meta.url).href,
  riser: new URL("./assets/scare/riser.mp3", import.meta.url).href,
  whisper: new URL("./assets/scare/whisper.mp3", import.meta.url).href,
  scream: new URL("./assets/scare/scream.mp3", import.meta.url).href,
};
const MUTE_KEY = "ht.muted";
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  muted = false;
}

const master = ctx.createGain();
master.gain.value = muted ? 0 : 0.9;
const comp = ctx.createDynamicsCompressor();
comp.threshold.value = -14;
comp.ratio.value = 4;
master.connect(comp).connect(ctx.destination);

const filter = (type: BiquadFilterType, f: number, q = 0.7, gain = 0): BiquadFilterNode => {
  const n = ctx.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  n.gain.value = gain;
  return n;
};
const gain = (v: number): GainNode => {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
};

const verb = ctx.createConvolver();
const ir = ctx.createBuffer(2, Math.round(ctx.sampleRate * 1.8), ctx.sampleRate);
for (let c = 0; c < 2; c++) {
  const d = ir.getChannelData(c);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
}
verb.buffer = ir;
verb.connect(filter("lowpass", 3000)).connect(master);

const bus = (dry: number, wet: number): GainNode => {
  const g = ctx.createGain();
  g.connect(gain(dry)).connect(master);
  g.connect(gain(wet)).connect(verb);
  return g;
};
const near = bus(1, 0.08);
const room = bus(1, 0.35);
const far = filter("lowpass", 900);
far.connect(bus(0.35, 0.9));
const tv = filter("highpass", 320);
tv.connect(filter("peaking", 1150, 1.4, 6))
  .connect(filter("lowpass", 3200))
  .connect(bus(1, 0.25));

const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
const nd = noiseBuf.getChannelData(0);
for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
const noise = (t: number, dur: number): AudioBufferSourceNode => {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.start(t, Math.random() * 1.9);
  if (dur > 0) s.stop(t + dur);
  return s;
};

const env = (to: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(to);
  return g;
};
const osc = (type: OscillatorType, f: number, t: number, dur: number): OscillatorNode => {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
};
const tone = (
  to: AudioNode,
  t: number,
  type: OscillatorType,
  f0: number,
  f1: number,
  peak: number,
  attack: number,
  decay: number,
): void => {
  const o = osc(type, f0, t, attack + decay);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  o.connect(env(to, t, peak, attack, decay));
};
const hiss = (
  to: AudioNode,
  t: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q: number,
  peak: number,
  attack: number,
  decay: number,
): void => {
  const f = filter(type, f0, q);
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  noise(t, attack + decay + 0.05)
    .connect(f)
    .connect(env(to, t, peak, attack, decay));
};
const jit = (spread: number): number => 1 + (Math.random() * 2 - 1) * spread;
const thud = (to: AudioNode, t: number, peak: number, f: number): void => {
  tone(to, t, "sine", f, f * 0.45, peak, 0.004, 0.16);
  hiss(to, t, "lowpass", 500, 500, 0.9, peak * 0.7, 0.002, 0.08);
};

const beep = (t: number, freqs: number[], level: number, dur: number): void => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.005);
  g.gain.setValueAtTime(level, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
  g.connect(tv);
  const wow = osc("sine", 0.7, t, dur);
  const depth = gain(6);
  wow.connect(depth);
  for (const f of freqs) {
    const o = osc("triangle", f, t, dur);
    depth.connect(o.detune);
    o.connect(g);
  }
};

const rumble = gain(0.1);
noise(0, 0).connect(filter("lowpass", 140)).connect(rumble).connect(master);
const hum = gain(0.02);
osc("sawtooth", 60, 0, 1e7).connect(filter("lowpass", 240)).connect(hum);
osc("sine", 120, 0, 1e7).connect(gain(0.5)).connect(hum);
hum.connect(room);
const bed = gain(0);
noise(0, 0).connect(filter("highpass", 1800)).connect(filter("lowpass", 8000)).connect(bed);
bed.connect(master);
const whine = gain(0);
osc("sine", 15625, 0, 1e7).connect(whine).connect(master);

const allowed = (): boolean =>
  !muted && (ctx.state === "running" || navigator.userActivation.isActive);
const now = (): number => ctx.currentTime + 0.01;
const resume = (): void => void ctx.resume();
addEventListener("pointerdown", resume, true);
addEventListener("keydown", resume, true);

const on =
  <A extends (number | boolean)[]>(fn: (...a: A) => void) =>
  (...a: A): void => {
    if (allowed()) fn(...a);
  };

export const sfx = {
  key: on((): void => {
    const t = now(),
      k = jit(0.08);
    hiss(near, t, "bandpass", 3800 * k, 3800 * k, 1.5, 0.3, 0.001, 0.012);
    tone(near, t, "triangle", 1900 * k, 1400 * k, 0.06, 0.001, 0.02);
    tone(near, t, "sine", 220 * k, 140 * k, 0.25, 0.002, 0.045);
  }),
  static: on((): void => {
    hiss(tv, now(), "bandpass", 3500, 3500, 0.6, 0.45, 0.002, 0.14);
  }),
  tvOff: on((): void => {
    const t = now();
    hiss(tv, t, "lowpass", 3000, 3000, 0.7, 0.5, 0.001, 0.01);
    tone(room, t, "sine", 1200, 60, 0.3, 0.002, 0.25);
    thud(room, t + 0.08, 0.6, 80);
  }),
  dark: on((): void => {
    const t = now();
    tone(room, t, "sine", 55, 28, 0.7, 0.01, 2.5);
    tone(room, t, "sine", 110, 56, 0.25, 0.01, 2.5);
    tone(near, t, "sine", 6800, 6800, 0.015, 0.3, 5);
  }),
  tvOn: on((): void => {
    const t = now();
    const g = env(room, t, 0.35, 0.01, 1.2);
    osc("sawtooth", 60, t, 1.3).connect(filter("lowpass", 400)).connect(g);
    tone(room, t, "sine", 60, 60, 0.4, 0.01, 1.2);
    hiss(tv, t + 0.1, "highpass", 4000, 4000, 0.7, 0.12, 0.4, 0.3);
  }),
  beat: on((k: number): void => {
    const t = now();
    thud(near, t, 0.8 * k, 70);
    thud(near, t + 0.18, 0.55 * k, 64);
  }),
  step: on((level: number): void => {
    const t = now();
    if (level >= 4) return sample(SOUND.whisper, 1.4);
    if (level === 3) return sample(SOUND.breath);
    const steps = level <= 1 ? 2 : 3;
    for (let i = 0; i < steps; i++)
      thud(
        level <= 1 ? far : room,
        t + i * 0.5 * jit(0.08),
        level <= 1 ? 0.6 : 0.75,
        95 + level * 10,
      );
  }),
  reveal: on((): void => {
    const t = now();
    thud(near, t, 1, 75);
    hiss(tv, t, "bandpass", 2800, 2800, 0.6, 0.6, 0.001, 0.09);
  }),
  drift: on((): void => {
    hiss(tv, now(), "bandpass", 900, 3800, 0.5, 0.45, 0.5, 0.9);
  }),
  signoff: on((): void => {
    beep(now(), [1000], 0.18, 3);
  }),
  creak: on((): void => {
    const t = now(),
      dur = 0.8 + Math.random() * 0.8,
      o = osc("sawtooth", 22, t, dur);
    o.frequency.linearRampToValueAtTime(14 + Math.random() * 20, t + dur);
    o.connect(filter("bandpass", 500 + Math.random() * 300, 8)).connect(
      env(far, t, 0.5, dur * 0.3, dur * 0.7),
    );
  }),
  drip: on((): void => {
    tone(far, now(), "sine", 900, 1900, 0.3, 0.002, 0.05);
  }),
  knock: on((): void => {
    const t = now();
    thud(far, t, 0.5, 90);
    thud(far, t + 0.25, 0.4, 90);
  }),
};

let flick = 1;
const zap = on((): void => {
  const t = now();
  hiss(room, t, "bandpass", 2500, 2500, 1, 0.12, 0.001, 0.04);
  hiss(room, t + 0.03, "highpass", 3000, 3000, 0.7, 0.08, 0.001, 0.01);
});
export function ambience(level: number, bulb: number, lightsOut: boolean): void {
  const t = ctx.currentTime;
  bed.gain.setTargetAtTime(level * 0.35, t, 0.03);
  whine.gain.setTargetAtTime(level > 0 ? 0.003 : 0, t, 0.05);
  hum.gain.setTargetAtTime(lightsOut ? 0 : bulb < 1 ? 0.07 : 0.02, t, 0.02);
  rumble.gain.setTargetAtTime(lightsOut ? 0.04 : 0.1, t, 0.3);
  if (bulb < 1 && flick === 1 && !lightsOut) zap();
  flick = bulb;
}

export const isMuted = (): boolean => muted;
const loud = gain(muted ? 0 : 1);
loud.connect(ctx.destination);
const decoded = new Map<string, AudioBuffer>();
function preload(urls: string[]): void {
  for (const url of urls)
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => decoded.set(url, buf))
      .catch((err: Error) => console.error(`Sound ${url} failed to load: ${err.message}`));
}
export function sample(url: string, level = 1): void {
  if (!allowed()) return;
  const buf = decoded.get(url);
  if (buf === undefined) {
    console.error(`Sound ${url} is not loaded yet`);
    return;
  }
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.connect(gain(level)).connect(loud);
  s.start(now());
}

export function toggleMute(): void {
  muted = !muted;
  master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  loud.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    return;
  }
}

const distant = (): void => {
  const pick = [sfx.creak, sfx.drip, sfx.knock][(Math.random() * 3) | 0];
  if (pick && ctx.state === "running") pick();
  setTimeout(distant, 15000 + Math.random() * 30000);
};
setTimeout(distant, 20000);
preload(Object.values(SOUND));
