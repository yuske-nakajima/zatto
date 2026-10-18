import { Composition } from "remotion";
import { SingleTabFilm } from "./single-tab/Film";
import { TOUR_SPECS, VIDEO_SPECS } from "./spec";

export function VideoRoot() {
  return (
    <>
      {(["en", "ja"] as const).map((locale) => (
        <Composition
          key={locale}
          {...VIDEO_SPECS[locale]}
          component={SingleTabFilm}
          defaultProps={{ locale }}
        />
      ))}
      {(["en", "ja"] as const).map((locale) => (
        <Composition
          key={`tour-${locale}`}
          {...TOUR_SPECS[locale]}
          component={SingleTabFilm}
          defaultProps={{ locale, variant: "tour" as const }}
        />
      ))}
    </>
  );
}
