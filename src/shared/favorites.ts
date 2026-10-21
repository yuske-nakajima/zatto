import type { Entry } from "../server/session.js";

/**
 * お気に入りを、お気に入りの順に並べて返す。List の順とは別に持つ。
 * 順を持たないお気に入り（順を持つ前に保存したもの）は、順を持つものの後ろに List の順で並べる。
 * @param entries - List の順のエントリ
 * @returns お気に入りの順のお気に入り
 */
export function orderedFavorites<T extends Entry>(entries: T[]): T[] {
  const favorites = entries.filter((entry) => entry.favorite);
  const ranked = favorites
    .filter((entry) => entry.favoriteRank !== undefined)
    .sort((a, b) => (a.favoriteRank ?? 0) - (b.favoriteRank ?? 0));
  return [
    ...ranked,
    ...favorites.filter((entry) => entry.favoriteRank === undefined),
  ];
}
