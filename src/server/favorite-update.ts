import type { Entry } from "./session.js";

/** Outcome of an explicit favorite update. */
export type FavoriteUpdateResult = "missing" | "unchanged" | "updated";
/**
 * Updates a detached collection's favorite flag without changing entry order.
 * @param entries - Detached entries supplied by the serialized store
 * @param id - Target entry ID
 * @param favorite - Desired favorite state
 * @returns Result and changed entries only when persistence is needed
 * @throws Never
 */
export function updateFavorite(
  entries: Entry[],
  id: string,
  favorite: boolean,
): { entries?: Entry[]; result: FavoriteUpdateResult } {
  const entry = entries.find((entry) => entry.id === id);
  if (!entry) return { result: "missing" };
  if (Boolean(entry.favorite) === favorite) return { result: "unchanged" };
  entry.favorite = favorite;
  return { entries, result: "updated" };
}
