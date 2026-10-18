import type { CSSProperties } from "react";
import type { FilmCopy } from "./copy";
import { Diagram } from "./Diagram";
import { Notes } from "./Notes";
import { Plan } from "./Plan";
import { Release } from "./Release";
import { Report } from "./Report";
import type { DocumentId, FilmReview } from "./timeline";

/**
 * Shows a complete HTML-like or Markdown document with a distinct visual hierarchy.
 * @param props - The document, whether its search match is highlighted, and the plan's copy and review.
 * @returns A report, diagram, note, checklist or Markdown plan page.
 */
export function DocumentPreview({
  id,
  copy,
  review,
  highlight = false,
}: {
  id: DocumentId;
  copy: FilmCopy;
  review: FilmReview;
  highlight?: boolean;
}) {
  const style: CSSProperties = {
    height: "100%",
    padding: "30px 38px",
    boxSizing: "border-box",
    overflow: "hidden",
    background: id === "notes" ? "#f8f5ef" : "#fff",
  };
  return (
    <div style={style}>
      {id === "report" ? (
        <Report />
      ) : id === "diagram" ? (
        <Diagram />
      ) : id === "notes" ? (
        <Notes />
      ) : id === "plan" ? (
        <Plan plan={copy.plan} review={review} />
      ) : (
        <Release highlight={highlight} />
      )}
    </div>
  );
}
