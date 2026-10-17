import { Marked } from "marked";
import { MARKDOWN_TASK_MESSAGE } from "../shared/markdown-task-message.js";
import { findMarkdownTasks, markdownRevision } from "./markdown-tasks.js";

/** Published paths of the bundled theme and diagram renderer under /assets. */
export const MARKDOWN_VENDOR_ASSETS = {
  lightTheme: "/assets/vendor/github-markdown-light.css",
  darkTheme: "/assets/vendor/github-markdown-dark.css",
  mermaid: "/assets/vendor/mermaid.min.js",
} as const;

const TASK_ATTRIBUTE = /\sdata-task="\d+"/g;

function renderBody(source: string): { body: string; editableTasks: boolean } {
  const rendered: boolean[] = [];
  const markdown = new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) {
        if (lang?.trim().toLowerCase() !== "mermaid") return false;
        return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
      },
      checkbox({ checked }) {
        rendered.push(checked);
        return `<input type="checkbox" data-task="${rendered.length - 1}"${checked ? " checked" : ""} disabled> `;
      },
    },
  });
  const body = markdown.parse(source, { async: false });
  const tasks = findMarkdownTasks(source);
  const editableTasks =
    rendered.length > 0 &&
    rendered.length === tasks.length &&
    tasks.every((task, index) => task.checked === rendered[index]);
  return {
    body: editableTasks ? body : body.replace(TASK_ATTRIBUTE, ""),
    editableTasks,
  };
}

/**
 * Renders a Markdown file as a standalone HTML document whose only editable part is task checkboxes.
 * Relative links and images resolve against the entry URL, so the viewer's asset route serves them.
 * Embedded HTML is kept as written, matching how registered HTML files are displayed.
 * Task checkboxes stay disabled unless each one maps to a task marker found in the source.
 * @param source - Markdown text
 * @param title - Display title
 * @returns Complete HTML document
 * @throws Never
 */
export function renderMarkdownDocument(source: string, title: string): string {
  const { body, editableTasks } = renderBody(source);
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
<article class="markdown-body" data-revision="${markdownRevision(source)}">
${body}</article>
${hasDiagram ? diagramScript() : ""}${editableTasks ? taskScript() : ""}</body>
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
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme: scheme.matches ? "dark" : "default" });
    for (const [index, node] of nodes.entries()) {
      const id = "zatto-diagram-" + current + "-" + index;
      try {
        const { svg } = await mermaid.render(id, sources[index]);
        if (current === generation) node.innerHTML = svg;
      } catch (error) {
        // mermaid.render は失敗時に描画用の一時要素 "d" + id を body に残す
        document.getElementById("d" + id)?.remove();
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

/** Forwards checkbox changes to the viewer, which saves them through the shared RPC client. */
function taskScript(): string {
  return `<script>
(() => {
  // 単独で開いたページには保存先の画面がないため、チェックボックスは無効のままにする
  if (window.parent === window) return;
  const article = document.querySelector("article.markdown-body");
  const entryId = decodeURIComponent(location.pathname.split("/")[2] ?? "");
  const inputs = [...document.querySelectorAll("input[data-task]")];
  for (const input of inputs) {
    input.disabled = false;
    input.addEventListener("change", () => {
      for (const other of inputs) other.disabled = true;
      window.parent.postMessage({
        type: "${MARKDOWN_TASK_MESSAGE.request}",
        entryId,
        index: Number(input.dataset.task),
        checked: input.checked,
        revision: article.dataset.revision,
      }, location.origin);
    });
  }
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const result = event.data;
    if (result?.type !== "${MARKDOWN_TASK_MESSAGE.result}") return;
    if (!result.ok) return location.reload();
    article.dataset.revision = result.revision;
    for (const input of inputs) input.disabled = false;
  });
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
