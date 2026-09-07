import type { CSSProperties } from "react";
import { Diagram } from "./Diagram";
import { Notes } from "./Notes";
import { Release } from "./Release";
import { Report } from "./Report";
import type { DocumentId } from "./timeline";

/**
 * Shows a complete HTML-like document with a distinct visual hierarchy.
 * @param props - The document identifier and whether its search match is highlighted.
 * @returns A report, diagram, note or checklist page.
 */
export function DocumentPreview({
  id,
  highlight = false,
}: {
  id: DocumentId;
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
      ) : (
        <Release highlight={highlight} />
      )}
    </div>
  );
}
