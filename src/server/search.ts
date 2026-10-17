import type { SearchFileResult, SearchResponse } from "../shared/search.js";
import { SEARCH_LIMITS } from "./search-constants.js";
import { searchEntry } from "./search-matcher.js";
import type { Entry } from "./session.js";

/**
 * Searches an authorized entry snapshot within bounded resource limits.
 * @param entries - Registered entries to search
 * @param query - Validated fixed-string query
 * @returns Bounded search results
 * @throws SearchFileFailure when an entry cannot be read safely
 */
export async function searchEntries(
  entries: Entry[],
  query: string,
): Promise<SearchResponse> {
  if (query.length === 0) {
    return { query, totalMatches: 0, truncated: false, files: [] };
  }

  const files: SearchFileResult[] = [];
  let totalMatches = 0;
  let responseChars = 0;
  let totalFileBytes = 0;
  let truncated = entries.length > SEARCH_LIMITS.files;
  for (const entry of entries.slice(0, SEARCH_LIMITS.files)) {
    if (
      totalMatches >= SEARCH_LIMITS.totalMatches ||
      responseChars >= SEARCH_LIMITS.responseChars ||
      totalFileBytes >= SEARCH_LIMITS.totalFileBytes
    ) {
      truncated = true;
      break;
    }
    const outcome = await searchEntry(entry, query, {
      remainingMatches: SEARCH_LIMITS.totalMatches - totalMatches,
      remainingChars: SEARCH_LIMITS.responseChars - responseChars,
      remainingBytes: SEARCH_LIMITS.totalFileBytes - totalFileBytes,
    });
    totalMatches += outcome.usedMatches;
    responseChars += outcome.usedChars;
    totalFileBytes += outcome.usedBytes;
    truncated ||= outcome.result.truncated;
    if (outcome.result.matchCount > 0) {
      files.push(outcome.result);
    }
    if (outcome.stopAll) {
      break;
    }
  }
  const response = { query, totalMatches, truncated, files };
  trimResponse(response);
  return response;
}

function trimResponse(response: SearchResponse): void {
  while (
    response.files.length > 0 &&
    JSON.stringify(response).length > SEARCH_LIMITS.responseChars
  ) {
    const file = response.files.at(-1);
    if (!file) {
      break;
    }
    const line = file.lines.pop();
    if (!line) {
      response.files.pop();
      continue;
    }
    const removedMatches = line.ranges.length;
    file.matchCount -= removedMatches;
    response.totalMatches -= removedMatches;
    file.truncated = true;
    response.truncated = true;
    if (file.lines.length === 0) {
      response.files.pop();
    }
  }
}

export { SEARCH_LIMITS } from "./search-constants.js";
