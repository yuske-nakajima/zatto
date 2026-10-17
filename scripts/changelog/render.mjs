import { JSDOM } from "jsdom";

const allowed = new Set([
  "p",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "pre",
  "code",
  "strong",
  "em",
  "del",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "details",
  "summary",
  "br",
  "hr",
  "a",
]);
const discarded = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "template",
  "img",
  "video",
  "audio",
  "source",
  "link",
  "meta",
]);
const voidTags = new Set(["br", "hr"]);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/**
 * Reconstructs inert markup with an allowlist and HTTPS-only links.
 * @param {string} html - Untrusted GitHub-rendered release body
 * @returns {string} Sanitized HTML without external resource loads
 * @throws When the HTML parser cannot initialize
 */
export function sanitizeReleaseHtml(html) {
  const fragment = JSDOM.fragment(html);
  function render(node) {
    if (node.nodeType === 3) return escapeHtml(node.textContent);
    if (node.nodeType !== 1) return "";
    const name = node.localName === "tt" ? "code" : node.localName;
    if (discarded.has(name)) return "";
    const children = Array.from(node.childNodes, render).join("");
    if (!allowed.has(name)) return children;
    if (name === "a") {
      const href = httpsUrl(node.getAttribute("href"));
      return href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${children}</a>`
        : children;
    }
    return `<${name}>${children}${voidTags.has(name) ? "" : `</${name}>`}`;
  }
  return Array.from(fragment.childNodes, render).join("");
}
/**
 * Renders a deterministic offline release-history document.
 * @param {import("./render.mjs").ReleaseSnapshot} snapshot - Captured public releases
 * @param {import("./render.mjs").PendingRelease} pending - Explicitly unreleased notes
 * @param {"en" | "ja"} locale - Page language; release bodies retain their original text
 * @returns {string} Complete standalone HTML
 * @throws When release body parsing fails
 */
export function renderChangelog(snapshot, pending, locale) {
  const ja = locale === "ja";
  const title = ja ? "変更履歴" : "Changelog";
  const intro = ja
    ? "GitHub Releasesの公開済み履歴を同梱しています。本文は原文のまま掲載し、オフラインで読めます。リンク先を開く場合は通信が必要です。"
    : "Published GitHub Releases are bundled for offline reading. Release bodies retain their original language. Opening source links requires a connection.";
  const isPublished = snapshot.releases.some(
    (release) =>
      release.tag === pending.version || release.tag === `v${pending.version}`,
  );
  const notes = pending[locale];
  const upcoming = isPublished
    ? ""
    : `<section class="pending" data-unreleased="${escapeHtml(pending.version)}"><h2>${escapeHtml(pending.version)} — ${ja ? "未公開" : "Unreleased"}</h2><p>${ja ? "この項目は公開済みリリースではありません。" : "This section is not a published release."}</p><ul>${notes.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>${ja ? "更新手順" : "Upgrade steps"}</h3><ol>${notes.upgrade.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ol></section>`;
  const releases = snapshot.releases
    .map((release) => {
      const url = httpsUrl(release.url);
      const link = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${ja ? "GitHubでリリースを開く" : "View release on GitHub"}</a>`
        : "";
      return `<article data-release="${escapeHtml(release.tag)}"><header><h2>${escapeHtml(release.name || release.tag)}</h2><p class="metadata"><code>${escapeHtml(release.tag)}</code> · <time datetime="${escapeHtml(release.publishedAt)}">${escapeHtml(release.publishedAt.slice(0, 10))}</time> · ${link}</p></header><div class="release-body">${sanitizeReleaseHtml(release.bodyHtml)}</div></article>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | zatto</title>
<style>
:root { color-scheme: light dark; font: 16px/1.65 system-ui, sans-serif; }
body { margin: 0; color: CanvasText; background: Canvas; }
main { max-width: 820px; margin: auto; padding: 32px 24px 64px; }
h1 { margin: 0 0 8px; font-size: 2rem; } h2 { font-size: 1.35rem; } h3 { font-size: 1.1rem; }
article { margin-top: 32px; padding-top: 24px; border-top: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); }
.metadata, .lead { color: color-mix(in srgb, CanvasText 72%, Canvas); }
a { color: LinkText; overflow-wrap: anywhere; }
code { padding: 2px 5px; border-radius: 4px; background: color-mix(in srgb, CanvasText 9%, Canvas); overflow-wrap: anywhere; }
pre { overflow: auto; padding: 14px 16px; border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); border-radius: 8px; } pre code { padding: 0; background: transparent; }
.pending { margin-top: 24px; padding: 16px 20px; border: 1px solid color-mix(in srgb, CanvasText 25%, Canvas); border-radius: 8px; }
table { width: 100%; border-collapse: collapse; } th, td { padding: 8px; border-bottom: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); text-align: left; }
@media (max-width: 620px) { main { padding: 24px 18px 48px; } }
</style></head>
<body><main><h1>${title}</h1><p class="lead">${intro}</p>${upcoming}<section aria-label="${ja ? "公開済みリリース" : "Published releases"}">${releases}</section></main></body>
</html>
`;
}
