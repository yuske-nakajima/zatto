import { access } from "node:fs/promises";
import { expect, test } from "vitest";
import { zattoCliCommand } from "../src/server/zatto-cli.js";

test("動いている node と、このパッケージの bin/zatto.js を絶対パスで指す", async () => {
  const [node, entry] = JSON.parse(
    `[${zattoCliCommand().replace('" "', '", "')}]`,
  );

  expect(node).toBe(process.execPath);
  expect(entry).toMatch(/[\\/]bin[\\/]zatto\.js$/);
  await expect(access(entry)).resolves.toBeUndefined();
});
