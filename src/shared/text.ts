export type TruncationEdge = "start" | "end";

/**
 * Unicode scalar valuesを分断せず、UTF-16コード単位の上限へ収める。
 *
 * @param value - 対象文字列
 * @param maxLength - UTF-16コード単位での最大長
 * @param edge - 保持する側
 * @returns 不正なサロゲートを置換し、指定側を保持した文字列
 */
export function truncateUnicode(
  value: string,
  maxLength: number,
  edge: TruncationEdge = "start",
): string {
  const wellFormed = toWellFormed(value);
  if (wellFormed.length <= maxLength) {
    return wellFormed;
  }
  const sliced =
    edge === "start"
      ? wellFormed.slice(0, maxLength)
      : wellFormed.slice(-maxLength);
  if (
    edge === "start" &&
    isHighSurrogate(sliced.charCodeAt(sliced.length - 1))
  ) {
    return sliced.slice(0, -1);
  }
  if (edge === "end" && isLowSurrogate(sliced.charCodeAt(0))) {
    return sliced.slice(1);
  }
  return sliced;
}

function toWellFormed(value: string): string {
  let result = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    result += isSurrogate(code) && character.length === 1 ? "�" : character;
  }
  return result;
}

function isSurrogate(code: number): boolean {
  return isHighSurrogate(code) || isLowSurrogate(code);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
