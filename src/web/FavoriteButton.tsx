import { useState } from "react";
import type { Entry } from "../server/session.js";
import "./favorites.css";

interface FavoriteButtonProps {
  entry: Entry;
  onFavorite: (id: string, favorite: boolean) => Promise<void>;
}
/**
 * Toggles a file's favorite state using an accessible native button.
 * @param props - Entry state and the persisted update action
 * @returns Star control with pressed and pending states
 * @throws Never; the action reports request errors through the viewer
 */
export function FavoriteButton({ entry, onFavorite }: FavoriteButtonProps) {
  const [pending, setPending] = useState(false);
  async function toggle(): Promise<void> {
    setPending(true);
    try {
      await onFavorite(entry.id, !entry.favorite);
    } finally {
      setPending(false);
    }
  }
  return (
    <button
      type="button"
      className="entry-favorite icon-button"
      aria-label={`Favorite ${entry.title}`}
      aria-pressed={Boolean(entry.favorite)}
      disabled={pending}
      data-status-description={
        entry.favorite
          ? "Remove this file from Favorites."
          : "Add this file to Favorites without changing List order."
      }
      onClick={() => void toggle()}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"
          fill={entry.favorite ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
