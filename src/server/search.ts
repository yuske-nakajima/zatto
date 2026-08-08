import type { FastifyInstance } from "fastify";
import type { SearchFileResult, SearchResponse } from "../shared/search.js";
import { SEARCH_LIMITS } from "./search-constants.js";
import { SearchFileFailure } from "./search-file.js";
import { searchEntry } from "./search-matcher.js";
import type { Entry, SessionStore } from "./session.js";

interface SearchQuery {
  q?: string | string[];
}

/**
 * Registers search that can only read entries exposed by the supplied store.
 *
 * @param app - Fastify application that receives the route
 * @param sessionStore - Authority for every searchable file path
 * @returns Nothing
 */
export function registerSearchRoute(
  app: FastifyInstance,
  sessionStore: SessionStore,
): void {
  app.get<{ Querystring: SearchQuery }>(
    "/api/search",
    async (request, reply) => {
      const query = request.query.q ?? "";
      if (typeof query !== "string") {
        return reply.code(400).send({ message: "`q` must be a string." });
      }
      if (query.length > SEARCH_LIMITS.queryLength) {
        return reply.code(400).send({
          code: "SEARCH_QUERY_TOO_LONG",
          message: "The search text is too long.",
          maxLength: SEARCH_LIMITS.queryLength,
        });
      }

      try {
        return await searchEntries(sessionStore.getSession().entries, query);
      } catch (error) {
        if (error instanceof SearchFileFailure) {
          return reply.code(error.statusCode).send({
            code: error.code,
            message: error.message,
            entryId: error.entryId,
            ...(error.code === "SEARCH_FILE_TOO_LARGE"
              ? { maxBytes: SEARCH_LIMITS.fileBytes }
              : {}),
          });
        }
        throw error;
      }
    },
  );
}

async function searchEntries(
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
