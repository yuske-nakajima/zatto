import { Img } from "remotion";
import logo from "../../src/web/assets/zatto-logo-black.png";
import { Icon } from "../../src/web/icons";
import { Folder } from "./Folder";
import { SearchGlyph } from "./SearchGlyph";
import { INK } from "./style";
import { DOCUMENTS, type DocumentId, type FilmState } from "./timeline";

/**
 * The filmed file panel follows the app's list and folder controls.
 * @param props - Session state at the current frame.
 * @returns Sidebar with shared entries and mode selection.
 */
export function Panel({ state }: { state: FilmState }) {
  const row = (id: DocumentId, grouped = false) => (
    <div
      key={id}
      style={{
        display: "flex",
        alignItems: "center",
        height: 72,
        padding: "0 14px",
        marginLeft: grouped ? 24 : 0,
        gap: 12,
        borderLeft:
          state.selected === id
            ? `3px solid ${INK.accent}`
            : "3px solid transparent",
        background: state.selected === id ? INK.selected : "transparent",
        color: state.selected === id ? INK.accent : INK.text,
      }}
    >
      {!grouped && <Icon name="gripDefault" size={12} />}
      <div style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>
          {DOCUMENTS[id].title}
        </div>
        <div style={{ fontSize: 13, marginTop: 5, color: INK.muted }}>
          {DOCUMENTS[id].file}
        </div>
      </div>
      <Icon name="link" size={14} />
      <Icon name="trash" size={14} />
    </div>
  );
  return (
    <div
      style={{
        width: 330,
        background: "#fff",
        flexShrink: 0,
        borderRight: `1px solid ${INK.line}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 119,
          boxSizing: "border-box",
          padding: "28px 22px",
          borderBottom: `1px solid ${INK.line}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 650,
            color: INK.muted,
            marginBottom: 9,
          }}
        >
          LOCAL HTML VIEWER
        </div>
        <Img src={logo} style={{ width: 125, height: 31.25 }} />
      </div>
      <div
        style={{
          height: 55,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          fontSize: 10,
          borderBottom: `1px solid ${INK.line}`,
          gap: 7,
        }}
      >
        <span style={{ fontWeight: 700, color: INK.muted }}>ENTRIES</span>
        <strong
          style={{ background: INK.line, borderRadius: 10, padding: "2px 7px" }}
        >
          {state.added ? 4 : 3}
        </strong>
        <span style={{ marginLeft: "auto", color: INK.accent }}>+ Add</span>
        <span style={{ color: INK.accent }}>Add folder…</span>
        <span style={{ color: INK.muted }}>Clear All</span>
      </div>
      <div
        style={{
          height: 49,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 50px",
          borderBottom: `1px solid ${INK.line}`,
          flexShrink: 0,
        }}
      >
        {["List", "Folders"].map((label, index) => (
          <div
            key={label}
            style={{
              display: "grid",
              placeItems: "center",
              fontSize: 15,
              fontWeight: 600,
              color: state.folders === Boolean(index) ? INK.accent : INK.muted,
              borderBottom:
                state.folders === Boolean(index)
                  ? `2px solid ${INK.accent}`
                  : "2px solid transparent",
            }}
          >
            {label}
          </div>
        ))}
        <div
          style={{
            display: "grid",
            placeItems: "center",
            borderLeft: `1px solid ${INK.line}`,
            background: state.searchVisible ? INK.selected : "transparent",
          }}
        >
          <SearchGlyph />
        </div>
      </div>
      <div style={{ flex: 1, paddingTop: 8 }}>
        {state.folders ? (
          <>
            <Folder label="workspace" count={4} expanded />
            {row("diagram", true)}
            {row("report", true)}
            <div style={{ paddingLeft: 15 }}>
              <Folder
                label="design"
                count={2}
                expanded={state.folderExpanded}
              />
              {state.folderExpanded && (
                <>
                  {row("notes", true)}
                  {row("release", true)}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {row("diagram")}
            {row("notes")}
            {row("release")}
            {state.added && row("report")}
          </>
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 26,
          padding: "18px 20px",
          borderTop: `1px solid ${INK.line}`,
          fontSize: 13,
          color: INK.muted,
        }}
      >
        <span>Import ▾</span>
        <span>Export ▾</span>
      </div>
    </div>
  );
}
