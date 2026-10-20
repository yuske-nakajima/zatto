/** 返信の本文から、同じ返信の添付を指す画像の参照。`attachment:1` が 1 枚目を指す。 */
export const REVIEW_ATTACHMENT_SCHEME = "attachment:";

const REFERENCE = /^attachment:(\d+)$/;

/**
 * 画像の参照が指す添付の位置を返す。
 * @param href - 画像の参照
 * @returns 0 始まりの位置。添付を指していなければ null
 */
export function attachmentIndex(href: string): number | null {
  const match = REFERENCE.exec(href);
  return match ? Number(match[1]) - 1 : null;
}
