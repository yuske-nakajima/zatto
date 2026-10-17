import { createContext, useContext } from "react";

const ReviewingEntriesContext = createContext<ReadonlySet<string>>(new Set());

/** Provides the entries under review to every file list row. */
export const ReviewingEntriesProvider = ReviewingEntriesContext.Provider;

/** Whether the user is reviewing the entry with an LLM session. */
export function useIsReviewing(entryId: string): boolean {
  return useContext(ReviewingEntriesContext).has(entryId);
}
