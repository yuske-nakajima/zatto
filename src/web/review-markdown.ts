import { Marked, type Tokens } from "marked";
import {
  type ReviewAttachment,
  reviewAttachmentFileName,
} from "../shared/review.js";
import { attachmentIndex } from "../shared/review-image-ref.js";

const ALLOWED_LINK = /^(?:https?:|mailto:)/i;

/**
 * LLM の返信を GFM として描画する。
 * 生の HTML は文字のまま出し、リンクは http・https・mailto だけにする。
 * 画像は同じ返信の添付（`attachment:N`）だけを描画し、URL やパスは読み込まずに alt だけを出す。
 */
function replyMarkdown(attachments: ReviewAttachment[]): Marked {
  return new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      code: ({ text }) =>
        `<div class="review-code"><button type="button" class="review-code-copy" data-review-copy>Copy</button><pre><code>${escapeHtml(text)}</code></pre></div>`,
      html: ({ raw }) => escapeHtml(raw),
      image({ href, text }: Tokens.Image) {
        const index = attachmentIndex(href);
        const attachment = index === null ? undefined : attachments[index];
        if (!attachment) return escapeHtml(text);
        return `<button type="button" class="review-inline-image" data-review-zoom="${index}" aria-label="Enlarge ${escapeHtml(attachment.name)}"><img src="/review-attachments/${escapeHtml(reviewAttachmentFileName(attachment))}" alt="${escapeHtml(text || attachment.name)}"></button>`;
      },
      link(token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens);
        if (!ALLOWED_LINK.test(token.href)) return text;
        return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
    },
  });
}

/**
 * LLM の返信を HTML に変える。
 * @param body - 返信の本文
 * @param attachments - 同じ返信の添付。本文の `attachment:N` が指す
 * @returns 描画する HTML
 */
export function renderReplyMarkdown(
  body: string,
  attachments: ReviewAttachment[] = [],
): string {
  return replyMarkdown(attachments).parse(body, { async: false });
}

/**
 * 本文の中で描画する添付の位置。本文で描画した添付は、本文の下に重ねて並べない。
 * @param body - 返信の本文
 * @returns 0 始まりの位置
 */
export function inlineAttachmentIndexes(body: string): Set<number> {
  const indexes = new Set<number>();
  for (const match of body.matchAll(/!\[[^\]]*\]\(attachment:(\d+)\)/g))
    indexes.add(Number(match[1]) - 1);
  return indexes;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
