import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { FastifyInstance, FastifyRequest } from "fastify";

/** サーバーが待ち受けるループバックのホスト名。ポートは照合しない。 */
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** 外の端末の認証に使う Cookie の名前。 */
export const REMOTE_TOKEN_COOKIE = "zatto_token";

/** `--host` で外の端末からの閲覧を受け付けるときの設定。 */
export interface RemoteAccess {
  /** 待ち受けるアドレス。 */
  host: string;
  /** 外の端末が `?token=` で示す値。 */
  token: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** 外の端末からの要求か。ループバックのアドレスから届いた要求は false。 */
    remote: boolean;
  }
}

/**
 * 接続元のアドレスがループバックか。
 * テストの注入要求のように接続元がないものは、ループバックとして扱う。
 */
export function loopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return true;
  const ipv4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(ipv4) === 4) return ipv4.startsWith("127.");
  return address === "::1";
}

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

function sameOrigin(origin: string, host: string | undefined): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && url.host === host;
  } catch {
    return false;
  }
}

function sameToken(value: string | undefined, token: string): boolean {
  if (value === undefined) return false;
  const actual = Buffer.from(value);
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function cookieValue(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name)
      return part.slice(separator + 1).trim();
  }
  return undefined;
}

function pathOf(request: FastifyRequest): string {
  return request.url.split("?")[0] ?? "";
}

/**
 * 接続元に応じて要求を検証する。
 * ループバックからの要求は、DNS rebinding を防ぐため Host がループバックのホスト名であることを確かめる。
 * rebinding されたページはブラウザー上で同じオリジンになるため、Host ヘッダーで見分ける。
 * WebSocket は同一オリジンポリシーの対象外のため、ブラウザーが付ける Origin も照合する。
 * Origin を付けない Node の接続（`zatto review`）は受け付ける。
 * 外の端末からの要求は、トークンを Cookie で示したものだけを受け付ける。
 * Cookie はホスト名ごとに保存され SameSite=Strict のため、rebinding や別のサイトからの要求には付かない。
 * @param app - HTTP application
 * @param remote - 外の端末を受け付けるときの設定。省略時は外からの要求をすべて拒否する
 * @returns Nothing
 * @throws Never
 */
export function registerAccessGuard(
  app: FastifyInstance,
  remote?: RemoteAccess,
): void {
  app.decorateRequest("remote", false);
  app.addHook("onRequest", async (request, reply) => {
    const { host, origin } = request.headers;
    const isWebSocket = pathOf(request) === "/ws";
    if (loopbackAddress(request.raw.socket?.remoteAddress)) {
      if (!loopbackHost(host))
        return reply.code(403).send({ message: "Host not allowed" });
      if (isWebSocket && origin !== undefined && !loopbackOrigin(origin))
        return reply.code(403).send({ message: "Origin not allowed" });
      return;
    }

    request.remote = true;
    if (!remote) return reply.code(403).send({ message: "Remote not allowed" });
    const query = request.query as Record<string, unknown>;
    const queryToken = typeof query.token === "string" ? query.token : null;
    if (queryToken !== null && sameToken(queryToken, remote.token)) {
      reply.header(
        "set-cookie",
        `${REMOTE_TOKEN_COOKIE}=${remote.token}; Path=/; HttpOnly; SameSite=Strict`,
      );
      if (request.method === "GET" && !isWebSocket) {
        const url = new URL(request.url, "http://zatto");
        url.searchParams.delete("token");
        return reply.redirect(`${url.pathname}${url.search}`, 302);
      }
      return;
    }
    if (
      !sameToken(
        cookieValue(request.headers.cookie, REMOTE_TOKEN_COOKIE),
        remote.token,
      )
    )
      return reply.code(401).send({ message: "Token required" });
    if (isWebSocket && (origin === undefined || !sameOrigin(origin, host)))
      return reply.code(403).send({ message: "Origin not allowed" });
    if (pathOf(request).startsWith("/review-attachments/"))
      return reply.code(403).send({ message: "Not available remotely" });
  });
}
