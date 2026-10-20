import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Lexer, type Token, type Tokens } from "marked";
import {
  REVIEW_LIMITS,
  type ReviewAttachmentUpload,
  type ReviewImageType,
} from "../shared/review.js";
import { REVIEW_ATTACHMENT_SCHEME } from "../shared/review-image-ref.js";

const IMAGE_TYPES: Record<string, ReviewImageType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
/** 手元のファイルとして読まない画像の参照。 */
const NOT_LOCAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** 添付に変えた返信。 */
export interface ReplyWithImages {
  body: string;
  attachments: ReviewAttachmentUpload[];
}

function imageHrefs(body: string): Tokens.Image[] {
  const images: Tokens.Image[] = [];
  const visit = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === "image") images.push(token as Tokens.Image);
      if ("tokens" in token && token.tokens) visit(token.tokens);
      if (token.type === "list")
        for (const item of (token as Tokens.List).items) visit(item.tokens);
    }
  };
  visit(new Lexer({ gfm: true }).lex(body));
  return images;
}

async function upload(file: string): Promise<ReviewAttachmentUpload> {
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
  if (!type)
    throw new Error(
      `添付できる画像は PNG・JPEG・WebP・GIF だけです: ${path.basename(file)}`,
    );
  const { size } = await stat(file).catch(() => {
    throw new Error(`画像が見つかりません: ${path.basename(file)}`);
  });
  if (size > REVIEW_LIMITS.attachmentBytes)
    throw new Error(
      `画像は 1 枚 ${REVIEW_LIMITS.attachmentBytes / 1024 / 1024}MB までです: ${path.basename(file)}`,
    );
  return {
    // 元のパスを残さないため、ファイル名だけを送る
    name: path.basename(file),
    type,
    data: (await readFile(file)).toString("base64"),
  };
}

/**
 * 返信の本文にある手元の画像と、別に指定した画像を添付に変える。
 * 本文の `![alt](手元のパス)` は `![alt](attachment:N)` に置き換え、添付の位置で描画させる。
 * 元のパスは本文にも添付にも残さない。URL の画像はそのまま残し、画面では alt だけを出す。
 * @param body - 返信の本文
 * @param files - 本文とは別に添付する画像のパス
 * @param cwd - 相対パスの基準
 * @returns 書き換えた本文と添付
 * @throws 画像を読めない、種類・大きさ・枚数が制限を超える場合
 */
export async function replyWithImages(
  body: string,
  files: string[] = [],
  cwd = process.cwd(),
): Promise<ReplyWithImages> {
  const attachments: ReviewAttachmentUpload[] = [];
  let rewritten = body;
  for (const image of imageHrefs(body)) {
    const href = decodeURI(image.href);
    if (NOT_LOCAL.test(href)) continue;
    attachments.push(await upload(path.resolve(cwd, href)));
    rewritten = rewritten.replace(
      image.raw,
      `![${image.text}](${REVIEW_ATTACHMENT_SCHEME}${attachments.length})`,
    );
  }
  for (const file of files)
    attachments.push(await upload(path.resolve(cwd, file)));
  if (attachments.length > REVIEW_LIMITS.attachmentsPerComment)
    throw new Error(
      `画像は 1 件の返信に ${REVIEW_LIMITS.attachmentsPerComment} 枚までです`,
    );
  return { body: rewritten, attachments };
}
