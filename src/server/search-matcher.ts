import path from "node:path";
import type {
  SearchFileResult,
  SearchLineMatch,
  SearchMatchRange,
} from "../shared/search.js";
import { SEARCH_LIMITS } from "./search-constants.js";
import { readBoundedHtml } from "./search-file.js";
import type { Entry } from "./session.js";

interface SearchBudget {
  remainingMatches: number;
  remainingChars: number;
  remainingBytes: number;
}

export interface SearchEntryOutcome {
  result: SearchFileResult;
  usedMatches: number;
  usedChars: number;
  usedBytes: number;
  stopAll: boolean;
}

export async function searchEntry(
  entry: Entry,
  query: string,
  budget: SearchBudget,
): Promise<SearchEntryOutcome> {
  const read = await readBoundedHtml(entry, budget.remainingBytes);
  if (read.html === null) {
    return {
      result: createFileResult(entry, true, 0, []),
      usedMatches: 0,
      usedChars: 0,
      usedBytes: read.bytesRead,
      stopAll: true,
    };
  }
  const matcher = new RegExp(escapeRegularExpression(query), "giu");
  const lines: SearchLineMatch[] = [];
  let usedMatches = 0;
  let usedChars = 0;
  let truncated = false;
  let stopAll = false;

  lineLoop: for (const [index, lineText] of read.html
    .split(/\r\n|\n|\r/)
    .entries()) {
    const remainingFileMatches = SEARCH_LIMITS.fileMatches - usedMatches;
    const remainingTotalMatches = budget.remainingMatches - usedMatches;
    const availableMatches = Math.min(
      remainingFileMatches,
      remainingTotalMatches,
    );
    if (availableMatches <= 0) {
      truncated = true;
      stopAll = remainingTotalMatches <= 0;
      break;
    }

    const ranges = findRanges(lineText, matcher, availableMatches + 1);
    if (ranges.length > availableMatches) {
      ranges.length = availableMatches;
      truncated = true;
      stopAll = availableMatches === remainingTotalMatches;
    }
    for (const snippet of createSnippets(index + 1, lineText, ranges)) {
      const remainingChars = budget.remainingChars - usedChars;
      if (snippet.lineText.length > remainingChars) {
        truncated = true;
        stopAll = true;
        break lineLoop;
      }
      lines.push(snippet);
      usedChars += snippet.lineText.length;
      usedMatches += snippet.ranges.length;
    }
    if (truncated) {
      break;
    }
  }

  return {
    result: createFileResult(entry, truncated, usedMatches, lines),
    usedMatches,
    usedChars,
    usedBytes: read.bytesRead,
    stopAll,
  };
}

function createFileResult(
  entry: Entry,
  truncated: boolean,
  matchCount: number,
  lines: SearchLineMatch[],
): SearchFileResult {
  return {
    entryId: entry.id,
    title: entry.title,
    fileName: path.basename(entry.absPath),
    absPath: entry.absPath,
    matchCount,
    truncated,
    lines,
  };
}

function escapeRegularExpression(query: string): string {
  return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRanges(
  lineText: string,
  matcher: RegExp,
  limit: number,
): SearchMatchRange[] {
  const ranges: SearchMatchRange[] = [];
  matcher.lastIndex = 0;
  for (
    let match = matcher.exec(lineText);
    match;
    match = matcher.exec(lineText)
  ) {
    ranges.push({ start: match.index, length: match[0].length });
    if (ranges.length >= limit) {
      break;
    }
  }
  return ranges;
}

function createSnippets(
  lineNumber: number,
  lineText: string,
  ranges: SearchMatchRange[],
): SearchLineMatch[] {
  const snippets: SearchLineMatch[] = [];
  let rangeIndex = 0;
  while (rangeIndex < ranges.length) {
    const firstRange = ranges[rangeIndex];
    const maximumStart = Math.max(
      0,
      lineText.length - SEARCH_LIMITS.snippetLength,
    );
    const proposedStart = Math.min(
      Math.max(0, firstRange.start - 160),
      maximumStart,
    );
    const start = startsInsideSurrogatePair(lineText, proposedStart)
      ? proposedStart + 1
      : proposedStart;
    const proposedEnd = Math.min(
      lineText.length,
      start + SEARCH_LIMITS.snippetLength,
    );
    const end = endsInsideSurrogatePair(lineText, proposedEnd)
      ? proposedEnd - 1
      : proposedEnd;
    const snippetRanges: SearchMatchRange[] = [];
    while (rangeIndex < ranges.length) {
      const range = ranges[rangeIndex];
      if (range.start + range.length > end) {
        break;
      }
      snippetRanges.push({ start: range.start - start, length: range.length });
      rangeIndex += 1;
    }
    snippets.push({
      lineNumber,
      startOffset: start,
      lineText: lineText.slice(start, end),
      truncated: start > 0 || end < lineText.length,
      ranges: snippetRanges,
    });
  }
  return snippets;
}

function startsInsideSurrogatePair(value: string, index: number): boolean {
  return index > 0 && isLowSurrogate(value.charCodeAt(index));
}

function endsInsideSurrogatePair(value: string, index: number): boolean {
  return index < value.length && isHighSurrogate(value.charCodeAt(index - 1));
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}
