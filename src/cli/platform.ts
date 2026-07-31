import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type DetachedProcess = {
  unref(): void;
};

type SpawnProcess = (
  executable: string,
  args: string[],
  options: {
    detached: true;
    stdio: "ignore";
  },
) => DetachedProcess;

export function spawnDetachedServer(
  port: number,
  instanceId: string,
  runtimeFilePath: string,
  spawnProcess: SpawnProcess = spawn,
): void {
  const serverEntry = fileURLToPath(
    new URL("../server/index.js", import.meta.url),
  );
  const child = spawnProcess(
    process.execPath,
    [
      serverEntry,
      "--port",
      String(port),
      "--instance-id",
      instanceId,
      "--runtime-file",
      runtimeFilePath,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

export function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? { executable: "open", args: [url] }
      : process.platform === "win32"
        ? { executable: "cmd", args: ["/c", "start", "", url] }
        : { executable: "xdg-open", args: [url] };

  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
