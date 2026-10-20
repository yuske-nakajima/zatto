import type { RefObject } from "react";
import type { FilePanelView } from "./file-panel-model.js";
import { useRemoteAccess } from "./remote-access.js";

interface FilePanelViewsProps {
  view: FilePanelView;
  onViewChange: (view: FilePanelView) => void;
  isSearchVisible: boolean;
  hasSearchState: boolean;
  searchButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenSearch: () => void;
}
/**
 * Selects a collection view or opens workspace search.
 * @param props - View state and navigation callbacks
 * @returns Accessible file-panel view controls
 * @throws Never
 */
export function FilePanelViews({
  view,
  onViewChange,
  isSearchVisible,
  hasSearchState,
  searchButtonRef,
  onOpenSearch,
}: FilePanelViewsProps) {
  const isRemote = useRemoteAccess();
  return (
    <fieldset
      className={
        isRemote
          ? "view-switcher view-switcher--without-folders"
          : "view-switcher"
      }
    >
      <legend className="visually-hidden">File panel view</legend>
      <button
        type="button"
        data-status-description="Show files in list order."
        aria-pressed={view === "list"}
        onClick={() => onViewChange("list")}
      >
        List
      </button>
      {!isRemote && (
        <button
          type="button"
          data-status-description="Group files by folder."
          aria-pressed={view === "directories"}
          onClick={() => onViewChange("directories")}
        >
          Folders
        </button>
      )}
      <button
        type="button"
        data-status-description="Show starred files in List order."
        aria-pressed={view === "favorites"}
        onClick={() => onViewChange("favorites")}
      >
        Favorites
      </button>
      <button
        ref={searchButtonRef}
        className="search-mode-button"
        data-status-description="Search files in this session."
        type="button"
        aria-label={
          !isSearchVisible && hasSearchState
            ? "Back to search results"
            : "Search"
        }
        aria-pressed={isSearchVisible}
        onClick={onOpenSearch}
      >
        <span className="search-glyph" aria-hidden="true" />
        {!isSearchVisible && hasSearchState && (
          <span className="search-state-dot" aria-hidden="true" />
        )}
      </button>
    </fieldset>
  );
}
