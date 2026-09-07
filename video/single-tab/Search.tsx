import { SearchGlyph } from "./SearchGlyph";
import { INK, MONO } from "./style";

/**
 * Global HTML search replaces the preview with grouped source matches.
 * @param props - The query typed in the current frame.
 * @returns Search field, result count and clickable-looking source lines.
 */
export function FilmSearch({ query }: { query: string }) {
  const ready = query === "release";
  return (
    <div style={{ flex: 1, background: "#f8fafc" }}>
      <div
        style={{
          height: 72,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "0 28px",
          boxSizing: "border-box",
          background: "#fff",
          borderBottom: `1px solid ${INK.line}`,
        }}
      >
        <span style={{ color: INK.muted }}>⊟</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flex: 1,
            height: 42,
            padding: "0 14px",
            borderRadius: 6,
            border: `1px solid ${INK.accent}`,
            boxShadow: "0 0 0 3px #e0e7ff",
            fontSize: 18,
          }}
        >
          <SearchGlyph />
          <span style={{ color: query ? INK.text : INK.muted }}>
            {query || "Search HTML files"}
          </span>
          <span
            style={{
              height: 20,
              borderLeft: `1px solid ${INK.text}`,
              marginLeft: -12,
            }}
          />
        </div>
        <span style={{ fontSize: 13, color: INK.muted, width: 136 }}>
          {ready ? "3 matches in 1 file" : ""}
        </span>
        <span>×</span>
      </div>
      {ready ? (
        <div style={{ padding: 30 }}>
          <div
            style={{
              background: "white",
              border: `1px solid ${INK.line}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "23px 22px",
                gap: 17,
                borderBottom: `1px solid ${INK.line}`,
              }}
            >
              <span style={{ color: INK.muted }}>⌄</span>
              <div>
                <strong style={{ fontSize: 20 }}>release.html</strong>
                <div
                  style={{
                    color: INK.muted,
                    fontFamily: MONO,
                    fontSize: 13,
                    marginTop: 8,
                  }}
                >
                  /workspace/design/release.html
                </div>
              </div>
              <span
                style={{ marginLeft: "auto", color: INK.muted, fontSize: 14 }}
              >
                3 matches
              </span>
            </div>
            {[
              ["12", "<h1>", "Release", " checklist</h1>"],
              ["13", "<p>Ready for the next ", "release", ".</p>"],
              ["21", "<li>Prepare the ", "release", " notes</li>"],
            ].map(([line, before, match, after]) => (
              <div
                key={line}
                style={{
                  display: "flex",
                  padding: "21px 20px",
                  background: line === "12" ? "#f5f6ff" : "white",
                  gap: 24,
                  fontFamily: MONO,
                  fontSize: 17,
                }}
              >
                <span
                  style={{ color: "#94a3b8", width: 24, textAlign: "right" }}
                >
                  {line}
                </span>
                <code>
                  {before}
                  <mark style={{ background: "#fef08a", color: "#0f172a" }}>
                    {match.slice(0, query.length)}
                  </mark>
                  {match.slice(query.length)}
                  {after}
                </code>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", marginTop: 225 }}>
          <strong style={{ fontSize: 21 }}>
            {query ? "Searching HTML files…" : "Search HTML files"}
          </strong>
          <p style={{ color: INK.muted, fontSize: 16 }}>
            {query ? "" : "Enter text to search the HTML in this session."}
          </p>
        </div>
      )}
    </div>
  );
}
