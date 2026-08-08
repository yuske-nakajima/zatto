import { useEffect, useRef, useState } from "react";
import type { SearchResponse } from "../shared/search.js";

type SearchPhase = "idle" | "initial" | "updating" | "error";

interface EntrySearchState {
  query: string;
  setQuery: (query: string) => void;
  result: SearchResponse | null;
  phase: SearchPhase;
  retry: () => void;
  hasState: boolean;
}

const SEARCH_DEBOUNCE_MS = 250;

export function useEntrySearch(
  refreshVersion: number,
  initialQuery = "",
): EntrySearchState {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [retryVersion, setRetryVersion] = useState(0);
  const resultRef = useRef<SearchResponse | null>(null);
  const requestVersionRef = useRef({
    sequence: 0,
    refreshVersion,
    retryVersion,
  });

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    const requestVersion = {
      sequence: requestVersionRef.current.sequence + 1,
      refreshVersion,
      retryVersion,
    };
    requestVersionRef.current = requestVersion;
    if (query.length === 0) {
      setResult(null);
      setPhase("idle");
      return;
    }

    const controller = new AbortController();
    setPhase(resultRef.current === null ? "initial" : "updating");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const nextResult = (await response.json()) as SearchResponse;
        if (requestVersionRef.current !== requestVersion) {
          return;
        }
        resultRef.current = nextResult;
        setResult(nextResult);
        setPhase("idle");
      } catch (error) {
        if (
          requestVersionRef.current === requestVersion &&
          !isAbortError(error)
        ) {
          setPhase("error");
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, refreshVersion, retryVersion]);

  return {
    query,
    setQuery,
    result,
    phase,
    retry: () => setRetryVersion((version) => version + 1),
    hasState: query.length > 0 || result !== null || phase === "error",
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
