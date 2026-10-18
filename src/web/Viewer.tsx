import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { Entry } from "../server/session.js";
import type { TextAnchor } from "../shared/review.js";
import type { CopyFeedback } from "./copy-feedback.js";
import { Icon } from "./icons.js";
import { type LinkedPage, linkedPageOf } from "./linked-page.js";
import { PreviewPageSearch } from "./PreviewPageSearch.js";
import { ReviewLayer, ReviewStatus } from "./ReviewLayer.js";
import type { SearchResultLocator } from "./search-navigation-url.js";
import { usePreviewPageSearch } from "./usePreviewPageSearch.js";
import { usePreviewSearchTarget } from "./usePreviewSearchTarget.js";
import type { ReviewThreads } from "./useReviewThreads.js";

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
  onRemove: (id: string) => void;
  onPickFiles: () => void;
  review?: ReviewThreads;
  /** Registered entries and actions for pages the preview reaches through links. */
  linkedPages?: LinkedPages;
  requestedThreadId?: string | null;
  onRequestedThreadOpened?: () => void;
  panelRequest?: number;
}

/** Lets the viewer open or register a file the preview reached through a link. */
export interface LinkedPages {
  entries: readonly Entry[];
  open: (entryId: string) => void;
  /** Registers a file in the displayed workspace; resolves to its entry ID, or null when it failed. */
  register: (absPath: string) => Promise<string | null>;
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
  onRemove,
  onPickFiles,
  review,
  linkedPages,
  requestedThreadId = null,
  onRequestedThreadOpened,
  panelRequest,
}: ViewerProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [linkedPage, setLinkedPage] = useState<LinkedPage | null>(null);
  const [pendingComment, setPendingComment] = useState<{
    entryId: string;
    anchor: TextAnchor;
  } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: ファイルの切り替えと再読み込みでリンク先の表示を解く
  useEffect(() => {
    setLinkedPage(null);
  }, [selectedEntry?.id, reloadVersion]);

  /** Opens a registered linked page as the selected entry; otherwise remembers it to offer registration. */
  function detectLinkedPage(): void {
    let next: LinkedPage | null = null;
    try {
      const pathname = iframeRef.current?.contentWindow?.location.pathname;
      if (pathname && selectedEntry)
        next = linkedPageOf(selectedEntry, pathname);
    } catch {
      next = null;
    }
    const registered =
      next &&
      linkedPages?.entries.find((entry) => entry.absPath === next.absPath);
    if (registered) {
      linkedPages?.open(registered.id);
      return;
    }
    setLinkedPage(next);
  }

  async function registerLinkedPage(anchor?: TextAnchor): Promise<void> {
    if (!linkedPage || !linkedPages) return;
    const entryId = await linkedPages.register(linkedPage.absPath);
    if (!entryId) return;
    if (anchor) setPendingComment({ entryId, anchor });
    linkedPages.open(entryId);
  }
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
            data-status-description={
              isFilePanelVisible
                ? "Hide the file panel."
                : "Show the file panel."
            }
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
            data-status-description="Review the selected file path."
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
          {selectedEntry && review && (
            <ReviewStatus
              review={review}
              linkedPage={linkedPage}
              entryTitle={selectedEntry.title}
              onRegisterLinkedPage={() => void registerLinkedPage()}
              onBack={() =>
                iframeRef.current?.contentWindow?.location.replace(
                  `/f/${encodeURIComponent(selectedEntry.id)}/`,
                )
              }
            />
          )}
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
            data-status-description="Copy the selected file path."
            type="button"
            aria-label="Copy file path"
            aria-describedby={selectedEntry ? "selected-file-path" : undefined}
            disabled={!selectedEntry}
            onClick={() => selectedEntry && onCopyPath(selectedEntry.absPath)}
          >
            <Icon name="clipboardCopy" size={12} />
            Copy
          </button>
          <button
            className="preview-remove-button icon-button"
            data-status-description="Remove the selected file from this session."
            type="button"
            aria-label="Remove selected file from session"
            aria-describedby={selectedEntry ? "selected-file-path" : undefined}
            disabled={!selectedEntry}
            onClick={() => selectedEntry && onRemove(selectedEntry.id)}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </header>
      {errorMessage && (
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="viewer-canvas" ref={canvasRef}>
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
        {selectedEntry && review && (
          <ReviewLayer
            iframeRef={iframeRef}
            canvasRef={canvasRef}
            frameKey={`${selectedEntry.id}:${reloadVersion}`}
            review={
              linkedPage
                ? { ...review, threads: [], activeReview: null }
                : review
            }
            onCommentOnLinkedPage={
              linkedPage?.isViewable
                ? (anchor) => void registerLinkedPage(anchor)
                : undefined
            }
            pendingAnchor={
              pendingComment?.entryId === selectedEntry.id
                ? pendingComment.anchor
                : null
            }
            onPendingAnchorUsed={() => setPendingComment(null)}
            requestedThreadId={requestedThreadId}
            onRequestedThreadOpened={onRequestedThreadOpened}
            panelRequest={panelRequest}
          />
        )}
        {selectedEntry ? (
          <iframe
            ref={iframeRef}
            key={`${selectedEntry.id}:${reloadVersion}`}
            title={`${selectedEntry.title} preview`}
            src={`/f/${encodeURIComponent(selectedEntry.id)}/`}
            onLoad={() => {
              detectLinkedPage();
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
                ? "Open local HTML or Markdown files"
                : "Select a file to preview"}
            </strong>
            {canPickFiles ? (
              <>
                <p>
                  Choose one or more HTML or Markdown files to add them to this
                  session.
                </p>
                <button
                  className="empty-viewer-action"
                  data-status-description="Select HTML or Markdown files to preview."
                  type="button"
                  aria-label="Select HTML or Markdown files"
                  disabled={isFilePickerOpen}
                  onClick={onPickFiles}
                >
                  {isFilePickerOpen
                    ? "Opening…"
                    : "Select HTML or Markdown files"}
                </button>
                <small>Command+O</small>
              </>
            ) : (
              <p>
                Select any HTML or Markdown file from the folders on the left to
                render the local live preview inside this frame.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
