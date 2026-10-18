import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import logo from "../../src/web/assets/zatto-logo-black.png";
import type { FilmLocale } from "../spec";
import { FilmBrowser } from "./Browser";
import { FilmCursor } from "./Cursor";
import { FILM_COPY } from "./copy";
import { FONT, INK, MONO, move } from "./style";
import { CliTerminal, FilmTerminal } from "./Terminal";
import { CUE, type FilmVariant, getFilmState, TOUR } from "./timeline";

/**
 * Plays an AI-written document arriving in one browser tab, a comment on it and the AI's reply.
 * The tour continues with task lists, the CLI, favorites, folders, search and workspaces.
 * @param props - Promotion copy language and the cut being filmed.
 * @returns The deterministic twenty-five-second promotion or forty-second tour.
 */
export function SingleTabFilm({
  locale,
  variant = "short",
}: {
  locale: FilmLocale;
  variant?: FilmVariant;
}) {
  const frame = useCurrentFrame();
  const copy = FILM_COPY[locale];
  const tour = variant === "tour";
  const state = getFilmState(frame, copy.commentText.length, variant);
  const ending = tour ? 1068 : 628;
  // 寄り (focus) と引き (wide) の重みで、ブラウザーの位置と倍率を決める
  const focus = tour
    ? move(frame, 195, 218) * move(frame, 600, 625, 1, 0)
    : move(frame, 195, 218);
  const wide = tour
    ? move(frame, TOUR.openReport + 12, TOUR.openReport + 37)
    : move(frame, CUE.closeThread - 7, CUE.closeThread + 18);
  const browserX = 578 - focus * 369 - wide * (tour ? 319 : -50);
  const browserY = 205 - focus * 45 + wide * (tour ? -10 : 35);
  const scale = 0.86 + focus * 0.2 + wide * (tour ? 0.12 : -0.08);
  const sceneOpacity =
    move(frame, 66, 86) * move(frame, ending, ending + 22, 1, 0);
  const title =
    frame < 210
      ? copy.arrive
      : frame < CUE.send + 20
        ? copy.comment
        : frame < CUE.closeThread
          ? copy.reply
          : !tour
            ? copy.oneTab
            : frame < 600
              ? copy.check
              : frame < TOUR.openReport + 20
                ? copy.cli
                : frame < TOUR.folders - 20
                  ? copy.star
                  : frame < TOUR.search - 10
                    ? copy.folders
                    : frame < TOUR.workspaceMenu - 15
                      ? copy.find
                      : copy.switch;
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
          zatto / LOCAL HTML & MARKDOWN VIEWER
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
        <FilmBrowser frame={frame} state={state} copy={copy} tour={tour} />
        <FilmCursor frame={frame} variant={variant} />
      </div>
      <FilmTerminal frame={frame} copy={copy} />
      {tour && <CliTerminal frame={frame} />}
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
          LOCAL HTML & MARKDOWN VIEWER
        </div>
        <div
          style={{
            fontSize: 84,
            letterSpacing: -4,
            lineHeight: 1.42,
            fontWeight: 560,
          }}
        >
          {copy.intro[0]}
          <br />
          {copy.intro[1]}
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
          opacity: move(frame, ending + 8, ending + 30),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `translateY(${move(frame, ending + 8, ending + 32, 13, 0)})`,
        }}
      >
        <div style={{ fontSize: 40, letterSpacing: -1.5, marginBottom: 14 }}>
          {copy.headline}
        </div>
        <div style={{ color: "#717987", fontSize: 23, marginBottom: 46 }}>
          {copy.tagline}
        </div>
        <Img
          src={logo}
          style={{ width: 402, height: 100.5, marginBottom: 46 }}
        />
        <div
          style={{
            fontFamily: MONO,
            fontSize: 24,
            padding: "14px 26px",
            borderRadius: 10,
            background: "#17191f",
            color: "#f8fafc",
          }}
        >
          <span style={{ color: "#a5b4fc", marginRight: 14 }}>❯</span>
          npx @yuske-nakajima/zatto
        </div>
      </div>
    </AbsoluteFill>
  );
}
