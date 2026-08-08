import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Entry } from "./session.js";

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
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

export function contentTypeForPath(filePath: string): string {
  return (
    CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) ??
    "application/octet-stream"
  );
}

export async function renderEntryHtml(entry: Entry): Promise<string> {
  return readFile(entry.absPath, "utf8");
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
  const contentType = contentTypeForPath(resolvedPath);

  return { body, contentType };
}
