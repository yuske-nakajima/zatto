import { Img } from "remotion";
import icon from "../../src/web/assets/zatto-icon-192.png";
import { Icon } from "../../src/web/icons";
import { DocumentPreview } from "./Documents";
import { Panel } from "./Panel";
import { FilmSearch } from "./Search";
import { FONT, INK, MONO } from "./style";
import { DOCUMENTS, type FilmState } from "./timeline";

/**
 * A persistent browser window with one zatto tab.
 * @param props - Shared film state.
 * @returns Browser chrome and the app workspace.
 */
export function FilmBrowser({ state }: { state: FilmState }) {
  return (
    <div
      style={{
        width: 1420,
        height: 810,
        background: "white",
        borderRadius: 13,
        overflow: "hidden",
        border: "1px solid #bfc4cd",
        boxShadow: "0 24px 65px #16223a20, 0 2px 6px #16223a12",
        fontFamily: FONT,
        color: INK.text,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          height: 43,
          display: "flex",
          alignItems: "center",
          background: "#e5e7ec",
          gap: 20,
          padding: "0 18px",
        }}
      >
        <div style={{ display: "flex", gap: 7 }}>
          {["#fb625b", "#fdbc40", "#35c94a"].map((color) => (
            <span
              key={color}
              style={{
                width: 10,
                height: 10,
                borderRadius: 10,
                background: color,
              }}
            />
          ))}
        </div>
        <div
          style={{
            alignSelf: "end",
            background: "#fafbfc",
            width: 240,
            height: 35,
            borderRadius: "9px 9px 0 0",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: 11,
            fontSize: 13,
          }}
        >
          <Img src={icon} style={{ width: 17, height: 17 }} />
          <span>zatto</span>
          <span style={{ marginLeft: "auto", color: INK.muted }}>×</span>
        </div>
        <span style={{ color: "#667080", fontSize: 19 }}>+</span>
      </div>
      <div
        style={{
          height: 49,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "0 22px",
          background: "#fafbfc",
          borderBottom: `1px solid ${INK.line}`,
          fontSize: 19,
          color: INK.muted,
        }}
      >
        <span>←</span>
        <span style={{ opacity: 0.4 }}>→</span>
        <span>↻</span>
        <div
          style={{
            background: "#eceef2",
            borderRadius: 16,
            height: 31,
            flex: 1,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            fontSize: 13,
            color: "#4b5563",
          }}
        >
          <span style={{ marginRight: 10 }}>ⓘ</span>localhost:6280
        </div>
        <span>⋮</span>
      </div>
      <div style={{ height: 684, display: "flex" }}>
        <Panel state={state} />
        {state.searchVisible ? (
          <FilmSearch query={state.query} />
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                height: 72,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "0 28px",
                borderBottom: `1px solid ${INK.line}`,
              }}
            >
              <Icon name="terminal" size={17} />
              <span style={{ fontFamily: MONO, fontSize: 14, flex: 1 }}>
                {DOCUMENTS[state.selected].path}
              </span>
              <span
                style={{
                  display: "flex",
                  gap: 7,
                  alignItems: "center",
                  padding: "8px 11px",
                  fontSize: 13,
                  border: `1px solid ${INK.line}`,
                  borderRadius: 6,
                }}
              >
                <Icon name="clipboardCopy" size={14} />
                Copy Path
              </span>
              <Icon name="trash" size={15} />
            </div>
            <div
              style={{
                height: 612,
                padding: 22,
                boxSizing: "border-box",
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 9,
                  border: `1px solid ${INK.line}`,
                  overflow: "hidden",
                }}
              >
                <DocumentPreview
                  id={state.selected}
                  highlight={
                    state.selected === "release" && Boolean(state.query)
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          height: 34,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          borderTop: `1px solid ${INK.line}`,
          color: INK.muted,
          fontSize: 11,
          gap: 8,
        }}
      >
        <span>Docs</span>
        <span style={{ marginLeft: "auto" }}>Connected</span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 6,
            background: "#10b981",
          }}
        />
      </div>
    </div>
  );
}
