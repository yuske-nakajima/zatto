import type { FastifyInstance } from "fastify";

/** サーバーが待ち受けるループバックのホスト名。ポートは照合しない。 */
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

function loopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function loopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * DNS rebinding とほかのサイトからの WebSocket 接続を拒否する。
 * rebinding されたページはブラウザー上で同じオリジンになるため、Host ヘッダーで見分ける。
 * WebSocket は同一オリジンポリシーの対象外のため、ブラウザーが付ける Origin を照合する。
 * Origin を付けない Node の接続（`zatto review`）は受け付ける。
 * @param app - HTTP application
 * @returns Nothing
 * @throws Never
 */
export function registerOriginGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const { host, origin } = request.headers;
    if (!loopbackHost(host))
      return reply.code(403).send({ message: "Host not allowed" });
    if (
      request.url.split("?")[0] === "/ws" &&
      origin !== undefined &&
      !loopbackOrigin(origin)
    )
      return reply.code(403).send({ message: "Origin not allowed" });
  });
}
