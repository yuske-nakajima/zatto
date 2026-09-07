import { COLORS } from "../theme";

const ENTRIES = ["page.html", "report.html", "notes.html"];
const TITLES = ["Product Preview", "Weekly Report", "Release Notes"];
const ACCENTS = [COLORS.indigo, COLORS.green, "#f59e0b"];

interface DemoPreviewProps {
  index: number;
}

export function DemoPreview({ index }: DemoPreviewProps) {
  const accent = ACCENTS[index];
  return (
    <div
      style={{ height: "100%", padding: "48px 54px", background: COLORS.app }}
    >
      <div
        style={{
          color: COLORS.muted,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1.8,
        }}
      >
        {ENTRIES[index].toUpperCase()}
      </div>
      <div
        style={{
          marginTop: 12,
          color: COLORS.ink,
          fontSize: 38,
          fontWeight: 760,
        }}
      >
        {TITLES[index]}
      </div>
      <div
        style={{
          marginTop: 9,
          width: 360,
          height: 10,
          borderRadius: 10,
          background: COLORS.border,
        }}
      />
      <div
        style={{
          marginTop: 8,
          width: 270,
          height: 10,
          borderRadius: 10,
          background: COLORS.border,
        }}
      />
      <div style={{ display: "flex", gap: 18, marginTop: 38 }}>
        {[0, 1, 2].map((card) => (
          <div
            key={card}
            style={{
              flex: 1,
              height: card === 1 && index === 1 ? 185 : 150,
              padding: 18,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              background: COLORS.surface,
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 7,
                borderRadius: 6,
                background: accent,
              }}
            />
            {[`${72 - card * 10}%`, "88%", "62%"].map((width, row) => (
              <div
                key={width}
                style={{
                  marginTop: row === 0 ? 23 : 8,
                  width,
                  height: row === 0 ? 10 : 8,
                  borderRadius: 8,
                  background: row === 0 ? COLORS.border : "#f1f5f9",
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
