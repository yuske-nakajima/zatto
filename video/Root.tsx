import { Composition } from "remotion";
import { SingleTabFilm } from "./single-tab/Film";
import { VIDEO_SPECS } from "./spec";

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
    </>
  );
}
