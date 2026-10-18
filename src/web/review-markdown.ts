import { Marked, type Tokens } from "marked";

const ALLOWED_LINK = /^(?:https?:|mailto:)/i;

/**
 * Renders the Markdown subset LLM replies may use: paragraphs, lists, bold, inline code, code blocks, and links.
 * Other syntax and raw HTML are shown as their source text, so a reply cannot inject markup.
 */
const replyMarkdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    heading: ({ raw }) => `<p>${escapeHtml(raw.trim())}</p>`,
    table: ({ raw }) => `<p>${escapeHtml(raw.trim())}</p>`,
    blockquote: ({ raw }) => `<p>${escapeHtml(raw.trim())}</p>`,
    hr: ({ raw }) => `<p>${escapeHtml(raw.trim())}</p>`,
    code: ({ text }) =>
      `<div class="review-code"><button type="button" class="review-code-copy" data-review-copy>Copy</button><pre><code>${escapeHtml(text)}</code></pre></div>`,
    html: ({ raw }) => escapeHtml(raw),
    image: ({ raw }) => escapeHtml(raw),
    em: ({ raw }) => escapeHtml(raw),
    del: ({ raw }) => escapeHtml(raw),
    link(token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      if (!ALLOWED_LINK.test(token.href)) return text;
      return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/** Converts an LLM reply to HTML limited to the reply Markdown subset. */
export function renderReplyMarkdown(body: string): string {
  return replyMarkdown.parse(body, { async: false });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
