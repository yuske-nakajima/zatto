import { Img } from "remotion";
import logo from "../../src/web/assets/zatto-logo-black.png";
import { Icon } from "../../src/web/icons";
import { Folder } from "./Folder";
import { SearchGlyph } from "./SearchGlyph";
import { INK } from "./style";
import {
  DOCUMENTS,
  type DocumentId,
  type FilmState,
  type PanelView,
} from "./timeline";

/** Workspace names shown in the tour's workspace control. */
export const WORKSPACE_NAMES = { product: "product", launch: "launch" };

/**
 * Browser-local panel geometry; the tour adds the workspace control, the Favorites tab and denser rows.
 * @param tour - Whether the panel is filmed for the feature tour.
 * @returns Vertical positions and sizes the cursor targets.
 */
export function panelLayout(tour: boolean) {
  const workspaceTop = 92 + 119;
  const workspaceHeight = tour ? 56 : 0;
  const tabsTop = workspaceTop + workspaceHeight + 55;
  const rowsTop = tabsTop + 49 + 8;
  const rowHeight = tour ? 60 : 72;
  return {
    workspaceY: workspaceTop + workspaceHeight / 2,
    workspaceHeight,
    tabY: tabsTop + 24,
    rowsTop,
    rowHeight,
    tabs: (tour
      ? ["List", "Folders", "Favorites"]
      : ["List", "Folders"]) as string[],
    searchWidth: tour ? 44 : 50,
  };
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.6l1.95 4 4.4.6-3.2 3.05.78 4.35L8 11.5l-3.93 2.1.78-4.35L1.65 6.2l4.4-.6Z"
        fill={filled ? "#f59e0b" : "none"}
        stroke={filled ? "#f59e0b" : INK.muted}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The filmed file panel follows the app's workspace, list, folder and favorite controls.
 * @param props - Session state at the current frame and whether the tour is filmed.
 * @returns Sidebar with shared entries and mode selection.
 */
export function Panel({ state, tour }: { state: FilmState; tour: boolean }) {
  const layout = panelLayout(tour);
  const tabViews: PanelView[] = ["list", "folders", "favorites"];
  const row = (id: DocumentId, grouped = false) => (
    <div
      key={id}
      style={{
        display: "flex",
        alignItems: "center",
        height: layout.rowHeight,
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
        <div
          style={{ fontSize: 13, marginTop: tour ? 3 : 5, color: INK.muted }}
        >
          {DOCUMENTS[id].file}
        </div>
      </div>
      {id === "plan" && state.reviewing && (
        <span
          style={{
            padding: "2px 7px",
            borderRadius: 6,
            background: "#fef08a",
            color: INK.text,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          In review
        </span>
      )}
      {tour && <Star filled={id === "report" && state.favorite} />}
      <Icon name="link" size={14} />
      <Icon name="trash" size={14} />
    </div>
  );
  const folders = state.entries.filter(
    (id) => !["notes", "release"].includes(id),
  );
  return (
    <div
      style={{
        position: "relative",
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
      {tour && (
        <div
          style={{
            height: layout.workspaceHeight,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 20px",
            borderBottom: `1px solid ${INK.line}`,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: INK.muted }}>
            WORKSPACE
          </span>
          <div
            style={{
              flex: 1,
              height: 34,
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              borderRadius: 7,
              border: `1px solid ${state.workspaceMenu ? INK.accent : INK.line}`,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {WORKSPACE_NAMES[state.workspace]}
            <span style={{ marginLeft: "auto" }}>
              <Icon name="chevronDown" size={12} />
            </span>
          </div>
        </div>
      )}
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
          {state.entries.length}
        </strong>
        <span style={{ marginLeft: "auto", color: INK.accent }}>+ Add</span>
        <span style={{ color: INK.accent }}>Add folder…</span>
        <span style={{ color: INK.muted }}>Clear All</span>
      </div>
      <div
        style={{
          height: 49,
          display: "grid",
          gridTemplateColumns: `${layout.tabs.map(() => "1fr").join(" ")} ${layout.searchWidth}px`,
          borderBottom: `1px solid ${INK.line}`,
          flexShrink: 0,
        }}
      >
        {layout.tabs.map((label, index) => (
          <div
            key={label}
            style={{
              display: "grid",
              placeItems: "center",
              fontSize: tour ? 14 : 15,
              fontWeight: 600,
              color: state.view === tabViews[index] ? INK.accent : INK.muted,
              borderBottom:
                state.view === tabViews[index]
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
      <div style={{ flex: 1, paddingTop: 8, overflow: "hidden" }}>
        {state.view === "folders" ? (
          <>
            <Folder label="workspace" count={state.entries.length} expanded />
            {folders.map((id) => row(id, true))}
            <div style={{ paddingLeft: 15 }}>
              <Folder label="design" count={2} expanded />
              {row("notes", true)}
              {row("release", true)}
            </div>
          </>
        ) : state.view === "favorites" ? (
          row("report")
        ) : (
          state.entries.map((id) => row(id))
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
      {state.workspaceMenu && (
        <div
          style={{
            position: "absolute",
            left: 104,
            top: 119 + layout.workspaceHeight - 6,
            width: 206,
            padding: 5,
            borderRadius: 9,
            background: "white",
            border: `1px solid ${INK.line}`,
            boxShadow: "0 12px 32px #0f172a29",
            fontSize: 15,
          }}
        >
          {(["product", "launch"] as const).map((name) => (
            <div
              key={name}
              style={{
                height: 34,
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                borderRadius: 6,
                background: name === "launch" ? INK.selected : "transparent",
                color: name === "launch" ? INK.accent : INK.text,
              }}
            >
              {name === state.workspace ? "✓ " : " "}
              {WORKSPACE_NAMES[name]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
