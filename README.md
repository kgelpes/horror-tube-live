# Horror Tube · Live

**Play it: https://horror.bidslop.com**

Trailer: https://horror.bidslop.com/trailer.mp4

An old TV in a dark room shows a live horror broadcast generated in real time by
[Orbis](https://www.visko.ai). Keep your eyes on the set. When you look away, the
thing on screen comes closer.

Built for the Visko Orbis Online Challenge (September 2026).

## How it plays

One broadcast, 2:00 AM to 3:00 AM (two real minutes). You sit on a stool in front
of the set. The mouse turns your head; the dot in the middle of the view is
where you look.

It only moves when you can't see it: when you look away, look down at the
remote, or the picture is lost to snow. It never goes back. Every few seconds
you can't see it, it comes one step closer. Reach 3:00 AM and the station signs
off.

- A glowing key on the remote is the one to press (OK to tune in, a channel
  number when the signal slips).
- Remote: click or Space raises it; click off it, right-click, Space or Esc
  lowers it. Keyboard: Enter, 1–9, +/−, O, M.

## How Orbis is used

The game rules run locally and react in the same frame; Orbis is the picture
and catches up a few seconds later, behind snow.

- `apps/web/broadcast.ts` owns the Reactor session: connects on the first input,
  `set_prompt` (passthrough) → `conditions_ready` → `start`, re-steers dread
  changes at most every 3.6 s (latest wins), and hard-cuts channel changes with
  `reset` → `set_prompt` → `start`. It retries with backoff and alternates
  `visko-orbis-stable` / `visko-orbis-dynamic` when one has no capacity.
- Prompts: one scene and motion per channel, and the figure's position per dread
  level (`CHANNELS` in `broadcast.ts`).
- `apps/web/room-tv.ts` draws the WebRTC frames through a CRT filter onto the
  3D set, with the channel OSD and clock. With no fresh
  frame it draws a local stand-by card with the figure, so a round never waits
  on the model.
- `apps/web/reactor-token.ts` mints short-lived Reactor JWTs at `POST /api/token`
  and ends sessions at `POST /api/session-end` (Vite middleware in dev,
  `worker.ts` on Cloudflare in production), so the API key stays on the server.

## Run

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Set `REACTOR_API_KEY` in `.env`. Open http://127.0.0.1:8123.

Deploy (Cloudflare Worker, key stored with `wrangler secret put REACTOR_API_KEY`):

```bash
pnpm --filter @horror-tube-live/web deploy
```

The first tune-in can take a few minutes while Reactor starts a server.
