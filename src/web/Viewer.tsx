import { type RefObject, useId, useState } from "react";
import type { Entry } from "../server/session.js";
import { Icon } from "./icons.js";
import { PreviewPageSearch } from "./PreviewPageSearch.js";
import type { SearchResultLocator } from "./search-navigation-url.js";
import { usePreviewPageSearch } from "./usePreviewPageSearch.js";
import { usePreviewSearchTarget } from "./usePreviewSearchTarget.js";

interface CopyFeedback {
  kind: "success" | "error";
  message: string;
}

interface ViewerProps {
  isHidden?: boolean;
  filePanelButtonRef?: RefObject<HTMLButtonElement | null>;
  previewTarget?: SearchResultLocator | null;
  searchQuery?: string;
  selectedEntry: Entry | null;
  reloadVersion: number;
  isFilePanelVisible: boolean;
  errorMessage: string | null;
  copyFeedback: CopyFeedback | null;
  canPickFiles: boolean;
  isFilePickerOpen: boolean;
  onToggleFilePanel: () => void;
  onCopyPath: (path: string) => void;
  onPickFiles: () => void;
}

export function Viewer({
  isHidden = false,
  filePanelButtonRef,
  previewTarget = null,
  searchQuery = "",
  selectedEntry,
  reloadVersion,
  isFilePanelVisible,
  errorMessage,
  copyFeedback,
  canPickFiles,
  isFilePickerOpen,
  onToggleFilePanel,
  onCopyPath,
  onPickFiles,
}: ViewerProps) {
  const [showsPathTooltip, setShowsPathTooltip] = useState(false);
  const pathTooltipId = useId();
  const { iframeRef, revealTarget, clearRevealedTarget } =
    usePreviewSearchTarget({
      isHidden,
      previewTarget,
      searchQuery,
      selectedEntryId: selectedEntry?.id,
    });
  const pageSearch = usePreviewPageSearch({
    iframeRef,
    isHidden,
    reloadVersion,
    selectedEntryId: selectedEntry?.id,
    onOpen: clearRevealedTarget,
  });

  return (
    <section className="viewer" hidden={isHidden}>
      <header className="viewer-header">
        <div className="selected-path">
          <button
            ref={filePanelButtonRef}
            className="file-panel-toggle"
            type="button"
            aria-label={
              isFilePanelVisible ? "Hide file panel" : "Show file panel"
            }
            onClick={onToggleFilePanel}
          >
            {isFilePanelVisible ? (
              <Icon name="terminal" size={14} />
            ) : (
              <span aria-hidden="true">›</span>
            )}
          </button>
          <p
            id="selected-file-path"
            tabIndex={selectedEntry ? 0 : undefined}
            aria-describedby={selectedEntry ? pathTooltipId : undefined}
            onMouseEnter={() => setShowsPathTooltip(Boolean(selectedEntry))}
            onMouseLeave={() => setShowsPathTooltip(false)}
            onFocus={() => setShowsPathTooltip(Boolean(selectedEntry))}
            onBlur={() => setShowsPathTooltip(false)}
          >
            {selectedEntry?.absPath ?? "NO FILE SELECTED"}
          </p>
          {showsPathTooltip && selectedEntry && (
            <span
              className="browser-tooltip browser-tooltip--path"
              role="tooltip"
              id={pathTooltipId}
            >
              {selectedEntry.absPath}
            </span>
          )}
        </div>
        <div className="viewer-actions">
          {copyFeedback && (
            <span
              className={`copy-feedback copy-feedback--${copyFeedback.kind}`}
              role={copyFeedback.kind === "error" ? "alert" : "status"}
            >
              {copyFeedback.kind === "success" && (
                <span className="success-dot" aria-hidden="true" />
              )}
              {copyFeedback.message}
            </span>
          )}
          <button
            className="copy-path-button"
            type="button"
            aria-label="Copy file path"
            aria-describedby={selectedEntry ? "selected-file-path" : undefined}
            disabled={!selectedEntry}
            onClick={() => selectedEntry && onCopyPath(selectedEntry.absPath)}
          >
            <Icon name="clipboardCopy" size={12} />
            Copy
          </button>
        </div>
      </header>
      {errorMessage && (
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="viewer-canvas">
        <PreviewPageSearch
          currentIndex={pageSearch.currentIndex}
          focusVersion={pageSearch.focusVersion}
          isOpen={pageSearch.isOpen}
          isUnavailable={pageSearch.isUnavailable}
          query={pageSearch.query}
          total={pageSearch.total}
          onClose={pageSearch.close}
          onNext={pageSearch.next}
          onPrevious={pageSearch.previous}
          onQueryChange={pageSearch.search}
        />
        {selectedEntry ? (
          <iframe
            ref={iframeRef}
            key={`${selectedEntry.id}:${reloadVersion}`}
            title={`${selectedEntry.title} preview`}
            src={`/f/${encodeURIComponent(selectedEntry.id)}/`}
            onLoad={() => {
              if (!pageSearch.isOpen) revealTarget();
              pageSearch.handleFrameLoad();
            }}
          />
        ) : (
          <div className="empty-viewer">
            <span className="empty-viewer-icon">
              <Icon name="monitorPlay" size={24} />
            </span>
            <strong>
              {canPickFiles
                ? "Open local HTML files"
                : "Select a file to preview"}
            </strong>
            {canPickFiles ? (
              <>
                <p>
                  Choose one or more HTML files to add them to this session.
                </p>
                <button
                  className="empty-viewer-action"
                  type="button"
                  aria-label="Select HTML files"
                  disabled={isFilePickerOpen}
                  onClick={onPickFiles}
                >
                  {isFilePickerOpen ? "Opening…" : "Select HTML files"}
                </button>
                <small>Command+O</small>
              </>
            ) : (
              <p>
                Select any compiled HTML file from the folders on the left to
                render the local live preview inside this frame.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export type { CopyFeedback };
