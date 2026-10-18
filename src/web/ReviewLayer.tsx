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
  REVIEW_REPLY_GUIDE,
  type ReviewAttachment,
  type ReviewAttachmentUpload,
  type ReviewAuthor,
  type ReviewImageType,
  type ReviewThread,
  reviewAttachmentFileName,
  type TextAnchor,
} from "../shared/review.js";
import { BubbleIcon, ResolvedBubbleIcon } from "./BubbleIcon.js";
import { createTextAnchor, locateTextAnchor } from "./review-anchor.js";
import { renderReplyMarkdown } from "./review-markdown.js";
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
const REPLY_WAIT_MS = 5 * 60 * 1000;

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
}: ReviewLayerProps) {
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
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
      {popover?.kind === "selection" && selectionPosition && (
        <button
          type="button"
          className="review-selection-button"
          style={selectionPosition}
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
    </>
  );
}

/**
 * Shows whether the file is under review in the viewer header: the reviewing session with Finish review,
 * or a button that copies a request for an LLM conversation.
 */
export function ReviewStatus({
  filePath,
  review,
}: {
  filePath: string;
  review: ReviewThreads;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
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
            await navigator.clipboard.writeText(reviewRequestText(filePath));
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
            value={reviewRequestText(filePath)}
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
  thread,
  isLocated,
  review,
  onClose,
  onZoom,
}: {
  thread: ReviewThread;
  isLocated: boolean;
  review: ReviewThreads;
  onClose: () => void;
  onZoom: (attachment: ReviewAttachment) => void;
}) {
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
          <li key={comment.id}>
            <span
              className={`review-author review-author--${comment.author.kind}`}
            >
              {authorLabel(comment.author)}
            </span>
            {comment.author.kind === "llm" ? (
              <div
                className="review-markdown"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: renderReplyMarkdown は許可した書き方以外をすべて文字として出す
                dangerouslySetInnerHTML={{
                  __html: renderReplyMarkdown(comment.body),
                }}
              />
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
          </li>
        ))}
      </ol>
      <DeliveryStatus thread={thread} review={review} />
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
      <p className="review-delivery" role="status">
        Not delivered yet
      </p>
    );
  if (now >= expiresAt) return null;
  return (
    <p
      className="review-delivery review-delivery--replying"
      role="status"
      aria-label="The LLM is replying"
    >
      <span />
      <span />
      <span />
    </p>
  );
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

/** A request any LLM conversation can act on; it keeps the review command running for this file. */
export function reviewRequestText(filePath: string): string {
  const quoted = JSON.stringify(filePath);
  return [
    "Please review this document with me in zatto.",
    `Run \`zatto review ${quoted} --session <id>\` in the background and keep it running, using an ID for this conversation as <id>.`,
    "Each JSON line it prints is a comment I wrote. Read the document, answer in that thread with",
    `\`zatto review reply <thread-id> "<reply>" --session <id>\`, and keep the command running until it exits when I finish the review.`,
    REVIEW_REPLY_GUIDE,
  ].join("\n");
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
