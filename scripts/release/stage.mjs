import { cp, mkdir, rename } from "node:fs/promises";
import path from "node:path";

const source = path.resolve(import.meta.dirname, "../..");
const destination = process.env.ZATTO_RELEASE_TOOLING;
if (!destination || !path.isAbsolute(destination)) {
  throw new Error("Release tooling requires an absolute staging directory");
}
await mkdir(destination);
await mkdir(path.join(destination, "scripts/changelog"), { recursive: true });
await cp(
  path.join(source, "scripts/release"),
  path.join(destination, "scripts/release"),
  { recursive: true },
);
await cp(
  path.join(source, "scripts/changelog/entries.mjs"),
  path.join(destination, "scripts/changelog/entries.mjs"),
);
try {
  await rename(
    path.join(source, "node_modules"),
    path.join(destination, "node_modules"),
  );
} catch (error) {
  if (error.code !== "EXDEV") throw error;
  await cp(
    path.join(source, "node_modules"),
    path.join(destination, "node_modules"),
    { recursive: true, verbatimSymlinks: true },
  );
}
