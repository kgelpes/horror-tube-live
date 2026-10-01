import {
  endReactorSession,
  mintReactorJwt,
  type SessionEndReply,
  type TokenReply,
} from "./reactor-token.ts";

type Env = {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  TOKEN_LIMIT: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  REACTOR_API_KEY: string;
};

const json = (status: number, body: TokenReply["body"] | SessionEndReply["body"]): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (url.pathname !== "/api/token" && url.pathname !== "/api/session-end")
      return json(404, { error: `No route ${url.pathname}` });
    if (req.method !== "POST") return json(405, { error: "Use POST" });
    if (url.pathname === "/api/session-end") {
      const { status, body } = await endReactorSession(await req.text());
      if (status !== 200) console.error(`Session end failed: ${JSON.stringify(body)}`);
      return json(status, body);
    }
    const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.TOKEN_LIMIT.limit({ key: ip });
    if (!success)
      return json(429, { error: "Too many tune-ins from this address. Wait a minute." });
    const { status, body } = await mintReactorJwt(env.REACTOR_API_KEY);
    if (status !== 200) console.error(`Token mint failed for ${ip}: ${JSON.stringify(body)}`);
    return json(status, body);
  },
};
