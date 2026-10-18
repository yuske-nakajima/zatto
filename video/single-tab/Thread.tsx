import type { ReactNode } from "react";
import { Img } from "remotion";
import llmAvatar from "../../src/web/assets/review-avatars/llm.webp";
import userAvatar from "../../src/web/assets/review-avatars/user.webp";
import { BubbleIcon } from "../../src/web/BubbleIcon";
import type { FilmCopy } from "./copy";
import { INK, move } from "./style";
import { CUE, type FilmReview } from "./timeline";

/** Browser-local position of the thread popover; the cursor targets these coordinates. */
export const THREAD_BOX = { left: 372, top: 472, width: 600 };
/** Browser-local position of the selection's Comment button. */
export const SELECTION_BUTTON = { left: 600, top: 380 };

function Avatar({ src }: { src: string }) {
  return (
    <Img
      src={src}
      style={{ width: 30, height: 30, borderRadius: 30, flexShrink: 0 }}
    />
  );
}

function Bubble({ mine, children }: { mine: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 15px",
        borderRadius: 16,
        fontSize: 17,
        lineHeight: 1.55,
        background: mine ? "#e0e7ff" : "#f1f5f9",
        maxWidth: 440,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The selection button and the review thread popover over the Markdown preview.
 * @param props - Global frame, localized copy and review progress.
 * @returns Overlays positioned in browser-local coordinates.
 */
export function FilmThread({
  frame,
  copy,
  review,
}: {
  frame: number;
  copy: FilmCopy;
  review: FilmReview;
}) {
  const popover =
    move(frame, CUE.openThread, CUE.openThread + 8) *
    move(frame, CUE.closeThread - 6, CUE.closeThread, 1, 0);
  const reply = move(frame, CUE.reply, CUE.reply + 10);
  return (
    <>
      {review.selectionButton && (
        <div
          style={{
            position: "absolute",
            ...SELECTION_BUTTON,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 13px",
            borderRadius: 8,
            background: "white",
            border: `1px solid ${INK.line}`,
            boxShadow: "0 6px 18px #0f172a1f",
            fontSize: 15,
            opacity: move(frame, CUE.selectionButton, CUE.selectionButton + 5),
          }}
        >
          <BubbleIcon size={16} />
          Comment
        </div>
      )}
      {review.open && (
        <div
          style={{
            position: "absolute",
            ...THREAD_BOX,
            opacity: popover,
            transform: `translateY(${(1 - popover) * 8}px)`,
            padding: "18px 20px",
            boxSizing: "border-box",
            borderRadius: 14,
            background: "white",
            border: `1px solid ${INK.line}`,
            boxShadow: "0 18px 50px #0f172a2e",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              borderLeft: "3px solid #eab308",
              paddingLeft: 12,
              color: INK.muted,
              fontSize: 15,
            }}
          >
            {review.revised ? copy.plan.revised : copy.plan.sentence}
          </div>
          {review.sent ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "flex-end",
                  gap: 9,
                }}
              >
                <Bubble mine>{copy.commentText}</Bubble>
                <Avatar src={userAvatar} />
              </div>
              {review.replied ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 9,
                    opacity: reply,
                    transform: `translateY(${(1 - reply) * 10}px)`,
                  }}
                >
                  <Avatar src={llmAvatar} />
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: INK.muted,
                        margin: "0 0 5px 4px",
                      }}
                    >
                      {copy.author}
                    </div>
                    <Bubble mine={false}>{copy.replyText}</Bubble>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 5, paddingLeft: 6 }}>
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 7,
                        background: INK.muted,
                        opacity:
                          0.3 + 0.7 * Math.abs(Math.sin((frame + dot * 5) / 6)),
                      }}
                    />
                  ))}
                </div>
              )}
              <div
                style={{
                  height: 40,
                  borderRadius: 8,
                  border: `1px solid ${INK.line}`,
                  color: "#94a3b8",
                  fontSize: 15,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                }}
              >
                {copy.placeholder}
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  minHeight: 76,
                  borderRadius: 8,
                  border: `1px solid ${INK.accent}`,
                  boxShadow: "0 0 0 3px #e0e7ff",
                  padding: "10px 12px",
                  fontSize: 17,
                }}
              >
                {copy.commentText.slice(0, review.typed)}
                <span
                  style={{
                    borderLeft: `1.5px solid ${INK.text}`,
                    marginLeft: 1,
                    opacity: frame % 20 < 12 ? 1 : 0,
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <span
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: INK.accent,
                    color: "white",
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  {copy.send}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
