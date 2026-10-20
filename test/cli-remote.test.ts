import { describe, expect, test } from "vitest";
import { parseCliArgs } from "../src/cli/args.js";
import { remoteUrls } from "../src/cli/remote-urls.js";

const record = {
  protocolVersion: 4,
  instanceId: "i",
  processFingerprint: "f",
  pid: 1,
  port: 6280,
};

describe("--host", () => {
  test("アドレスを受け取り、空の指定を拒否する", () => {
    expect(parseCliArgs(["--host", "100.64.0.1"]).host).toBe("100.64.0.1");
    expect(parseCliArgs([]).host).toBeNull();
    expect(() => parseCliArgs(["--host", " "])).toThrow("--host");
  });

  test("外の端末から開くトークン付きの URL を返す", () => {
    expect(remoteUrls(record)).toEqual([]);
    expect(
      remoteUrls({ ...record, remote: { host: "100.64.0.1", token: "a+b" } }),
    ).toEqual(["http://100.64.0.1:6280/?token=a%2Bb"]);
    expect(
      remoteUrls({ ...record, remote: { host: "fd7a::1", token: "t" } }),
    ).toEqual(["http://[fd7a::1]:6280/?token=t"]);
  });

  test("すべてのアドレスで待ち受けるときは、ループバック以外の IPv4 ごとに返す", () => {
    const address = (value: string, internal: boolean, family = "IPv4") => ({
      address: value,
      netmask: "",
      family,
      mac: "",
      internal,
      cidr: null,
    });
    expect(
      remoteUrls({ ...record, remote: { host: "0.0.0.0", token: "t" } }, {
        lo0: [address("127.0.0.1", true)],
        en0: [
          address("192.168.1.16", false),
          address("fe80::1", false, "IPv6"),
        ],
        utun0: [address("100.64.0.1", false)],
      } as never),
    ).toEqual([
      "http://192.168.1.16:6280/?token=t",
      "http://100.64.0.1:6280/?token=t",
    ]);
  });
});
