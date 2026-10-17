import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import type {
  ReviewAuthor,
  ReviewThread,
  TextAnchor,
} from "../shared/review.js";
import { createTextAnchor, locateTextAnchor } from "./review-anchor.js";
import type { ReviewThreads } from "./useReviewThreads.js";
import "./review.css";

const HIGHLIGHT = "zatto-review";
const ACTIVE_HIGHLIGHT = "zatto-review-active";
const STYLE_ATTRIBUTE = "data-zatto-review-styles";

interface ReviewLayerProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  frameKey: string;
  review: ReviewThreads;
}

interface Position {
  left: number;
  top: number;
}

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
}: ReviewLayerProps) {
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isRecipientMenuOpen, setIsRecipientMenuOpen] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);

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
    const relayout = () => setLayoutVersion((version) => version + 1);
    frameDocument.addEventListener("mouseup", onMouseUp);
    frameDocument.addEventListener("keyup", onMouseUp);
    frameDocument.addEventListener("click", onClick);
    view?.addEventListener("scroll", relayout);
    view?.addEventListener("resize", relayout);
    window.addEventListener("resize", relayout);
    return () => {
      frameDocument.removeEventListener("mouseup", onMouseUp);
      frameDocument.removeEventListener("keyup", onMouseUp);
      frameDocument.removeEventListener("click", onClick);
      view?.removeEventListener("scroll", relayout);
      view?.removeEventListener("resize", relayout);
      window.removeEventListener("resize", relayout);
    };
  }, [frameDocument]);

  function positionOf(range: Range | null | undefined): Position | null {
    const frame = iframeRef.current;
    const canvas = canvasRef.current;
    if (!range || !frame || !canvas) return null;
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const top = frameRect.top - canvasRect.top + frame.clientTop + rect.bottom;
    const left =
      frameRect.left - canvasRect.left + frame.clientLeft + rect.left;
    const maxLeft = Math.max(8, canvasRect.width - 344);
    const visibleTop = frameRect.top - canvasRect.top;
    if (top < visibleTop || top > frameRect.bottom - canvasRect.top)
      return null;
    return { left: Math.min(Math.max(8, left), maxLeft), top: top + 6 };
  }

  void layoutVersion;
  const thread =
    popover?.kind === "thread"
      ? review.threads.find((item) => item.id === popover.threadId)
      : undefined;
  const popoverPosition =
    popover?.kind === "selection" || popover?.kind === "compose"
      ? positionOf(popover.range)
      : thread
        ? positionOf(located.get(thread.id))
        : null;
  const openCount = review.threads.filter((item) => !item.resolved).length;

  return (
    <>
      {review.activeReview ? (
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
            aria-expanded={isRecipientMenuOpen}
            data-status-description="Review this file with a waiting LLM session; your comments are sent to it."
            onClick={() => setIsRecipientMenuOpen((open) => !open)}
          >
            Start review
          </button>
          {isRecipientMenuOpen && (
            <div className="review-panel" role="menu" aria-label="LLM sessions">
              {review.listeners.length === 0 ? (
                <p className="review-empty">
                  No LLM session is waiting. Ask an LLM to run{" "}
                  <code>zatto review --inbox --session &lt;id&gt;</code>.
                </p>
              ) : (
                <ol>
                  {review.listeners.map((listener) => (
                    <li key={listener.session}>
                      <button
                        type="button"
                        role="menuitem"
                        className="review-panel-item"
                        onClick={async () => {
                          if (await review.startReview(listener.session))
                            setIsRecipientMenuOpen(false);
                        }}
                      >
                        <span className="review-panel-body">
                          {listener.session}
                        </span>
                        <span className="review-panel-meta">
                          Waiting since{" "}
                          {new Date(listener.lastSeenAt).toLocaleTimeString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
      {popover?.kind === "selection" && popoverPosition && (
        <button
          type="button"
          className="review-selection-button"
          style={popoverPosition}
          data-status-description="Comment on the selected text."
          onClick={() =>
            setPopover({
              kind: "compose",
              anchor: popover.anchor,
              range: popover.range,
            })
          }
        >
          Comment
        </button>
      )}
      {popover?.kind === "compose" && (
        <div
          className="review-popover"
          style={popoverPosition ?? { left: 24, top: 24 }}
          role="dialog"
          aria-label="New comment"
        >
          {popover.anchor && <Quote text={popover.anchor.exact} />}
          <CommentForm
            label="Comment"
            submitLabel="Comment"
            onCancel={() => setPopover(null)}
            onSubmit={async (body) => {
              if (await review.create(popover.anchor, body)) {
                frameDocument?.getSelection()?.removeAllRanges();
                setPopover(null);
              }
            }}
          />
        </div>
      )}
      {thread && (
        <div
          className="review-popover"
          style={popoverPosition ?? { left: 24, top: 24 }}
          role="dialog"
          aria-label="Comment thread"
        >
          <ThreadView
            thread={thread}
            isLocated={!thread.anchor || located.has(thread.id)}
            review={review}
            onClose={() => setPopover(null)}
          />
        </div>
      )}
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
                {review.threads.map((item) => (
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
                        range?.startContainer.parentElement?.scrollIntoView({
                          block: "center",
                        });
                        setPopover({ kind: "thread", threadId: item.id });
                      }}
                    >
                      <span className="review-panel-quote">
                        {item.anchor ? item.anchor.exact : "Whole document"}
                      </span>
                      <span className="review-panel-body">
                        {item.comments[0]?.body}
                      </span>
                      <span className="review-panel-meta">
                        {item.comments.length}{" "}
                        {item.comments.length === 1 ? "comment" : "comments"}
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
          data-status-description="Show the comment threads of this file."
          onClick={() => setIsPanelOpen((open) => !open)}
        >
          Comments {openCount}
        </button>
      </div>
    </>
  );
}

function ThreadView({
  thread,
  isLocated,
  review,
  onClose,
}: {
  thread: ReviewThread;
  isLocated: boolean;
  review: ReviewThreads;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <>
      <header className="review-popover-header">
        <span>{thread.resolved ? "Resolved" : "Open"}</span>
        <button
          type="button"
          className="review-text-button"
          onClick={() => void review.resolve(thread.id, !thread.resolved)}
        >
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
        <button
          type="button"
          className="review-text-button"
          aria-label="Close thread"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      {thread.anchor && <Quote text={thread.anchor.exact} />}
      {!isLocated && (
        <p className="review-empty">The commented text is no longer found.</p>
      )}
      <ol className="review-comments">
        {thread.comments.map((comment) => (
          <li key={comment.id}>
            <span className="review-author">{authorLabel(comment.author)}</span>
            {editingId === comment.id ? (
              <CommentForm
                label="Edit comment"
                submitLabel="Save"
                initial={comment.body}
                onCancel={() => setEditingId(null)}
                onSubmit={async (body) => {
                  if (await review.edit(thread.id, comment.id, body))
                    setEditingId(null);
                }}
              />
            ) : (
              <>
                <p>{comment.body}</p>
                <span className="review-comment-actions">
                  {comment.author.kind === "user" && (
                    <button
                      type="button"
                      className="review-text-button"
                      onClick={() => setEditingId(comment.id)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="review-text-button"
                    onClick={() => void review.remove(thread.id, comment.id)}
                  >
                    Delete
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      <CommentForm
        label="Reply"
        submitLabel="Reply"
        onSubmit={async (body) => review.reply(thread.id, body)}
      />
    </>
  );
}

function CommentForm({
  label,
  submitLabel,
  initial = "",
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initial?: string;
  onSubmit: (body: string) => Promise<boolean | undefined>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="review-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim() || pending) return;
        setPending(true);
        const saved = await onSubmit(body.trim());
        setPending(false);
        if (saved !== false) setBody("");
      }}
    >
      <textarea
        aria-label={label}
        value={body}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
            event.currentTarget.form?.requestSubmit();
          if (event.key === "Escape") onCancel?.();
        }}
      />
      <span className="review-form-actions">
        {onCancel && (
          <button
            type="button"
            className="review-text-button"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button type="submit" disabled={!body.trim() || pending}>
          {submitLabel}
        </button>
      </span>
    </form>
  );
}

function Quote({ text }: { text: string }) {
  return <blockquote className="review-quote">{text}</blockquote>;
}

function authorLabel(author: ReviewAuthor): string {
  if (author.kind === "user") return "You";
  return author.session ? `LLM · ${author.session}` : "LLM";
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
