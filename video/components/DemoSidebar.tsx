import { COLORS } from "../theme";
import { BrandLogo } from "./BrandLogo";

const ENTRIES = ["page.html", "report.html", "notes.html"];

interface DemoSidebarProps {
  selectedIndex: number;
}

export function DemoSidebar({ selectedIndex }: DemoSidebarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${COLORS.border}`,
      }}
    >
      <div
        style={{
          padding: "24px 20px 18px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            color: COLORS.muted,
            fontSize: 9,
            fontWeight: 750,
            letterSpacing: 1.2,
          }}
        >
          LOCAL HTML VIEWER
        </div>
        <div style={{ marginTop: 6 }}>
          <BrandLogo width={105} />
        </div>
      </div>
      <div
        style={{
          padding: "12px 18px",
          color: COLORS.muted,
          fontSize: 11,
          fontWeight: 750,
        }}
      >
        ENTRIES
        <span
          style={{
            marginLeft: 6,
            padding: "3px 7px",
            borderRadius: 10,
            background: COLORS.border,
            color: COLORS.ink,
          }}
        >
          3
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, padding: "0 14px 10px" }}>
        {["List", "Folders", "⌕"].map((label) => (
          <span
            key={label}
            style={{
              flex: 1,
              padding: "7px 5px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              color: COLORS.muted,
              fontSize: 11,
              textAlign: "center",
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        {ENTRIES.map((entry, index) => {
          const active = index === selectedIndex;
          return (
            <div
              key={entry}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "4px 10px",
                padding: "12px 11px",
                borderRadius: 7,
                background: active ? COLORS.indigoSoft : "transparent",
                color: active ? COLORS.indigo : COLORS.ink,
                fontSize: 13,
                fontWeight: active ? 700 : 520,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 7,
                  background: active ? COLORS.indigo : COLORS.faint,
                }}
              />
              {entry}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "12px 18px",
          borderTop: `1px solid ${COLORS.border}`,
          color: COLORS.muted,
          fontSize: 11,
        }}
      >
        <span>Docs</span>
        <span>
          Connected <b style={{ color: COLORS.green }}>●</b>
        </span>
      </div>
    </div>
  );
}
