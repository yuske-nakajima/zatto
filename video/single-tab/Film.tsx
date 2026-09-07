import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import logo from "../../src/web/assets/zatto-logo-black.png";
import { FilmBrowser } from "./Browser";
import { FilmCursor } from "./Cursor";
import { FONT, INK, MONO, move } from "./style";
import { FilmTerminal } from "./Terminal";
import { getFilmState } from "./timeline";

/**
 * Plays the CLI-to-GUI workflow through one persistent browser tab.
 * @returns The deterministic twenty-second promotion.
 */
export function SingleTabFilm() {
  const frame = useCurrentFrame();
  const state = getFilmState(frame);
  const focus = move(frame, 195, 218);
  const pullback = move(frame, 495, 522);
  const browserX = 578 - focus * 369 + pullback * 50;
  const browserY = 205 - focus * 45 + pullback * 35;
  const scale = 0.86 + focus * 0.2 - pullback * 0.08;
  const sceneOpacity = move(frame, 66, 86) * move(frame, 520, 542, 1, 0);
  const title =
    frame < 210
      ? "開く。"
      : frame < 300
        ? "リスト"
        : frame < 390
          ? "フォルダ"
          : frame < 495
            ? "探す。"
            : "ざっと見る。";
  return (
    <AbsoluteFill
      style={{
        background: INK.stage,
        fontFamily: FONT,
        color: INK.text,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 54,
          left: 66,
          right: 66,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: sceneOpacity,
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 550, letterSpacing: -1 }}>
          {title}
        </div>
        <div
          style={{
            fontFamily: MONO,
            color: "#7c8492",
            fontSize: 12,
            letterSpacing: 2,
          }}
        >
          zatto / LOCAL HTML VIEWER
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: browserX,
          top: browserY,
          opacity: sceneOpacity,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <FilmBrowser state={state} />
        <FilmCursor frame={frame} />
      </div>
      <FilmTerminal frame={frame} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: move(frame, 5, 22) * move(frame, 60, 79, 1, 0),
          display: "flex",
          justifyContent: "center",
          flexDirection: "column",
          padding: "0 205px",
          transform: `translateY(${move(frame, 5, 25, 20, 0)})`,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 15,
            letterSpacing: 3,
            color: "#7b8290",
            marginBottom: 37,
          }}
        >
          LOCAL HTML VIEWER
        </div>
        <div
          style={{
            fontSize: 84,
            letterSpacing: -4,
            lineHeight: 1.42,
            fontWeight: 560,
          }}
        >
          ローカルHTMLを、
          <br />
          ひとつのタブで。
        </div>
        <div
          style={{
            width: 72,
            height: 4,
            background: INK.accent,
            marginTop: 43,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: INK.stage,
          opacity: move(frame, 527, 548),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${move(frame, 527, 550, 13, 0)})`,
        }}
      >
        <div style={{ fontSize: 40, letterSpacing: -1.5, marginBottom: 40 }}>
          ざっと見る。
        </div>
        <Img
          src={logo}
          style={{ width: 402, height: 100.5, marginBottom: 43 }}
        />
        <div style={{ color: "#717987", fontSize: 23, letterSpacing: 0.5 }}>
          ローカルHTMLを、ひとつのタブで。
        </div>
      </div>
    </AbsoluteFill>
  );
}
