import { fileURLToPath } from "node:url";

/**
 * Command that runs the CLI of this installation with the node binary running the server,
 * so it works without zatto on PATH and matches the server version.
 * @returns Shell command with both paths double-quoted
 */
export function zattoCliCommand(): string {
  const entry = fileURLToPath(new URL("../../bin/zatto.js", import.meta.url));
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(entry)}`;
}
