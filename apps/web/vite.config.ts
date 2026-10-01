import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Connect } from "vite";
import {
  endReactorSession,
  mintReactorJwt,
  type SessionEndReply,
  type TokenReply,
} from "./reactor-token.ts";

const reply = (
  res: ServerResponse,
  status: number,
  body: TokenReply["body"] | SessionEndReply["body"],
): void => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk: Buffer) => (text += chunk.toString()));
    req.on("end", () => resolve(text));
    req.on("error", reject);
  });

const serverSideApi =
  (apiKey: string): Connect.NextHandleFunction =>
  (req, res, next) => {
    const path = req.url?.split("?")[0] ?? "";
    if (!path.startsWith("/api/")) return next();
    if (path !== "/api/token" && path !== "/api/session-end")
      return reply(res, 404, { error: `No route ${path}` });
    if (req.method !== "POST") return reply(res, 405, { error: "Use POST" });
    const work =
      path === "/api/token"
        ? mintReactorJwt(apiKey)
        : readBody(req).then((text) => endReactorSession(text));
    void work
      .then(({ status, body }) => {
        if (path === "/api/session-end") console.info(`session-end ${String(status)}`);
        reply(res, status, body);
      })
      .catch((err: Error) => reply(res, 500, { error: err.message }));
  };

export default defineConfig(({ mode }) => {
  const key = loadEnv(mode, "../..", "").REACTOR_API_KEY?.trim() ?? "";
  const plugin = {
    name: "reactor-token",
    configureServer: (s: { middlewares: Connect.Server }) =>
      void s.middlewares.use(serverSideApi(key)),
    configurePreviewServer: (s: { middlewares: Connect.Server }) =>
      void s.middlewares.use(serverSideApi(key)),
  };
  return {
    envDir: "../..",
    optimizeDeps: {
      exclude: ["@reactor-team/js-sdk"],
      // WARNING: pre-bundling the Reactor SDK moves it away from its .wasm and every tune-in fails.
      include: [
        "@reactor-team/js-sdk > awaitqueue",
        "@reactor-team/js-sdk > hls.js",
        "@reactor-team/js-sdk > mp4box",
        "react",
        "react/jsx-runtime",
      ],
    },
    server: { host: "127.0.0.1" },
    plugins: [plugin],
  };
});
