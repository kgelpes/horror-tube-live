import * as v from "valibot";

const MODELS = ["reactor/visko-orbis-stable", "reactor/visko-orbis-dynamic"];
const SESSION_SECONDS = 300;

export type TokenReply = { status: number; body: { jwt: string } | { error: string } };
const Minted = v.object({ jwt: v.string() });

export async function mintReactorJwt(apiKey: string): Promise<TokenReply> {
  if (apiKey === "") return { status: 500, body: { error: "REACTOR_API_KEY is not configured" } };
  let res: Response;
  try {
    res = await fetch("https://api.reactor.inc/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Reactor-API-Key": apiKey },
      body: JSON.stringify({
        expires_after: 3600,
        authorization_details: [
          {
            type: "session",
            resources: { models: { match: MODELS } },
            constraints: { max_sessions: 10, max_session_duration_seconds: SESSION_SECONDS },
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: 502, body: { error: `Could not reach Reactor: ${detail}` } };
  }
  const text = await res.text();
  if (!res.ok)
    return {
      status: res.status,
      body: { error: `Reactor token request failed (${String(res.status)}): ${text}` },
    };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: 502, body: { error: `Reactor token reply is not JSON: ${text}` } };
  }
  const minted = v.safeParse(Minted, json);
  return minted.success
    ? { status: 200, body: { jwt: minted.output.jwt } }
    : { status: 502, body: { error: `Reactor returned no JWT: ${text}` } };
}

const SessionEnd = v.object({
  sessionId: v.pipe(v.string(), v.minLength(8), v.maxLength(4096)),
  jwt: v.pipe(v.string(), v.minLength(8), v.maxLength(4096)),
});
export type SessionEndReply = { status: number; body: { ended: string } | { error: string } };

export async function endReactorSession(input: string): Promise<SessionEndReply> {
  let raw: v.InferInput<typeof SessionEnd>;
  try {
    raw = v.parse(SessionEnd, JSON.parse(input));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: 400, body: { error: `Bad session-end body: ${detail}` } };
  }
  const { sessionId, jwt } = raw;
  try {
    const res = await fetch(`https://api.reactor.inc/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200 || res.status === 404)
      return { status: 200, body: { ended: `${sessionId} (${String(res.status)})` } };
    const text = await res.text();
    return {
      status: res.status,
      body: { error: `Reactor session delete failed (${String(res.status)}): ${text}` },
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: 502, body: { error: `Could not reach Reactor: ${detail}` } };
  }
}
