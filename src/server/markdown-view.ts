import { Marked } from "marked";

/** Published paths of the bundled theme and diagram renderer under /assets. */
export const MARKDOWN_VENDOR_ASSETS = {
  lightTheme: "/assets/vendor/github-markdown-light.css",
  darkTheme: "/assets/vendor/github-markdown-dark.css",
  mermaid: "/assets/vendor/mermaid.min.js",
} as const;

const markdown = new Marked({
  gfm: true,
  renderer: {
    code({ text, lang }) {
      if (lang?.trim().toLowerCase() !== "mermaid") return false;
      return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
    },
  },
});

/**
 * Renders a Markdown file as a standalone, read-only HTML document.
 * Relative links and images resolve against the entry URL, so the viewer's asset route serves them.
 * Embedded HTML is kept as written, matching how registered HTML files are displayed.
 * @param source - Markdown text
 * @param title - Display title
 * @returns Complete HTML document
 * @throws Never
 */
export function renderMarkdownDocument(source: string, title: string): string {
  const body = markdown.parse(source, { async: false });
  const hasDiagram = body.includes('<pre class="mermaid">');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${MARKDOWN_VENDOR_ASSETS.lightTheme}" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="${MARKDOWN_VENDOR_ASSETS.darkTheme}" media="(prefers-color-scheme: dark)">
<style>
html, body { margin: 0; }
body { background-color: Canvas; }
.markdown-body { box-sizing: border-box; min-height: 100vh; max-width: 980px; margin: 0 auto; padding: 32px 45px; }
.markdown-body pre.mermaid { background: transparent; text-align: center; }
.markdown-body pre.mermaid:has(.zatto-diagram-error) { text-align: left; }
.markdown-body .zatto-diagram-error { color: #d1242f; white-space: pre-wrap; }
@media (max-width: 767px) { .markdown-body { padding: 16px; } }
</style>
</head>
<body>
<article class="markdown-body">
${body}</article>
${hasDiagram ? diagramScript() : ""}</body>
</html>
`;
}

/** Renders diagrams with the scheme's theme and shows the source with the error when parsing fails. */
function diagramScript(): string {
  return `<script src="${MARKDOWN_VENDOR_ASSETS.mermaid}"></script>
<script>
(() => {
  const nodes = [...document.querySelectorAll("pre.mermaid")];
  const sources = nodes.map((node) => node.textContent ?? "");
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  let generation = 0;
  async function render() {
    const current = ++generation;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: scheme.matches ? "dark" : "default" });
    for (const [index, node] of nodes.entries()) {
      try {
        const { svg } = await mermaid.render("zatto-diagram-" + current + "-" + index, sources[index]);
        if (current === generation) node.innerHTML = svg;
      } catch (error) {
        if (current !== generation) return;
        const message = document.createElement("div");
        message.className = "zatto-diagram-error";
        message.textContent = "Mermaid: " + (error instanceof Error ? error.message : String(error));
        const code = document.createElement("code");
        code.textContent = sources[index];
        node.replaceChildren(message, code);
      }
    }
  }
  scheme.addEventListener("change", () => void render());
  void render();
})();
</script>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
