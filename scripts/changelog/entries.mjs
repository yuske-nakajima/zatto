import { marked } from "marked";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Compares stable package versions without lexical ordering. */
export function compareVersions(left, right) {
  if (!stableVersion.test(left) || !stableVersion.test(right))
    throw new Error("Release versions must be stable semantic versions.");
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

/** Parses release headings and preserves Markdown bodies with LF line endings. */
export function parseChangelog(markdown) {
  markdown = markdown.replace(/\r\n?/g, "\n");
  const entries = [];
  let current;
  let cursor = 0;
  for (const token of marked.lexer(markdown)) {
    const offset = markdown.indexOf(token.raw, cursor);
    if (offset < 0) throw new Error("Cannot locate changelog Markdown token.");
    cursor = offset + token.raw.length;
    const match =
      token.type === "heading" && token.depth === 2
        ? /^(?:\[v?([^\]]+)\]\([^\s)]+\)|v?(\d[^\s]*))\s+\((\d{4}-\d{2}-\d{2})\)$/.exec(
            token.text,
          )
        : null;
    if (match) {
      const version = match[1] || match[2];
      compareVersions(version, version);
      const date = match[3];
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
        throw new Error(`Invalid changelog date for ${version}.`);
      if (entries.some((entry) => entry.version === version))
        throw new Error(`Duplicate changelog entry for ${version}.`);
      if (current) current.body = markdown.slice(current.start, offset).trim();
      current = { version, date, body: "", start: cursor };
      entries.push(current);
    }
  }
  if (current) current.body = markdown.slice(current.start).trim();
  return entries.map(({ version, date, body }) => ({ version, date, body }));
}

/** Returns the approved release body shared by npm documentation and GitHub. */
export function extractReleaseNotes(markdown, version) {
  compareVersions(version, version);
  const entry = parseChangelog(markdown).find(
    (item) => item.version === version,
  );
  if (!entry?.body) throw new Error(`Missing changelog notes for ${version}.`);
  return entry.body;
}
