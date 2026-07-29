import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Entry } from "./session.js";

const LIVE_RELOAD_SCRIPT = `<script>
(() => {
  if (window.__zattoLiveReloadLoaded) return;
  window.__zattoLiveReloadLoaded = true;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = protocol + "//" + location.host + "/ws";
  try {
    const socket = new WebSocket(url);
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === "file:changed" && data.entryId === "__ENTRY_ID__") {
          location.reload();
        }
      } catch {}
    });
  } catch {}
})();
</script>`;

const CONTENT_TYPES = new Map<string, string>([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

export function injectLiveReload(html: string, entryId: string): string {
  const script = LIVE_RELOAD_SCRIPT.replace("__ENTRY_ID__", entryId);
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${html}${script}`;
}

export async function renderEntryHtml(entry: Entry): Promise<string> {
  const html = await readFile(entry.absPath, "utf8");
  return injectLiveReload(html, entry.id);
}

export function resolveAssetPath(
  entry: Entry,
  requestPath: string,
): string | null {
  const baseDir = path.dirname(entry.absPath);
  const normalizedPath = requestPath.length > 0 ? requestPath : ".";
  const resolvedPath = path.resolve(baseDir, normalizedPath);
  const relativePath = path.relative(baseDir, resolvedPath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    relativePath === ""
  ) {
    return null;
  }

  return resolvedPath;
}

export async function readAsset(
  entry: Entry,
  requestPath: string,
): Promise<{
  body: Buffer;
  contentType: string;
} | null> {
  const resolvedPath = resolveAssetPath(entry, requestPath);
  if (!resolvedPath) {
    return null;
  }

  const body = await readFile(resolvedPath);
  const contentType =
    CONTENT_TYPES.get(path.extname(resolvedPath).toLowerCase()) ??
    "application/octet-stream";

  return { body, contentType };
}
