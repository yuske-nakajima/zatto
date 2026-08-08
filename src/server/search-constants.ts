import { SEARCH_QUERY_MAX_LENGTH } from "../shared/search.js";

/** Bounds search work and response memory within the local server process. */
export const SEARCH_LIMITS = Object.freeze({
  queryLength: SEARCH_QUERY_MAX_LENGTH,
  fileBytes: 10 * 1024 * 1024,
  totalFileBytes: 50 * 1024 * 1024,
  files: 200,
  fileMatches: 1_000,
  totalMatches: 5_000,
  snippetLength: 500,
  responseChars: 256_000,
});
