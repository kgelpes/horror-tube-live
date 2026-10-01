import { Reactor, ReactorError, type ReactorMessage } from "@reactor-team/js-sdk";
import * as v from "valibot";

const MODELS = ["reactor/visko-orbis-stable", "reactor/visko-orbis-dynamic"] as const;
const STYLE =
  "Grainy 1980s VHS late-night broadcast footage, fixed camera that never moves, dim, desaturated.";
const FIGURE =
  "A tall pale figure in a long black coat, its face a smooth blank pale surface like an egg, arms hanging still,";

export const MAX_DREAD = 4;
export type Channel = {
  name: string;
  scene: string;
  motion: string;
  at: readonly [far: string, mid: string, near: string];
};
export const CHANNELS: readonly Channel[] = [
  {
    name: "VACANCY",
    scene:
      "A long motel corridor at night, buzzing fluorescent tubes, numbered doors on both sides",
    motion: "the fluorescent tubes flicker",
    at: [
      "standing at the far end of the corridor under the last flickering tube",
      "standing halfway down the corridor between the doors",
      "standing just past the nearest door",
    ],
  },
  {
    name: "THE CELLAR",
    scene:
      "A damp basement lit by one bare bulb, old laundry hanging on a line, wooden stairs leading up",
    motion: "the laundry sways",
    at: [
      "standing at the top of the wooden stairs",
      "standing at the bottom of the stairs beside the laundry line",
      "standing between the hanging sheets under the bulb",
    ],
  },
  {
    name: "RECESS",
    scene: "A children's playground in thick fog at dusk",
    motion: "one swing moves slowly",
    at: [
      "standing at the edge of the fog behind the swings",
      "sitting on the moving swing",
      "standing beside the slide, close to the camera",
    ],
  },
  {
    name: "HARVEST",
    scene: "A cornfield at night under a full moon, a scarecrow post in the middle",
    motion: "the corn sways",
    at: [
      "standing on the scarecrow post",
      "standing between the corn rows halfway to the camera",
      "parting the corn right in front of the camera",
    ],
  },
  {
    name: "HOME SECURITY",
    scene:
      "A dark suburban living room seen from a ceiling security camera, a sofa and a curtained window",
    motion: "the curtain stirs",
    at: [
      "standing outside behind the curtained window",
      "standing in the corner of the living room",
      "standing directly below the camera, looking up into it",
    ],
  },
  {
    name: "TRAILHEAD",
    scene: "A narrow forest trail at night lit only by a flashlight beam",
    motion: "the beam shakes",
    at: [
      "standing far down the trail at the edge of the flashlight beam",
      "standing in the middle of the trail inside the beam",
      "standing right in front of the flashlight, the beam on its chest",
    ],
  },
  {
    name: "WARD 9",
    scene: "An abandoned hospital ward with rusted metal beds and torn privacy curtains",
    motion: "a curtain flutters",
    at: [
      "standing behind a torn curtain at the end of the ward",
      "sitting upright on a rusted bed",
      "standing beside the nearest bed",
    ],
  },
  {
    name: "BLACK WATER",
    scene: "A wooden lake dock at night, still black water, thick drifting mist",
    motion: "mist drifts",
    at: [
      "standing on the water far out in the mist",
      "standing at the end of the dock",
      "standing on the dock right in front of the camera, dripping",
    ],
  },
  {
    name: "SIGN OFF",
    scene: "A late-night TV studio, a news desk under a single spotlight",
    motion: "dust drifts through the spotlight",
    at: [
      "standing in the dark behind the news desk",
      "sitting at the news desk facing the camera",
      "leaning over the desk toward the camera",
    ],
  },
];

export type Phase = "attract" | "playing" | "caught" | "signoff" | "ended";
export type Link = "off" | "connecting" | "warming" | "busy" | "live";
export type OnAir = {
  phase: Phase;
  channel: number;
  dread: number;
  progress: number;
  drift: number;
  lookingAway: boolean;
  burstUntil: number;
  blackoutUntil: number;
  ending: "" | "signoff" | "caught";
  link: Link;
  promptAt: number;
};
export const ON_AIR: OnAir = {
  phase: "attract",
  channel: 1,
  dread: 0,
  progress: 0,
  drift: 0,
  lookingAway: false,
  burstUntil: 0,
  blackoutUntil: 0,
  ending: "",
  link: "off",
  promptAt: 0,
};

const promptFor = (ch: number, d: number): string => {
  const c = CHANNELS[ch - 1] ?? CHANNELS[0];
  if (c === undefined) return STYLE;
  if (d <= 0) return `${c.scene}, ${c.motion}, empty and still. ${STYLE}`;
  if (d >= MAX_DREAD)
    return `${c.scene}. The smooth blank pale head of the tall figure fills the whole frame, pressed against the camera glass, breath fogging the lens, the room barely visible behind it. ${STYLE}`;
  return `${c.scene}, ${c.motion}. ${FIGURE} ${c.at[d - 1] ?? c.at[2]}, facing the camera. ${STYLE}`;
};

const Event = v.object({
  type: v.optional(v.string()),
  reason: v.optional(v.string()),
  command: v.optional(v.string()),
});
type Event = v.InferOutput<typeof Event>;
const Envelope = v.object({ type: v.optional(v.string()), data: v.optional(Event) });
const kindOf = (m: ReactorMessage | undefined): Event => {
  const parsed = v.safeParse(Envelope, m);
  if (!parsed.success) return {};
  const { type, data } = parsed.output;
  return data === undefined ? { type } : { ...data, type: type ?? data.type };
};
const rejected = (m: ReactorMessage | undefined): string | undefined => {
  const msg = kindOf(m);
  return msg.type === "command_error"
    ? `${msg.command ?? "command"} rejected: ${msg.reason ?? "no reason given"}`
    : undefined;
};
const TokenReply = v.object({ jwt: v.optional(v.string()), error: v.optional(v.string()) });

const BACKOFF_S = [3, 3, 4, 5, 6, 8, 10] as const;
const JWT_ATTEMPTS = 8;
const JWT_MAX_AGE_MS = 50 * 60_000;
const RECYCLE_MS = 150_000;
const STEER_GAP_MS = 3600;
const READY_MS = 30_000;
const CAPACITY = /429|no available capacity|none is currently available|Too many tune-ins/i;

let tv: HTMLVideoElement | null = null;
let r: Reactor | null = null;
let eager = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let tries = 0;
let model = 0;
let capacityFails = 0;
let jwt: string | null = null;
let jwtUses = 0;
let jwtAt = 0;
let bornAt = 0;
let sent = "";
let sentChannel = 0;
let lastSend = 0;
let steerTimer: ReturnType<typeof setTimeout> | undefined;
let cutting = false;
let conditionsReady: (() => void) | undefined;

function waitConditions(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`Orbis did not send conditions_ready within ${String(READY_MS / 1000)}s`)),
      READY_MS,
    );
    conditionsReady = () => {
      clearTimeout(timer);
      conditionsReady = undefined;
      resolve();
    };
  });
}

async function fetchJwt(): Promise<string> {
  const res = await fetch("/api/token", { method: "POST" });
  const parsed = v.safeParse(TokenReply, await res.json().catch(() => ({})));
  const body = parsed.success ? parsed.output : {};
  if (!res.ok || !body.jwt)
    throw new ReactorError(body.error ?? `token endpoint returned ${String(res.status)}`, {
      status: res.status,
    });
  return body.jwt;
}

async function sessionJwt(): Promise<string> {
  if (jwt === null || jwtUses >= JWT_ATTEMPTS || Date.now() - jwtAt > JWT_MAX_AGE_MS) {
    jwt = await fetchJwt();
    jwtUses = 0;
    jwtAt = Date.now();
  }
  jwtUses++;
  return jwt;
}

const roundActive = (): boolean => ON_AIR.phase === "playing" || ON_AIR.phase === "signoff";

function send(me: Reactor, prompt: string): Promise<ReactorMessage | undefined> {
  sent = prompt;
  sentChannel = ON_AIR.channel;
  lastSend = performance.now();
  ON_AIR.promptAt = lastSend;
  console.info(
    `set_prompt sentAt=${lastSend.toFixed(0)}ms (${new Date().toISOString()}) model=${MODELS[model]} ch=${String(ON_AIR.channel)} dread=${String(ON_AIR.dread)}`,
  );
  return me.sendCommand("set_prompt", { prompt, passthrough: true });
}

function scheduleRetry(err: Error): void {
  const status = err instanceof ReactorError ? err.status : undefined;
  if (
    status === 401 ||
    status === 403 ||
    (err instanceof ReactorError && err.code === "UNAUTHORIZED")
  )
    jwt = null;
  if (!eager && !roundActive()) {
    ON_AIR.link = "off";
    console.info("Orbis session idle; not retrying until the next connect()");
    return;
  }
  const capacity =
    CAPACITY.test(err.message) ||
    status === 429 ||
    (err instanceof ReactorError && err.code === "RATE_LIMITED");
  capacityFails = capacity ? capacityFails + 1 : 0;
  if (capacityFails >= 2) {
    model = (model + 1) % MODELS.length;
    capacityFails = 0;
    console.warn(`Orbis capacity: switching to ${MODELS[model]}`);
  }
  ON_AIR.link = capacity ? "busy" : "connecting";
  const hint = err instanceof ReactorError ? err.retry_after_ms : undefined;
  const ms = hint ?? (BACKOFF_S[Math.min(tries, BACKOFF_S.length - 1)] ?? 10) * 1000;
  tries++;
  console.warn(
    `Orbis retry ${String(tries)} in ${String(ms / 1000)}s (${capacity ? "capacity" : "failure"})`,
  );
  retry = setTimeout(() => {
    retry = undefined;
    void attempt();
  }, ms);
}

function drop(me: Reactor, err: Error): void {
  if (r !== me) return;
  r = null;
  console.error(`Orbis session ended (${MODELS[model]}): ${err.message}`);
  ON_AIR.link = "off";
  void me.disconnect().catch((e: Error) => console.error(`Orbis disconnect failed: ${e.message}`));
  scheduleRetry(err);
}

async function attempt(): Promise<void> {
  const video = tv;
  if (video === null || r !== null) return;
  video.srcObject = null;
  ON_AIR.link = "connecting";
  const feed = new MediaStream();
  const me = new Reactor({
    modelName: MODELS[model],
    apiUrl: "https://api.reactor.inc",
    modelTracks: [
      { name: "main_video", kind: "video", direction: "recvonly" },
      { name: "main_audio", kind: "audio", direction: "recvonly" },
    ],
  });
  r = me;
  bornAt = performance.now();
  const mine = (): boolean => r === me;
  console.info(`Orbis connecting to ${MODELS[model]}`);
  me.on("statusChanged", (status) => {
    if (!mine()) return;
    if (status === "connecting") ON_AIR.link = "connecting";
    if (status === "waiting") ON_AIR.link = "warming";
    if (status === "disconnected") drop(me, new Error("Orbis disconnected"));
  });
  me.on("error", (err) => console.error(`Orbis error: ${err.message}`));
  me.on("trackReceived", (_name, track) => {
    if (!mine()) return;
    feed.addTrack(track);
    if (video.srcObject === feed) return;
    video.srcObject = feed;
    void video.play().catch((err: Error) => {
      if (!mine()) return;
      console.error(`Feed playback failed, retrying muted: ${err.message}`);
      video.muted = true;
      void video.play().catch((again: Error) => {
        if (!mine()) return;
        console.error(`Feed playback failed muted: ${again.message}`);
      });
    });
  });
  me.on("message", (m) => {
    if (!mine()) return;
    const msg = kindOf(m);
    if (msg.type === "conditions_ready") conditionsReady?.();
    const why = rejected(m);
    if (why !== undefined && ON_AIR.link !== "live") drop(me, new Error(why));
    else if (why !== undefined) console.error(`Orbis ${why}`);
    if (msg.type === "generation_complete") drop(me, new Error("generation_complete"));
  });
  try {
    await me.connect(await sessionJwt());
    if (!mine()) return;
    const [promptReply] = await Promise.all([
      send(me, promptFor(ON_AIR.channel, ON_AIR.dread)),
      waitConditions(),
    ]);
    if (!mine()) return;
    const promptWhy = rejected(promptReply);
    if (promptWhy !== undefined) throw new Error(promptWhy);
    const startWhy = rejected(await me.sendCommand("start", {}));
    if (!mine()) return;
    if (startWhy !== undefined) throw new Error(startWhy);
    ON_AIR.link = "live";
    eager = false;
    tries = 0;
    capacityFails = 0;
    console.info(
      `Orbis live on ${MODELS[model]} session=${me.getSessionId() ?? "?"}`,
      me.getConnectionTimings(),
    );
    steer();
  } catch (err) {
    if (!mine()) return;
    drop(me, err instanceof Error ? err : new Error(String(err)));
  }
}

export function connect(video: HTMLVideoElement): void {
  tv = video;
  if (r !== null && ON_AIR.phase === "playing" && performance.now() - bornAt > RECYCLE_MS) {
    const old = r;
    r = null;
    ON_AIR.link = "off";
    console.info("Orbis session too close to its cap for a full round; starting a fresh one");
    void old
      .disconnect()
      .catch((e: Error) => console.error(`Orbis disconnect failed: ${e.message}`));
  }
  if (r !== null) return;
  eager = true;
  if (retry === undefined) void attempt();
}

async function hardCut(me: Reactor): Promise<void> {
  cutting = true;
  try {
    const resetWhy = rejected(await me.sendCommand("reset", {}));
    if (r !== me) return;
    if (resetWhy !== undefined) throw new Error(resetWhy);
    const [promptReply] = await Promise.all([
      send(me, promptFor(ON_AIR.channel, ON_AIR.dread)),
      waitConditions(),
    ]);
    if (r !== me) return;
    const why = rejected(promptReply) ?? rejected(await me.sendCommand("start", {}));
    if (r !== me) return;
    if (why !== undefined) throw new Error(why);
    console.info(`Orbis cut to ch=${String(ON_AIR.channel)}`);
  } catch (err) {
    if (r === me) drop(me, err instanceof Error ? err : new Error(String(err)));
  } finally {
    cutting = false;
  }
  steer();
}

export function steer(): void {
  const me = r;
  if (me === null || ON_AIR.link !== "live" || cutting) return;
  if (ON_AIR.channel !== sentChannel) {
    clearTimeout(steerTimer);
    steerTimer = undefined;
    void hardCut(me);
    return;
  }
  if (steerTimer !== undefined) return;
  if (promptFor(ON_AIR.channel, ON_AIR.dread) === sent) return;
  const wait = lastSend + STEER_GAP_MS - performance.now();
  if (wait > 0) {
    steerTimer = setTimeout(() => {
      steerTimer = undefined;
      steer();
    }, wait);
    return;
  }
  void send(me, promptFor(ON_AIR.channel, ON_AIR.dread))
    .then((reply) => {
      const why = rejected(reply);
      if (why !== undefined) console.error(`Orbis ${why}`);
    })
    .catch((err: Error) => console.error(`set_prompt failed: ${err.message}`));
}

addEventListener("pagehide", (e) => {
  if (e.persisted) return;
  const me = r;
  r = null;
  clearTimeout(retry);
  clearTimeout(steerTimer);
  if (me === null) return;
  const sessionId = me.getSessionId();
  if (sessionId !== undefined && jwt !== null)
    void fetch("/api/session-end", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, jwt }),
    })
      .then((res) => console.info(`session-end ${sessionId}: ${String(res.status)}`))
      .catch((err: Error) => console.error(`session-end failed: ${err.message}`));
  void me
    .disconnect()
    .catch((err: Error) => console.error(`Orbis disconnect failed: ${err.message}`));
});
