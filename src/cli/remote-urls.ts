import { type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import type { ServerRecord } from "../server/runtime.js";

const WILDCARD_HOSTS = new Set(["0.0.0.0", "::"]);

function urlHost(address: string): string {
  return address.includes(":") ? `[${address}]` : address;
}

/**
 * 外の端末から開く、トークン付きの URL を返す。
 * すべてのアドレスで待ち受けているときは、ループバック以外の IPv4 アドレスごとに返す。
 * @param record - 起動中のサーバーの runtime record
 * @param interfaces - ネットワークインターフェース。省略時は OS から取得する
 * @returns URL の一覧。外の端末を受け付けていなければ空
 */
export function remoteUrls(
  record: ServerRecord,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  if (!record.remote) return [];
  const { host, token } = record.remote;
  const addresses = WILDCARD_HOSTS.has(host)
    ? Object.values(interfaces)
        .flatMap((items) => items ?? [])
        .filter((item) => item.family === "IPv4" && !item.internal)
        .map((item) => item.address)
    : [host];
  return addresses.map(
    (address) =>
      `http://${urlHost(address)}:${record.port}/?token=${encodeURIComponent(token)}`,
  );
}
