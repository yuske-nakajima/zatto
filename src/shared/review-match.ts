import { REVIEW_LIMITS, type TextAnchor } from "./review.js";

/** 空白を除いた文字列の中の範囲。 */
export interface PassageMatch {
  start: number;
  end: number;
}

/** この文字数以上の文章は、一意に見つかれば前後の文脈が変わっていても同じ文章とみなす。 */
const SELF_IDENTIFYING_LENGTH = 16;
/** 記録した前後の文脈のうち、一致を求める文字数の割合。 */
const MIN_CONTEXT_SCORE = 0.5;
/** あいまい一致で同じ文章とみなす類似度。1 から「編集距離 / 文字数」を引いた値。 */
const MIN_SIMILARITY = 0.7;
/** これより短い文章は、数文字の違いで別の文章になるためあいまい一致を試さない。 */
const MIN_FUZZY_LENGTH = 4;
const FUZZY_CANDIDATES = 3;
/** 候補の類似度と文脈を合わせた点数の差がこれ以下なら、どちらか決められない。 */
const AMBIGUOUS_MARGIN = 0.02;

/** 空白をすべて除く。描画後の文字はソースと改行の位置が異なる。 */
export function compactText(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * 編集後の文書からコメントした文章を探す。
 * @param text - 空白を除いた文書の文字列
 * @param anchor - 記録した文章と前後の文脈
 * @returns 文字列の中の範囲。同じ文章と判断できる箇所がなければ null
 * @throws しない
 */
export function locatePassage(
  text: string,
  anchor: TextAnchor,
): PassageMatch | null {
  const exact = compactText(anchor.exact);
  if (!exact) return null;
  const prefix = compactText(anchor.prefix);
  const suffix = compactText(anchor.suffix);
  return (
    locateExact(text, exact, prefix, suffix) ??
    locateSimilar(text, exact, prefix, suffix)
  );
}

/**
 * 1 回だけ現れる一節を、前後の文脈と一緒に記録する。
 * @param text - 空白を除いた文書の文字列
 * @param passage - 記録する一節。空白を含んでもよい
 * @returns 一節をそのまま持つ anchor。1 回だけ現れるのでなければ null
 * @throws しない
 */
export function anchorAtPassage(
  text: string,
  passage: string,
): TextAnchor | null {
  const needle = compactText(passage);
  if (!needle) return null;
  const start = text.indexOf(needle);
  if (start === -1 || text.indexOf(needle, start + 1) !== -1) return null;
  const end = start + needle.length;
  return {
    exact: passage,
    prefix: text.slice(Math.max(0, start - REVIEW_LIMITS.contextLength), start),
    suffix: text.slice(end, end + REVIEW_LIMITS.contextLength),
  };
}

function locateExact(
  text: string,
  exact: string,
  prefix: string,
  suffix: string,
): PassageMatch | null {
  const starts: number[] = [];
  for (
    let at = text.indexOf(exact);
    at !== -1;
    at = text.indexOf(exact, at + 1)
  )
    starts.push(at);
  const first = starts[0];
  if (first === undefined) return null;
  const hasContext = prefix.length + suffix.length > 0;
  if (!hasContext)
    return starts.length === 1
      ? { start: first, end: first + exact.length }
      : null;
  const ranked = starts
    .map((start) => ({
      start,
      score: contextScore(text, start, start + exact.length, prefix, suffix),
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || (second && second.score === best.score)) return null;
  const isSelfIdentifying =
    starts.length === 1 && exact.length >= SELF_IDENTIFYING_LENGTH;
  if (best.score < MIN_CONTEXT_SCORE && !isSelfIdentifying) return null;
  return { start: best.start, end: best.start + exact.length };
}

function locateSimilar(
  text: string,
  exact: string,
  prefix: string,
  suffix: string,
): PassageMatch | null {
  if (exact.length < MIN_FUZZY_LENGTH) return null;
  const hasContext = prefix.length + suffix.length > 0;
  const candidates: Array<PassageMatch & { rank: number }> = [];
  for (const windowStart of similarWindows(text, exact)) {
    const match = alignPassage(text, exact, windowStart);
    if (!match || match.similarity < MIN_SIMILARITY) continue;
    const context = hasContext
      ? contextScore(text, match.start, match.end, prefix, suffix)
      : 0;
    if (exact.length < SELF_IDENTIFYING_LENGTH && context < MIN_CONTEXT_SCORE)
      continue;
    candidates.push({
      start: match.start,
      end: match.end,
      rank: match.similarity + context / 4,
    });
  }
  candidates.sort((a, b) => b.rank - a.rank);
  const best = candidates[0];
  const second = candidates[1];
  if (!best || (second && best.rank - second.rank <= AMBIGUOUS_MARGIN))
    return null;
  return { start: best.start, end: best.end };
}

/** 前後の文脈のうち、候補に隣接して一致する文字数の割合を返す。 */
function contextScore(
  text: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
): number {
  const total = prefix.length + suffix.length;
  if (!total) return 0;
  let matched = 0;
  while (
    matched < prefix.length &&
    text[start - 1 - matched] === prefix[prefix.length - 1 - matched]
  )
    matched += 1;
  let after = 0;
  while (after < suffix.length && text[end + after] === suffix[after])
    after += 1;
  return (matched + after) / total;
}

/**
 * 2 文字の組の重なりが多い、互いに重ならない範囲の先頭を返す。
 * 編集距離の計算は文書全体に対しては重いため、ここで範囲を絞る。
 */
function similarWindows(text: string, pattern: string): number[] {
  const size = Math.min(pattern.length, text.length);
  if (size < 2) return [];
  const wanted = new Map<string, number>();
  for (let index = 0; index + 1 < pattern.length; index += 1) {
    const pair = pattern.slice(index, index + 2);
    wanted.set(pair, (wanted.get(pair) ?? 0) + 1);
  }
  const remaining = new Map(wanted);
  let overlap = 0;
  const add = (pair: string) => {
    const left = remaining.get(pair);
    if (left === undefined) return;
    remaining.set(pair, left - 1);
    if (left > 0) overlap += 1;
  };
  const remove = (pair: string) => {
    const left = remaining.get(pair);
    if (left === undefined) return;
    remaining.set(pair, left + 1);
    if (left >= 0) overlap -= 1;
  };
  const overlaps = new Int32Array(text.length - size + 1);
  for (let index = 0; index + 1 < size; index += 1)
    add(text.slice(index, index + 2));
  overlaps[0] = overlap;
  for (let start = 1; start < overlaps.length; start += 1) {
    remove(text.slice(start - 1, start + 1));
    add(text.slice(start + size - 2, start + size));
    overlaps[start] = overlap;
  }
  const windows: number[] = [];
  while (windows.length < FUZZY_CANDIDATES) {
    let best = -1;
    for (let start = 0; start < overlaps.length; start += 1)
      if (
        (overlaps[start] ?? 0) > 0 &&
        (best === -1 || (overlaps[start] ?? 0) > (overlaps[best] ?? 0))
      )
        best = start;
    if (best === -1) break;
    windows.push(best);
    overlaps.fill(
      0,
      Math.max(0, best - size + 1),
      Math.min(overlaps.length, best + size),
    );
  }
  return windows;
}

/** 範囲の周辺で、文章に最も近い部分とその類似度を返す。 */
function alignPassage(
  text: string,
  pattern: string,
  windowStart: number,
): (PassageMatch & { similarity: number }) | null {
  const margin = Math.ceil(pattern.length / 2);
  const regionStart = Math.max(0, windowStart - margin);
  const region = text.slice(regionStart, windowStart + pattern.length + margin);
  const { end, distance } = bestEnd(region, pattern);
  // 終わりから逆向きに同じ計算をすると、最も近い部分の先頭が分かる
  const backward = bestEnd(
    [...region.slice(0, end)].reverse().join(""),
    [...pattern].reverse().join(""),
  );
  const length = backward.end;
  if (!length) return null;
  return {
    start: regionStart + end - length,
    end: regionStart + end,
    similarity: 1 - distance / Math.max(pattern.length, length),
  };
}

/** 文章を部分文字列として照合する編集距離（Sellers 法）で、最も近い部分の終わりを返す。 */
function bestEnd(
  text: string,
  pattern: string,
): { end: number; distance: number } {
  let column = Int32Array.from(
    { length: pattern.length + 1 },
    (_, index) => index,
  );
  let best = { end: 0, distance: pattern.length };
  for (let at = 0; at < text.length; at += 1) {
    const next = new Int32Array(pattern.length + 1);
    for (let row = 1; row <= pattern.length; row += 1) {
      const cost = pattern[row - 1] === text[at] ? 0 : 1;
      next[row] = Math.min(
        (column[row - 1] ?? 0) + cost,
        (column[row] ?? 0) + 1,
        (next[row - 1] ?? 0) + 1,
      );
    }
    const distance = next[pattern.length] ?? 0;
    if (distance < best.distance) best = { end: at + 1, distance };
    column = next;
  }
  return best;
}
