import {
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  REVIEW_IMAGE_TYPES,
  REVIEW_LIMITS,
  type ReviewAttachment,
  type ReviewAttachmentUpload,
  type ReviewAuthor,
  type ReviewClient,
  type ReviewImageType,
  type ReviewThread,
  reviewAttachmentFileName,
  type TextAnchor,
} from "../shared/review.js";
import claudeAvatar from "./assets/review-avatars/claude.webp";
import codexAvatar from "./assets/review-avatars/codex.webp";
import llmAvatar from "./assets/review-avatars/llm.webp";
import userAvatar from "./assets/review-avatars/user.webp";
import { BubbleIcon, ResolvedBubbleIcon } from "./BubbleIcon.js";
import type { LinkedPage } from "./linked-page.js";
import {
  blockRange,
  COMMENTABLE_BLOCKS,
  createTextAnchor,
  locateTextAnchor,
} from "./review-anchor.js";
import { renderReplyMarkdown } from "./review-markdown.js";
import { useSeenReplies } from "./review-seen.js";
import type { ReviewThreads } from "./useReviewThreads.js";
import "./review.css";

const HIGHLIGHT = "zatto-review";
const ACTIVE_HIGHLIGHT = "zatto-review-active";
const STYLE_ATTRIBUTE = "data-zatto-review-styles";
/** 日本語で 1 行あたりの文字数。WCAG 1.4.8 の上限 40 字と、読む速さが頭打ちになる 20 字台の間をとる */
const POPOVER_LINE_CHARACTERS = 36;
/** .review-popover の font-size（rem） */
const POPOVER_FONT_SCALE = 0.875;
const POPOVER_MARGIN = 16;
/** 返信を待つ表示をやめるまでの時間 */
export const REPLY_WAIT_MS = 5 * 60 * 1000;

interface ReviewLayerProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  frameKey: string;
  review: ReviewThreads;
  /** Set while the preview shows an unregistered page reached by a link; selecting text then offers registration. */
  onCommentOnLinkedPage?: (anchor: TextAnchor) => void;
  /** Text to open a new comment on once the frame loads, carried over from a page registered for commenting. */
  pendingAnchor?: TextAnchor | null;
  onPendingAnchorUsed?: () => void;
  /** Thread to open once it is loaded, requested from outside the preview such as the status bar. */
  requestedThreadId?: string | null;
  onRequestedThreadOpened?: () => void;
  /** Increments to open the Comments list, such as from the status bar. */
  panelRequest?: number;
}

interface Position {
  left: number;
  top: number;
}

type PopoverPlacement = { left: number; width: number } & (
  | { top: number }
  | { bottom: number }
);

type Popover =
  | { kind: "selection"; anchor: TextAnchor; range: Range }
  | { kind: "compose"; anchor: TextAnchor | null; range: Range | null }
  | { kind: "thread"; threadId: string };

interface HighlightWindow {
  CSS?: {
    highlights?: {
      set(name: string, value: object): void;
      delete(name: string): void;
    };
  };
  Highlight?: new (...ranges: Range[]) => object;
}

/**
 * Lets the user attach comment threads to text in the preview and shows existing threads over it.
 * Highlights are drawn inside the frame so they scroll with the text; popovers are drawn here and repositioned.
 */
export function ReviewLayer({
  iframeRef,
  canvasRef,
  frameKey,
  review,
  onCommentOnLinkedPage,
  pendingAnchor,
  onPendingAnchorUsed,
  requestedThreadId,
  onRequestedThreadOpened,
  panelRequest = 0,
}: ReviewLayerProps) {
  const seen = useSeenReplies();
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  useEffect(() => {
    if (panelRequest) setIsPanelOpen(true);
  }, [panelRequest]);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [zoomed, setZoomed] = useState<ReviewAttachment | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: フレームの差し替えごとに読み直す
  useEffect(() => {
    setPopover(null);
    setFrameDocument(null);
    const frame = iframeRef.current;
    if (!frame) return;
    const capture = () => {
      try {
        setFrameDocument(frame.contentDocument);
      } catch {
        setFrameDocument(null);
      }
    };
    frame.addEventListener("load", capture);
    if (frame.contentDocument?.readyState === "complete") capture();
    return () => frame.removeEventListener("load", capture);
  }, [frameKey]);

  const located = useMemo(() => {
    const ranges = new Map<string, Range>();
    if (!frameDocument) return ranges;
    for (const thread of review.threads) {
      if (!thread.anchor) continue;
      const range = locateTextAnchor(frameDocument, thread.anchor);
      if (range) ranges.set(thread.id, range);
    }
    return ranges;
  }, [frameDocument, review.threads]);

  const activeThreadId = popover?.kind === "thread" ? popover.threadId : null;
  useEffect(() => {
    if (!frameDocument) return;
    const view = frameDocument.defaultView as unknown as HighlightWindow | null;
    const registry = view?.CSS?.highlights;
    const Highlight = view?.Highlight;
    if (!registry || !Highlight) return;
    installStyles(frameDocument);
    const open = review.threads
      .filter((thread) => !thread.resolved)
      .map((thread) => located.get(thread.id))
      .filter((range): range is Range => !!range);
    registry.set(HIGHLIGHT, new Highlight(...open));
    const active = activeThreadId ? located.get(activeThreadId) : undefined;
    if (active) registry.set(ACTIVE_HIGHLIGHT, new Highlight(active));
    else registry.delete(ACTIVE_HIGHLIGHT);
    return () => {
      registry.delete(HIGHLIGHT);
      registry.delete(ACTIVE_HIGHLIGHT);
    };
  }, [frameDocument, located, review.threads, activeThreadId]);

  const openPendingComment = useEffectEvent((document: Document) => {
    if (!pendingAnchor) return;
    setPopover({
      kind: "compose",
      anchor: pendingAnchor,
      range: locateTextAnchor(document, pendingAnchor),
    });
    onPendingAnchorUsed?.();
  });
  useEffect(() => {
    if (frameDocument && pendingAnchor) openPendingComment(frameDocument);
  }, [frameDocument, pendingAnchor]);

  const openRequestedThread = useEffectEvent(() => {
    const thread = review.threads.find((item) => item.id === requestedThreadId);
    if (!thread || !frameDocument) return;
    located
      .get(thread.id)
      ?.startContainer.parentElement?.scrollIntoView({ block: "center" });
    setPopover({ kind: "thread", threadId: thread.id });
    onRequestedThreadOpened?.();
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: スレッドと本文が読み込まれた時点で開く
  useEffect(() => {
    if (requestedThreadId) openRequestedThread();
  }, [requestedThreadId, review.threads, frameDocument]);

  const [hoveredBlock, setHoveredBlock] = useState<Element | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 別の文書に切り替わったら、前の文書のブロックを指さない
  useEffect(() => setHoveredBlock(null), [frameDocument]);
  const handleHover = useEffectEvent((event: MouseEvent) => {
    const target = event.target as Element | null;
    const block = target?.closest?.(COMMENTABLE_BLOCKS) ?? null;
    // Mermaid の図は SVG に描き直されて文字を選べないため、図の見出しへのコメントで代える
    const next = block?.closest("pre.mermaid") ? null : block;
    if (next && next !== hoveredBlock) setHoveredBlock(next);
  });

  function commentOnBlock(block: Element): void {
    if (!frameDocument) return;
    const range = blockRange(frameDocument, block);
    const anchor = range && createTextAnchor(frameDocument, range);
    if (!range || !anchor) return;
    if (onCommentOnLinkedPage) {
      onCommentOnLinkedPage(anchor);
      return;
    }
    setPopover({ kind: "compose", anchor, range });
  }

  const handleSelection = useEffectEvent(() => {
    if (!frameDocument) return;
    const selection = frameDocument.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      if (popover?.kind === "selection") setPopover(null);
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    const anchor = createTextAnchor(frameDocument, range);
    if (anchor) setPopover({ kind: "selection", anchor, range });
  });

  const handleClick = useEffectEvent((event: MouseEvent) => {
    if (!frameDocument?.getSelection()?.isCollapsed) return;
    const point = caretAt(frameDocument, event.clientX, event.clientY);
    if (!point) return;
    for (const thread of review.threads) {
      const range = located.get(thread.id);
      if (thread.resolved || !range) continue;
      try {
        if (range.isPointInRange(point.node, point.offset)) {
          setPopover({ kind: "thread", threadId: thread.id });
          return;
        }
      } catch {
        // 別の文書に属する位置は比較できない
      }
    }
  });

  useEffect(() => {
    if (!frameDocument) return;
    const view = frameDocument.defaultView;
    const onMouseUp = () => setTimeout(handleSelection, 0);
    const onClick = (event: MouseEvent) => handleClick(event);
    const onMouseMove = (event: MouseEvent) => handleHover(event);
    const relayout = () => setLayoutVersion((version) => version + 1);
    frameDocument.addEventListener("mouseup", onMouseUp);
    frameDocument.addEventListener("keyup", onMouseUp);
    frameDocument.addEventListener("click", onClick);
    frameDocument.addEventListener("mousemove", onMouseMove);
    view?.addEventListener("scroll", relayout);
    view?.addEventListener("resize", relayout);
    window.addEventListener("resize", relayout);
    return () => {
      frameDocument.removeEventListener("mouseup", onMouseUp);
      frameDocument.removeEventListener("keyup", onMouseUp);
      frameDocument.removeEventListener("click", onClick);
      frameDocument.removeEventListener("mousemove", onMouseMove);
      view?.removeEventListener("scroll", relayout);
      view?.removeEventListener("resize", relayout);
      window.removeEventListener("resize", relayout);
    };
  }, [frameDocument]);

  function frameGeometry() {
    const frame = iframeRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return null;
    const frameRect = frame.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
      frame,
      offsetTop: frameRect.top - canvasRect.top + frame.clientTop,
      offsetLeft: frameRect.left - canvasRect.left + frame.clientLeft,
      visibleTop: frameRect.top - canvasRect.top,
      visibleBottom: frameRect.bottom - canvasRect.top,
      frameRight: frameRect.right - canvasRect.left,
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
    };
  }

  /** Places the Comment button below the end of the selection; null while the selection is scrolled out of view. */
  function selectionButtonPosition(range: Range): Position | null {
    const geometry = frameGeometry();
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    if (!geometry) return null;
    const top = geometry.offsetTop + rect.bottom;
    if (top < geometry.visibleTop || top > geometry.visibleBottom) return null;
    const left = geometry.offsetLeft + rect.left;
    return {
      left: Math.min(Math.max(8, left), geometry.canvasWidth - 120),
      top: top + 6,
    };
  }

  /**
   * Places a popover next to its text: below it in the upper half of the preview, above it in the lower half.
   * Returns "hidden" while the text is scrolled out of view, and a fixed corner for threads without located text.
   */
  function popoverPlacement(
    range: Range | null | undefined,
  ): PopoverPlacement | "hidden" {
    const geometry = frameGeometry();
    const width = popoverWidth(geometry?.canvasWidth ?? 0);
    if (!geometry) return { left: POPOVER_MARGIN, top: 80, width };
    if (!range) return { left: POPOVER_MARGIN, top: 80, width };
    const rects = range.getClientRects();
    const first = rects[0] ?? range.getBoundingClientRect();
    const last = rects[rects.length - 1] ?? first;
    const textTop = geometry.offsetTop + first.top;
    const textBottom = geometry.offsetTop + last.bottom;
    if (textBottom < geometry.visibleTop || textTop > geometry.visibleBottom)
      return "hidden";
    const left = Math.min(
      Math.max(POPOVER_MARGIN, geometry.offsetLeft + first.left),
      geometry.canvasWidth - width - POPOVER_MARGIN,
    );
    if (textBottom <= geometry.canvasHeight / 2)
      return { left, top: textBottom + 6, width };
    return { left, bottom: geometry.canvasHeight - textTop + 6, width };
  }

  /** Places the hover comment button in the left margin, level with the first line of the block. */
  function blockButtonPosition(block: Element | null): Position | null {
    const geometry = frameGeometry();
    if (!geometry || !block?.isConnected) return null;
    const rect = block.getBoundingClientRect();
    const line = Math.min(rect.height, 24);
    const top = geometry.offsetTop + rect.top + line / 2;
    if (top < geometry.visibleTop || top > geometry.visibleBottom) return null;
    return {
      left: Math.max(
        geometry.offsetLeft + 4,
        geometry.offsetLeft + rect.left - 30,
      ),
      top,
    };
  }

  /** Places a marker in the right margin of the preview, level with the first line of the commented text. */
  function markerPosition(range: Range | undefined): Position | null {
    const geometry = frameGeometry();
    const rect = range?.getClientRects()[0];
    if (!geometry || !rect) return null;
    const top = geometry.offsetTop + rect.top + rect.height / 2;
    if (top < geometry.visibleTop || top > geometry.visibleBottom) return null;
    // 本文に重ならないよう、スクロールバーの内側の右端に寄せる
    return { left: geometry.frameRight - 56, top };
  }

  void layoutVersion;
  const thread =
    popover?.kind === "thread"
      ? review.threads.find((item) => item.id === popover.threadId)
      : undefined;
  const selectionPosition =
    popover?.kind === "selection"
      ? selectionButtonPosition(popover.range)
      : null;
  const placement =
    popover?.kind === "compose"
      ? popoverPlacement(popover.range)
      : thread
        ? popoverPlacement(located.get(thread.id))
        : null;
  const blockPosition = blockButtonPosition(hoveredBlock);
  const openCount = review.threads.filter((item) => !item.resolved).length;
  const resolvedCount = review.threads.length - openCount;
  // 同じ行の印が重ならないよう、高さが近いスレッドを 1 つの印にまとめる
  const markerGroups: Array<{
    position: Position;
    open: string[];
    resolved: string[];
  }> = [];
  for (const item of review.threads) {
    const position = markerPosition(located.get(item.id));
    if (!position) continue;
    let group = markerGroups.find(
      (candidate) => Math.abs(candidate.position.top - position.top) < 12,
    );
    if (!group) {
      group = { position, open: [], resolved: [] };
      markerGroups.push(group);
    }
    (item.resolved ? group.resolved : group.open).push(item.id);
  }
  const closePopover = () => setPopover(null);

  return (
    <>
      {markerGroups.map((group) => {
        const isOpen =
          !!activeThreadId &&
          [...group.open, ...group.resolved].includes(activeThreadId);
        return (
          <button
            key={[...group.open, ...group.resolved].join(" ")}
            type="button"
            className={[
              "review-marker",
              group.open.length ? "" : "review-marker--resolved",
              isOpen ? "review-marker--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={group.position}
            aria-expanded={isOpen}
            aria-label={`Comment thread (${group.open.length} open, ${group.resolved.length} resolved on this line)`}
            data-status-description="Open or close the comment thread on this line."
            onClick={() =>
              setPopover(
                isOpen
                  ? null
                  : {
                      kind: "thread",
                      threadId: group.open[0] ?? group.resolved[0] ?? "",
                    },
              )
            }
          >
            {group.open.length > 0 && (
              <span className="review-count review-count--open">
                <BubbleIcon size={11} />
                {group.open.length}
              </span>
            )}
            {group.resolved.length > 0 && (
              <span className="review-count review-count--resolved">
                <ResolvedBubbleIcon size={11} />
                {group.resolved.length}
              </span>
            )}
          </button>
        );
      })}
      {hoveredBlock && blockPosition && popover?.kind !== "selection" && (
        <button
          type="button"
          className="review-block-button"
          style={blockPosition}
          aria-label={
            onCommentOnLinkedPage
              ? "Register and comment on this block"
              : "Comment on this block"
          }
          data-status-description="Comment on this paragraph, item, or heading without selecting text."
          onClick={() => commentOnBlock(hoveredBlock)}
        >
          <BubbleIcon size={12} />
        </button>
      )}
      {popover?.kind === "selection" && selectionPosition && (
        <button
          type="button"
          className="review-selection-button"
          style={selectionPosition}
          data-status-description={
            onCommentOnLinkedPage
              ? "Register this page in zatto and comment on the selected text."
              : "Comment on the selected text."
          }
          onClick={() => {
            if (onCommentOnLinkedPage) {
              onCommentOnLinkedPage(popover.anchor);
              setPopover(null);
              return;
            }
            setPopover({
              kind: "compose",
              anchor: popover.anchor,
              range: popover.range,
            });
          }}
        >
          {onCommentOnLinkedPage ? "Register and comment" : "Comment"}
        </button>
      )}
      {popover?.kind === "compose" && placement && (
        <PopoverFrame
          label="New comment"
          placement={placement}
          onClose={closePopover}
        >
          <header className="review-popover-header">
            <Quote text={popover.anchor?.exact ?? null} />
            <CloseButton onClose={closePopover} />
          </header>
          <CommentForm
            label="Comment"
            submitLabel="Comment"
            onSubmit={async (body, attachments) => {
              const threadId = await review.create(
                popover.anchor,
                body,
                attachments,
              );
              if (!threadId) return false;
              // 送ったコメントと LLM の返答をそのまま見られるよう、作ったスレッドを開く
              frameDocument?.getSelection()?.removeAllRanges();
              setPopover({ kind: "thread", threadId });
              return true;
            }}
          />
        </PopoverFrame>
      )}
      {thread && placement && (
        <PopoverFrame
          label="Comment thread"
          placement={placement}
          onClose={closePopover}
        >
          <ThreadView
            isVisible={placement !== "hidden"}
            seen={seen}
            thread={thread}
            isLocated={!thread.anchor || located.has(thread.id)}
            review={review}
            onClose={closePopover}
            onZoom={setZoomed}
          />
        </PopoverFrame>
      )}
      {zoomed && (
        <div
          className="review-lightbox"
          role="dialog"
          aria-label={zoomed.name}
          onClick={() => setZoomed(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setZoomed(null);
          }}
        >
          <img src={attachmentUrl(zoomed)} alt={zoomed.name} />
        </div>
      )}
      {!onCommentOnLinkedPage && (
        <div className="review-panel-anchor">
          {isPanelOpen && (
            <section className="review-panel" aria-label="Comments">
              <header>
                <strong>Comments</strong>
                <button
                  type="button"
                  className="review-text-button"
                  data-status-description="Comment on the whole document."
                  onClick={() =>
                    setPopover({ kind: "compose", anchor: null, range: null })
                  }
                >
                  Comment on document
                </button>
              </header>
              {review.threads.length === 0 ? (
                <p className="review-empty">
                  Select text in the preview to comment.
                </p>
              ) : (
                <ol>
                  {[...review.threads]
                    .sort((a, b) => lastActivity(b) - lastActivity(a))
                    .map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={
                            item.resolved
                              ? "review-panel-item review-panel-item--resolved"
                              : "review-panel-item"
                          }
                          onClick={() => {
                            const range = located.get(item.id);
                            range?.startContainer.parentElement?.scrollIntoView(
                              {
                                block: "center",
                              },
                            );
                            setPopover({ kind: "thread", threadId: item.id });
                          }}
                        >
                          <span className="review-panel-quote">
                            {hasUnseenReply(item, seen) && (
                              <span
                                className="review-unseen-dot"
                                role="img"
                                aria-label="New reply"
                              />
                            )}
                            {item.anchor ? item.anchor.exact : "Whole document"}
                          </span>
                          <span className="review-panel-body">
                            {item.comments[0]?.body}
                          </span>
                          <span className="review-panel-meta">
                            {item.comments.length}{" "}
                            {item.comments.length === 1
                              ? "comment"
                              : "comments"}
                            {item.resolved ? " · Resolved" : ""}
                            {item.anchor && !located.has(item.id)
                              ? " · Text not found"
                              : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                </ol>
              )}
            </section>
          )}
          <button
            type="button"
            className="review-panel-toggle"
            aria-expanded={isPanelOpen}
            aria-label={`Comments, ${openCount} open, ${resolvedCount} resolved`}
            data-status-description="Show the comment threads of this file."
            onClick={() => setIsPanelOpen((open) => !open)}
          >
            Comments
            {openCount > 0 && (
              <span className="review-count review-count--open">
                <BubbleIcon size={11} />
                {openCount}
              </span>
            )}
            {resolvedCount > 0 && (
              <span className="review-count review-count--resolved">
                <ResolvedBubbleIcon size={11} />
                {resolvedCount}
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Shows whether the file is under review in the viewer header: the reviewing session with Finish review,
 * or a button that copies a request for an LLM conversation.
 */
export function ReviewStatus({
  review,
  linkedPage,
  entryTitle,
  onRegisterLinkedPage,
  onBack,
}: {
  review: ReviewThreads;
  /** Set while the preview shows an unregistered page reached by a link. */
  linkedPage?: LinkedPage | null;
  entryTitle: string;
  onRegisterLinkedPage: () => void;
  onBack: () => void;
}) {
  const { requestText } = review;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  if (linkedPage)
    return (
      <div className="review-banner review-banner--linked" role="status">
        <span title={linkedPage.absPath}>Not in zatto</span>
        {linkedPage.isViewable && (
          <button
            type="button"
            data-status-description="Register this page in zatto so you can comment on it."
            onClick={onRegisterLinkedPage}
          >
            Register
          </button>
        )}
        <button
          type="button"
          className="review-banner-secondary"
          data-status-description="Return to the selected file."
          onClick={onBack}
        >
          Back to {entryTitle}
        </button>
      </div>
    );
  return review.activeReview ? (
    <div className="review-banner" role="status">
      <span>In review with {review.activeReview.session}</span>
      <button
        type="button"
        data-status-description="Finish the review and send the open comments to the LLM session."
        onClick={() => {
          if (review.activeReview)
            void review.finishReview(review.activeReview.id);
        }}
      >
        Finish review
      </button>
    </div>
  ) : (
    <div className="review-start">
      <button
        type="button"
        className="review-panel-toggle"
        data-status-description="Copy a request to paste into an LLM conversation; that conversation then answers your comments on this file."
        onClick={async () => {
          try {
            if (!requestText) throw new Error("Request not loaded");
            await navigator.clipboard.writeText(requestText);
            setCopyState("copied");
            setTimeout(() => setCopyState("idle"), 2000);
          } catch {
            // クリップボードが使えない環境では、依頼文を表示して手で写せるようにする
            setCopyState("failed");
          }
        }}
      >
        {copyState === "copied"
          ? "Copied — paste it into an LLM"
          : copyState === "failed"
            ? "Copy the request below"
            : "Ask an LLM to review"}
      </button>
      {copyState === "failed" && (
        <div className="review-panel">
          <textarea
            className="review-request-text"
            aria-label="Request for an LLM"
            readOnly
            rows={6}
            value={requestText ?? ""}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            className="review-text-button"
            onClick={() => setCopyState("idle")}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Keeps a popover mounted while its text is scrolled out of view, so an unsent reply survives scrolling.
 */
function PopoverFrame({
  label,
  placement,
  onClose,
  children,
}: {
  label: string;
  placement: PopoverPlacement | "hidden";
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="review-popover"
      role="dialog"
      aria-label={label}
      hidden={placement === "hidden"}
      style={placement === "hidden" ? undefined : placement}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      {children}
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      className="review-icon-button"
      aria-label="Close"
      title="Close"
      onClick={onClose}
    >
      ×
    </button>
  );
}

function ThreadView({
  isVisible,
  seen,
  thread,
  isLocated,
  review,
  onClose,
  onZoom,
}: {
  /** False while the popover is hidden because its text is scrolled out of view. */
  isVisible: boolean;
  seen: ReturnType<typeof useSeenReplies>;
  thread: ReviewThread;
  isLocated: boolean;
  review: ReviewThreads;
  onClose: () => void;
  onZoom: (attachment: ReviewAttachment) => void;
}) {
  const latest = thread.comments.at(-1)?.createdAt ?? 0;
  const markSeen = useEffectEvent(() => seen.markSeen(thread.id, latest));
  // 開いている間に届いた返信も既読にする。スクロールで隠れている間は読んでいないので既読にしない
  // biome-ignore lint/correctness/useExhaustiveDependencies: 表示が切り替わるたびに見直す
  useEffect(() => {
    if (isVisible) markSeen();
  }, [thread.id, latest, isVisible]);
  return (
    <>
      <header className="review-popover-header">
        <Quote text={thread.anchor?.exact ?? null} />
        {thread.resolved && <span className="review-badge">Resolved</span>}
        <button
          type="button"
          className="review-action-button"
          onClick={() => void review.resolve(thread.id, !thread.resolved)}
        >
          {thread.resolved ? "↺ Reopen" : "✓ Resolve"}
        </button>
        <CloseButton onClose={onClose} />
      </header>
      {!isLocated && (
        <p className="review-empty">The commented text is no longer found.</p>
      )}
      <ol className="review-comments">
        {thread.comments.map((comment) => (
          <li
            key={comment.id}
            className={`review-message review-message--${comment.author.kind}`}
          >
            <Avatar author={comment.author} />
            <div className="review-message-body">
              <span
                className={
                  comment.author.kind === "user"
                    ? "review-author visually-hidden"
                    : "review-author"
                }
              >
                {authorLabel(comment.author)}
              </span>
              <div className="review-bubble">
                {comment.author.kind === "llm" ? (
                  <ReplyMarkdown body={comment.body} />
                ) : (
                  <p className="review-plain">{comment.body}</p>
                )}
                {comment.attachments && (
                  <span className="review-attachments">
                    {comment.attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        type="button"
                        className="review-attachment"
                        aria-label={`Enlarge ${attachment.name}`}
                        onClick={() => onZoom(attachment)}
                      >
                        <img
                          src={attachmentUrl(attachment)}
                          alt={attachment.name}
                        />
                      </button>
                    ))}
                  </span>
                )}
              </div>
              <time
                className="review-time"
                dateTime={new Date(comment.createdAt).toISOString()}
              >
                {formatCommentTime(comment.createdAt)}
              </time>
            </div>
          </li>
        ))}
        <DeliveryStatus thread={thread} review={review} />
      </ol>
      <CommentForm
        label="Reply"
        submitLabel="Reply"
        onSubmit={async (body, attachments) =>
          review.reply(thread.id, body, attachments)
        }
      />
    </>
  );
}

/** Shows whether the reviewing LLM has taken the user's latest comment, and animates while it replies. */
function DeliveryStatus({
  thread,
  review,
}: {
  thread: ReviewThread;
  review: ReviewThreads;
}) {
  const delivery = review.deliveries[thread.id];
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = delivery ? delivery.since + REPLY_WAIT_MS : 0;
  useEffect(() => {
    setNow(Date.now());
    if (!expiresAt) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  if (
    !delivery ||
    thread.resolved ||
    thread.comments.at(-1)?.author.kind !== "user"
  )
    return null;
  if (delivery.status === "undelivered")
    return (
      <li className="review-delivery" role="status">
        Not delivered yet
      </li>
    );
  if (now >= expiresAt) return null;
  const client = review.activeReview?.client;
  return (
    <li className="review-message review-message--llm">
      <Avatar author={{ kind: "llm", ...(client ? { client } : {}) }} />
      <div className="review-message-body">
        <p
          className="review-bubble review-delivery--replying"
          role="status"
          aria-label="The LLM is replying"
        >
          <span />
          <span />
          <span />
        </p>
      </div>
    </li>
  );
}

const AVATARS = {
  claude: claudeAvatar,
  codex: codexAvatar,
  llm: llmAvatar,
  user: userAvatar,
} as const;

export function Avatar({ author }: { author: ReviewAuthor }) {
  const key =
    author.kind === "user" ? "user" : (author.client ?? ("llm" as const));
  return (
    <img
      className="review-avatar"
      src={AVATARS[key]}
      alt=""
      aria-hidden="true"
    />
  );
}

/** Renders an LLM reply; copy buttons on code blocks are handled here by delegation. */
function ReplyMarkdown({ body }: { body: string }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 中のコピーボタン（button 要素）のクリックをまとめて受ける
    // biome-ignore lint/a11y/useKeyWithClickEvents: キー操作は中の button 要素が受ける
    <div
      className="review-markdown"
      onClick={(event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-review-copy]",
        );
        const code = button?.parentElement?.querySelector("code")?.textContent;
        if (!button || code === undefined || code === null) return;
        void navigator.clipboard.writeText(code).then(
          () => {
            button.textContent = "Copied";
            setTimeout(() => {
              button.textContent = "Copy";
            }, 1500);
          },
          () => undefined,
        );
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderReplyMarkdown は許可した書き方以外をすべて文字として出す
      dangerouslySetInnerHTML={{ __html: renderReplyMarkdown(body) }}
    />
  );
}

function lastActivity(thread: ReviewThread): number {
  return thread.comments.at(-1)?.createdAt ?? thread.createdAt;
}

function hasUnseenReply(
  thread: ReviewThread,
  seen: ReturnType<typeof useSeenReplies>,
): boolean {
  const last = thread.comments.at(-1);
  return (
    last?.author.kind === "llm" && seen.isUnseen(thread.id, last.createdAt)
  );
}

/** Shows when a comment was written as month/day and time, without relative wording. */
export function formatCommentTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CommentForm({
  label,
  submitLabel,
  onSubmit,
}: {
  label: string;
  submitLabel: string;
  onSubmit: (
    body: string,
    attachments: ReviewAttachmentUpload[],
  ) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 入力に合わせて 1 行から 4 行まで伸ばす
  // biome-ignore lint/correctness/useExhaustiveDependencies: 本文が変わるたびに高さを測り直す
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const style = getComputedStyle(textarea);
    const line = Number.parseFloat(style.lineHeight) || 20;
    const padding =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom);
    const border =
      Number.parseFloat(style.borderTopWidth) +
      Number.parseFloat(style.borderBottomWidth);
    // scrollHeight は padding を含み border を含まない
    textarea.style.height = `${Math.min(textarea.scrollHeight, line * 4 + padding) + border}px`;
  }, [body]);

  useEffect(
    () => () => {
      for (const image of images) URL.revokeObjectURL(image.preview);
    },
    [images],
  );

  function addFiles(files: Iterable<File>) {
    const accepted: PendingImage[] = [];
    for (const file of files) {
      if (!isImageType(file.type)) {
        setError("Only PNG, JPEG, WebP, and GIF images can be attached.");
        continue;
      }
      if (file.size > REVIEW_LIMITS.attachmentBytes) {
        setError("Images must be 5 MB or smaller.");
        continue;
      }
      accepted.push({
        file,
        type: file.type,
        preview: URL.createObjectURL(file),
      });
    }
    if (!accepted.length) return;
    setImages((current) => {
      const next = [...current, ...accepted];
      if (next.length > REVIEW_LIMITS.attachmentsPerComment) {
        setError("Attach up to 4 images.");
        for (const image of next.slice(REVIEW_LIMITS.attachmentsPerComment))
          URL.revokeObjectURL(image.preview);
        return next.slice(0, REVIEW_LIMITS.attachmentsPerComment);
      }
      setError(null);
      return next;
    });
  }

  return (
    <form
      className="review-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim() || pending) return;
        setPending(true);
        const uploads = await Promise.all(images.map(toUpload));
        const saved = await onSubmit(body.trim(), uploads);
        setPending(false);
        if (saved) {
          setBody("");
          setImages([]);
          setError(null);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        addFiles(event.dataTransfer.files);
      }}
    >
      <textarea
        ref={textareaRef}
        aria-label={label}
        value={body}
        rows={1}
        placeholder={`${submitLabel}… (paste or drop images)`}
        onChange={(event) => setBody(event.target.value)}
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (!files.length) return;
          event.preventDefault();
          addFiles(files);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
            event.currentTarget.form?.requestSubmit();
        }}
      />
      {images.length > 0 && (
        <span className="review-attachments">
          {images.map((image) => (
            <span key={image.preview} className="review-attachment">
              <img src={image.preview} alt={image.file.name} />
              <button
                type="button"
                className="review-attachment-remove"
                aria-label={`Remove ${image.file.name}`}
                onClick={() => {
                  URL.revokeObjectURL(image.preview);
                  setImages((current) =>
                    current.filter((item) => item !== image),
                  );
                }}
              >
                ×
              </button>
            </span>
          ))}
        </span>
      )}
      {error && <p className="review-form-error">{error}</p>}
      <span className="review-form-actions">
        <button type="submit" disabled={!body.trim() || pending}>
          {submitLabel}
        </button>
      </span>
    </form>
  );
}

interface PendingImage {
  file: File;
  type: ReviewImageType;
  preview: string;
}

function isImageType(type: string): type is ReviewImageType {
  return (REVIEW_IMAGE_TYPES as readonly string[]).includes(type);
}

async function toUpload(image: PendingImage): Promise<ReviewAttachmentUpload> {
  const bytes = new Uint8Array(await image.file.arrayBuffer());
  let binary = "";
  // String.fromCharCode の引数の上限を超えないよう分けて変換する
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return {
    name: image.file.name || "image",
    type: image.type,
    data: btoa(binary),
  };
}

function attachmentUrl(attachment: ReviewAttachment): string {
  return `/review-attachments/${reviewAttachmentFileName(attachment)}`;
}

/** Width for about 36 characters of body text, narrowed to the preview with a 16px gutter on each side. */
function popoverWidth(canvasWidth: number): number {
  const rem =
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
    16;
  const ideal = POPOVER_LINE_CHARACTERS * rem * POPOVER_FONT_SCALE + 34;
  return Math.max(0, Math.min(ideal, canvasWidth - POPOVER_MARGIN * 2));
}

function Quote({ text }: { text: string | null }) {
  return (
    <blockquote
      className={text ? "review-quote" : "review-quote review-quote--document"}
    >
      {text ?? "Whole document"}
    </blockquote>
  );
}

const CLIENT_NAMES = { claude: "Claude", codex: "Codex" } as const;

/** Display name of an LLM client, or "LLM" when it is not known. */
export function clientName(client: ReviewClient | undefined): string {
  return client ? CLIENT_NAMES[client] : "LLM";
}

function authorLabel(author: ReviewAuthor): string {
  if (author.kind === "user") return "You";
  const name = clientName(author.client);
  return author.session ? `${name} · ${author.session}` : name;
}

function caretAt(
  document: Document,
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  const withPosition = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const position = withPosition.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range
    ? { node: range.startContainer, offset: range.startOffset }
    : null;
}

function installStyles(document: Document): void {
  if (document.querySelector(`[${STYLE_ATTRIBUTE}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = `
    ::highlight(${HIGHLIGHT}) { background-color: rgb(250 204 21 / 35%); }
    ::highlight(${ACTIVE_HIGHLIGHT}) { background-color: rgb(250 204 21 / 70%); }
  `;
  (document.head ?? document.documentElement).append(style);
}
