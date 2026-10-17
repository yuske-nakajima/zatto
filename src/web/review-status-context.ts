import { createContext, useContext } from "react";

/** Review information shown on file list rows. */
export interface ReviewFileStates {
  reviewing: ReadonlySet<string>;
  openThreadCounts: Readonly<Record<string, number>>;
}

const ReviewFileStatesContext = createContext<ReviewFileStates>({
  reviewing: new Set(),
  openThreadCounts: {},
});

/** Provides review information to every file list row. */
export const ReviewFileStatesProvider = ReviewFileStatesContext.Provider;

/** Whether the entry is under review and how many threads are unresolved. */
export function useReviewFileState(entryId: string): {
  isReviewing: boolean;
  openThreads: number;
} {
  const states = useContext(ReviewFileStatesContext);
  return {
    isReviewing: states.reviewing.has(entryId),
    openThreads: states.openThreadCounts[entryId] ?? 0,
  };
}
