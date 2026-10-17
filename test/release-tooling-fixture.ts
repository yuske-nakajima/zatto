import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Stage release tools with pnpm-style links using the production staging entry point.
 * @param sourceRepository Repository containing the workflow control scripts.
 * @param directory Temporary controller checkout.
 * @param crossDevice Whether to simulate a cross-device rename failure.
 * @returns Absolute staging directory.
 * @throws If staging fails or fixture files cannot be written.
 */
export async function stageReleaseToolingFixture(
  sourceRepository: string,
  directory: string,
  crossDevice = false,
): Promise<string> {
  await cp(
    path.join(sourceRepository, "scripts/release"),
    path.join(directory, "scripts/release"),
    { recursive: true },
  );
  await cp(
    path.join(sourceRepository, "scripts/changelog/entries.mjs"),
    path.join(directory, "scripts/changelog/entries.mjs"),
    { recursive: true },
  );
  await mkdir(path.join(directory, "node_modules/.pnpm"), { recursive: true });
  await symlink(
    path.join(sourceRepository, "node_modules/marked"),
    path.join(directory, "node_modules/.pnpm/marked"),
  );
  await symlink(".pnpm/marked", path.join(directory, "node_modules/marked"));
  const preload = path.join(directory, "cross-device.mjs");
  await writeFile(
    preload,
    `import fs from 'node:fs/promises';\nimport { syncBuiltinESMExports } from 'node:module';\nfs.rename = async () => { throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' }); };\nsyncBuiltinESMExports();\n`,
  );
  const staged = path.join(directory, "staged");
  execFileSync(
    process.execPath,
    [
      ...(crossDevice ? ["--import", preload] : []),
      path.join(directory, "scripts/release/stage.mjs"),
    ],
    { env: { ...process.env, ZATTO_RELEASE_TOOLING: staged } },
  );
  await rm(path.join(directory, "node_modules"), {
    recursive: true,
    force: true,
  });
  return staged;
}
