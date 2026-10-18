import { BubbleIcon } from "../../src/web/BubbleIcon";
import type { FilmCopy } from "./copy";
import { INK, MONO } from "./style";
import type { FilmReview } from "./timeline";

/** Selection color of the app's review highlights. */
export const REVIEW_MARK = "#fde047";

const rule = { borderBottom: `1px solid ${INK.line}`, paddingBottom: 10 };

/**
 * Presents the Markdown plan with the commented sentence and its thread marker.
 * @param props - Localized plan copy and review progress.
 * @returns The rendered Markdown document.
 */
export function Plan({
  plan,
  review,
}: {
  plan: FilmCopy["plan"];
  review: FilmReview;
}) {
  const thread = review.sent;
  const text = review.revised ? plan.revised : plan.sentence;
  return (
    <div style={{ position: "relative", maxWidth: 820, fontSize: 21 }}>
      <h1
        style={{
          ...rule,
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: -0.5,
          margin: "0 0 14px",
        }}
      >
        {plan.title}
      </h1>
      <p style={{ color: INK.muted, fontSize: 17, margin: "0 0 26px" }}>
        {plan.meta}
      </p>
      <h2
        style={{ ...rule, fontSize: 26, fontWeight: 650, margin: "0 0 16px" }}
      >
        {plan.goal}
      </h2>
      <p style={{ margin: "0 0 30px", lineHeight: 1.6 }}>
        <span
          style={{
            background: `linear-gradient(${REVIEW_MARK}, ${REVIEW_MARK}) no-repeat`,
            backgroundSize: `${(thread ? 1 : review.selection) * 100}% 100%`,
            padding: "2px 0",
          }}
        >
          {text}
        </span>
      </p>
      <h2
        style={{ ...rule, fontSize: 26, fontWeight: 650, margin: "0 0 16px" }}
      >
        {plan.tasks}
      </h2>
      {plan.items.map(([label, done]) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            margin: "0 0 14px 6px",
          }}
        >
          <span style={{ color: INK.muted }}>•</span>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 20,
              height: 20,
              borderRadius: 4,
              border: done ? "none" : "1.5px solid #94a3b8",
              background: done ? "#2563eb" : "white",
              color: "white",
              fontSize: 14,
              fontFamily: MONO,
            }}
          >
            {done ? "✓" : ""}
          </span>
          {label}
        </div>
      ))}
      {thread && (
        <span
          style={{
            position: "absolute",
            right: -150,
            top: 182,
            display: "flex",
            alignItems: "center",
            gap: 3,
            padding: "2px 7px",
            borderRadius: 10,
            border: "1.5px solid #ca8a04",
            background: "#fef9c3",
            color: "#a16207",
            fontSize: 13,
          }}
        >
          <BubbleIcon size={14} />1
        </span>
      )}
    </div>
  );
}
