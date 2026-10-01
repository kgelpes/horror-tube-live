import * as THREE from "three";
import { ambience, isMuted, sfx, toggleMute } from "./sfx.ts";
import { COL } from "./room-palette.ts";
import { $, LOW, ROUND_S } from "./room-state.ts";
import { camera, canvas, draw, renderer, scene } from "./room-render.ts";
import { lambert, shade, TV_Y } from "./room-materials.ts";
import { ambient, bulb, bulbLight, driftMotes, halo, motes } from "./room-shell.ts";
import { drawTV, glass, mask, screen, smudge, tvGlow, tvNoise, video } from "./room-tv.ts";
import { powerOff, powerStage, tickPower } from "./room-power.ts";
import { faceById, faceLight, keyById, led, remote } from "./room-remote.ts";
import { MAX_DREAD, ON_AIR, connect, steer } from "./broadcast.ts";

const STEP_S = 3.75;
const COLD_OPEN_S = 4;
const LOOK_BACK_S = 0.25;
const FIRST_DRIFT_S = 15;
const DRIFT_EVERY_S = 25;
const LAST_STRETCH = 1 - 20 / ROUND_S;
const SIGNOFF_MS = 7000;
const BLACKOUT_MS = 1500;
const DRIFT_CHANNELS = 8;
const KEY_GLOW = new THREE.Color(14, 0.7, 0.7);
const KEY_PLAIN = new THREE.Color(1, 1, 1);

const KEY_REST_Z = 0.022;
const KEY_HOVER_Z = 0.028;
const HEAD_YAW = 0.9;
const HEAD_PITCH = 0.6;

const busy = (): boolean => powerStage(performance.now()) !== "";

let unseen = 0;
let seenFor = 0;
let nextBeat = 0;
let dreadAtAway = 0;
let nextDriftS = FIRST_DRIFT_S;
let nextKnockS = 0;

function startRound(): void {
  ON_AIR.phase = "playing";
  ON_AIR.channel = 1;
  ON_AIR.dread = 1;
  ON_AIR.progress = 0;
  ON_AIR.drift = 0;
  ON_AIR.ending = "";
  ON_AIR.lookingAway = false;
  ON_AIR.burstUntil = 0;
  ON_AIR.blackoutUntil = 0;
  unseen = seenFor = nextKnockS = 0;
  nextDriftS = FIRST_DRIFT_S;
  connect(video);
  steer();
  raiseRemote(false);
  video.muted = isMuted();
}

function stepUp(now: number): void {
  if (ON_AIR.dread >= MAX_DREAD) return caught();
  ON_AIR.dread++;
  sfx.step(ON_AIR.dread);
  ON_AIR.burstUntil = now + 450;
  steer();
}

function tune(channel: number): void {
  ON_AIR.channel = channel;
  sfx.static();
  if (ON_AIR.drift === channel) {
    ON_AIR.drift = 0;
    ON_AIR.burstUntil = performance.now() + 600;
    raiseRemote(false);
  }
  steer();
}

const surf = (channel: number): number => ((channel - 1 + DRIFT_CHANNELS) % DRIFT_CHANNELS) + 1;

function press(id: string): void {
  sfx.key();
  const k = keyById.get(id);
  if (k) {
    k.position.z = 0.016;
    setTimeout(() => (k.position.z = hovered === id ? KEY_HOVER_Z : KEY_REST_Z), 120);
  }
  led.material.color.set(COL.blood);
  setTimeout(() => led.material.color.set(COL.bloodDeep), 120);
  if (busy()) return;
  if (ON_AIR.phase === "attract" || ON_AIR.phase === "ended") {
    if (id === "ok" || id === "power") startRound();
    return;
  }
  const now = performance.now();
  if (ON_AIR.phase !== "playing" || now < ON_AIR.blackoutUntil) return;
  if (id === "power") {
    ON_AIR.blackoutUntil = now + BLACKOUT_MS;
    sfx.tvOff();
    return;
  }
  if (ON_AIR.drift > 0 && id !== String(ON_AIR.drift)) return;
  const digit = /^[1-9]$/.test(id) ? Number(id) : 0;
  if (digit > 0) tune(digit);
  else if (id === "ch+") tune(surf(ON_AIR.channel + 1));
  else if (id === "ch-") tune(surf(ON_AIR.channel - 1));
}

const cable = new THREE.Mesh(
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(
      [
        [-0.59, TV_Y, -1.1],
        [-0.59, TV_Y - 0.32, -1.2],
        [-0.61, 0.3, -1.32],
        [-0.56, 0.008, -1.55],
        [-0.35, 0.008, -1.78],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    ),
    40,
    0.006,
    6,
  ),
  lambert({ color: COL.soot }),
);
scene.add(cable);

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const look = new THREE.Vector2();
const lookOff = new THREE.Vector2();
const cursor = new THREE.Vector2();
let reanchor = false;
const hitAt = (e: PointerEvent): THREE.Object3D | undefined => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray
    .intersectObject(scene, true)
    .find((h) => h.object instanceof THREE.Mesh && h.object.visible)?.object;
};
const keyOf = (o: THREE.Object3D | undefined): string | undefined =>
  [...keyById].find(([, m]) => m === o)?.[0];
const gaze = new THREE.Vector2(0, 0);
let remoteRaised = false;
const watching = (): boolean => {
  if (remoteRaised || !document.hasFocus()) return false;
  ray.setFromCamera(gaze, camera);
  return ray.intersectObject(screen, false).length > 0;
};
let hovered: string | undefined;
function hoverKey(id: string | undefined): void {
  if (id === hovered) return;
  const was = hovered === undefined ? undefined : keyById.get(hovered);
  if (was) was.position.z = KEY_REST_Z;
  hovered = id;
  const now = id === undefined ? undefined : keyById.get(id);
  if (now) now.position.z = KEY_HOVER_Z;
}

function raiseRemote(up: boolean): void {
  remoteRaised = up && !busy();
  if (remoteRaised) reanchor = true;
  canvas.dataset.cursor = remoteRaised ? "press" : "";
  if (!remoteRaised) hoverKey(undefined);
}

function aim(e: PointerEvent): void {
  if (remoteRaised) return hoverKey(keyOf(hitAt(e)));
  cursor.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  if (reanchor) {
    if (e.pointerType === "mouse") lookOff.subVectors(look, cursor);
    else lookOff.set(0, 0);
    reanchor = false;
  }
  look.addVectors(cursor, lookOff).clampScalar(-1, 1);
  lookOff.subVectors(look, cursor);
}

addEventListener("pointerdown", () => connect(video), { once: true });
addEventListener("keydown", () => connect(video), { once: true });
addEventListener("pointermove", aim);
document.documentElement.addEventListener("mouseleave", () => hoverKey(undefined));
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  raiseRemote(false);
});
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  aim(e);
  if (!remoteRaised) return raiseRemote(true);
  const hit = hitAt(e);
  const id = keyOf(hit);
  if (id !== undefined) press(id);
  else if (hit?.parent !== remote) raiseRemote(false);
});
const KEYS = new Map([
  ["enter", "ok"],
  ["o", "power"],
  ["+", "ch+"],
  ["=", "ch+"],
  ["arrowup", "ch+"],
  ["-", "ch-"],
  ["arrowdown", "ch-"],
]);
addEventListener(
  "keydown",
  (e) => {
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "m") return muteKey();
    if (k === " " || (k === "escape" && remoteRaised)) {
      e.preventDefault();
      return raiseRemote(k === " " && !remoteRaised);
    }
    const id = /^[1-9]$/.test(k) ? k : KEYS.get(k);
    if (id === undefined) return;
    e.preventDefault();
    press(id);
  },
  true,
);

function muteKey(): void {
  toggleMute();
  video.muted = isMuted();
  $("#mute").textContent = isMuted() ? "SOUND OFF" : "SOUND ON";
}
$("#mute").addEventListener("click", muteKey);
$("#mute").textContent = isMuted() ? "SOUND OFF" : "SOUND ON";

function lookedAway(now: number): void {
  dreadAtAway = ON_AIR.dread;
  ON_AIR.burstUntil = now + 350;
  sfx.static();
  sfx.beat(1);
  nextBeat = now + 700;
}

function lookedBack(now: number): void {
  if (ON_AIR.dread <= dreadAtAway) return;
  sfx.reveal();
  ON_AIR.burstUntil = now + 300;
  $("#cut").hidden = false;
  setTimeout(() => ($("#cut").hidden = true), 60);
}

function caught(): void {
  ON_AIR.phase = "caught";
  ON_AIR.lookingAway = false;
  raiseRemote(false);
  video.muted = true;
  powerOff(() => {
    ON_AIR.phase = "ended";
    ON_AIR.ending = "caught";
    video.muted = isMuted();
  });
}

function signOffAir(): void {
  ON_AIR.phase = "signoff";
  ON_AIR.channel = 9;
  ON_AIR.dread = 2;
  ON_AIR.drift = 0;
  ON_AIR.lookingAway = false;
  ON_AIR.blackoutUntil = 0;
  raiseRemote(false);
  steer();
  sfx.signoff();
  setTimeout(() => {
    ON_AIR.phase = "ended";
    ON_AIR.ending = "signoff";
  }, SIGNOFF_MS);
}

function tickDread(dt: number): void {
  if (busy() && remoteRaised) raiseRemote(false);
  if (ON_AIR.phase !== "playing") {
    ON_AIR.lookingAway = false;
    return;
  }
  const now = performance.now();
  const p = ON_AIR.progress;
  const elapsed = p * ROUND_S;
  ON_AIR.progress = Math.min(1, p + dt / ROUND_S);
  if (ON_AIR.progress >= 1) return signOffAir();

  if (p > LAST_STRETCH && elapsed >= nextKnockS) {
    if (Math.random() < 0.5) sfx.knock();
    else sfx.creak();
    nextKnockS = elapsed + 4 + 2 * Math.random();
  }

  if (ON_AIR.blackoutUntil > 0 && now >= ON_AIR.blackoutUntil) {
    ON_AIR.blackoutUntil = 0;
    sfx.tvOn();
  }

  if (ON_AIR.drift > 0 || ON_AIR.dread >= MAX_DREAD) nextDriftS = elapsed + DRIFT_EVERY_S;
  else if (elapsed >= nextDriftS && p <= LAST_STRETCH) {
    const d = 1 + Math.floor(Math.random() * (DRIFT_CHANNELS - 1));
    ON_AIR.drift = d >= ON_AIR.channel ? d + 1 : d;
    sfx.drift();
  }

  const raw = watching() && ON_AIR.drift === 0 && ON_AIR.blackoutUntil === 0;
  seenFor = raw ? seenFor + dt : 0;
  const seen = raw && (seenFor > LOOK_BACK_S || !ON_AIR.lookingAway);
  if (!seen && !ON_AIR.lookingAway) lookedAway(now);
  if (seen && ON_AIR.lookingAway) lookedBack(now);
  ON_AIR.lookingAway = !seen;
  if (!seen && now >= nextBeat) {
    sfx.beat(0.6 + ON_AIR.dread * 0.1);
    nextBeat = now + 900 - ON_AIR.dread * 150;
  }

  if (raw || elapsed < COLD_OPEN_S) return;
  unseen += dt;
  if (unseen < STEP_S) return;
  unseen -= STEP_S;
  stepUp(now);
}

shade(scene);
mask.castShadow = false;
const clock = new THREE.Clock();
let lastPaint = 0;
let lastT = 0;
const eye = new THREE.Vector3(),
  aimAt = new THREE.Vector3(),
  wantEye = new THREE.Vector3(),
  wantAim = new THREE.Vector3();
let snap = true;
let remoteUp = 0;
let lastGlow = "";
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  const dt = Math.min(t - lastT, 0.1);
  lastT = t;
  wantEye.set(
    0.1 + look.x * 0.05 + Math.sin(t * 0.6) * 0.008,
    1.2 - look.y * 0.03 + Math.sin(t * 1.0) * 0.006,
    0.28,
  );
  wantAim.set(-0.09 + look.x * HEAD_YAW, TV_Y - 0.04 - look.y * HEAD_PITCH - remoteUp, -1.4);
  const k = snap || LOW ? 1 : 1 - Math.exp(-dt * 7);
  eye.lerp(wantEye, k);
  aimAt.lerp(wantAim, k);
  snap = false;
  camera.position.copy(eye);
  camera.lookAt(aimAt);
  tickDread(dt);
  remoteUp += ((remoteRaised ? 1 : 0) - remoteUp) * (LOW ? 1 : 1 - Math.exp(-dt * 10));
  remote.position.set(0.31 - 0.24 * remoteUp, -0.17 + 0.07 * remoteUp, -0.62 + 0.24 * remoteUp);
  remote.rotation.set(-0.3 + 0.24 * remoteUp, -0.22 + 0.22 * remoteUp, -0.1 + 0.1 * remoteUp);
  const pw = tickPower(performance.now());
  const lightsOut = pw !== "";
  const tvLit = pw !== "" && pw !== "off" && pw !== "black";
  const dead = lightsOut && !tvLit;
  glass.visible = smudge.visible = !dead;
  faceLight.intensity = dead ? 0 : 0.25;
  const playing = ON_AIR.phase === "playing";
  const dread = playing ? ON_AIR.dread : 0;
  const awayNow = playing && ON_AIR.lookingAway;
  const bulbFailsAbove = 0.97 - dread * 0.04 - (awayNow ? 0.2 : 0);
  const flick = lightsOut
    ? 0
    : Math.sin(t * 13) > bulbFailsAbove || Math.sin(t * 2.3 + 1) > 0.995
      ? 0.3
      : 1;
  ambient.intensity = lightsOut ? 0 : 0.35;
  bulbLight.intensity = 7 * flick;
  bulb.material.color.set(flick < 1 ? COL.grime : COL.bone);
  halo.material.opacity = 0.7 * flick;
  motes.material.opacity = 0.5 * flick * (lightsOut ? 0 : 1);
  if (!LOW) driftMotes(t);
  const pulse = 0.5 + 0.5 * Math.sin(t * (6 + dread * 2));
  const glowId =
    playing && ON_AIR.drift > 0
      ? String(ON_AIR.drift)
      : ON_AIR.phase === "attract" || ON_AIR.phase === "ended"
        ? "ok"
        : "";
  const glowOn = Math.sin(t * 9) > 0;
  for (const [id, face] of faceById) {
    const lit = id === glowId && glowOn;
    face.color.copy(lit ? KEY_GLOW : KEY_PLAIN);
    const k = keyById.get(id);
    if (k && id !== hovered && k.position.z !== 0.016)
      k.position.z = lit ? KEY_HOVER_Z : KEY_REST_Z;
  }
  if (glowId !== "") led.material.color.set(glowOn ? COL.blood : COL.bloodDeep);
  else if (lastGlow !== "") led.material.color.set(COL.bloodDeep);
  lastGlow = glowId;
  $("#gaze").dataset.away = awayNow ? "1" : "";
  $("#gaze").hidden = remoteRaised;
  const fill = playing ? unseen / STEP_S : 0;
  $("#dread").style.opacity = String(
    awayNow ? 0.3 + 0.6 * fill + pulse * 0.1 : dread * 0.05 + 0.15 * fill,
  );
  tvGlow.intensity = tvLit ? 1.6 + Math.random() * 0.6 : lightsOut ? 0 : 1 + Math.random() * 0.3;
  if (pw !== "") video.muted = true;
  ambience(tvNoise, flick, lightsOut);
  if (t - lastPaint > 0.05) {
    lastPaint = t;
    drawTV();
  }
  draw();
});

void document.fonts.ready.then(drawTV);
