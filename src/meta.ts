import { readFileSync } from "node:fs";

interface PackageManifest {
  version?: unknown;
}

export const APP_NAME = "zatto";
export const APP_VERSION = readPackageVersion();

function readPackageVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as PackageManifest;
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("package.jsonのversionが不正です");
  }
  return manifest.version;
}
