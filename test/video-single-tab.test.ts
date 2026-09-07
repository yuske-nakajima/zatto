import { describe, expect, test } from "vitest";
import { getFilmState } from "../video/single-tab/timeline.js";

describe("single-tab promotion timeline", () => {
  test("adds the report after CLI submission and opens it only after the GUI click", () => {
    expect(getFilmState(133)).toMatchObject({
      submitted: false,
      added: false,
      selected: "diagram",
    });
    expect(getFilmState(134)).toMatchObject({ submitted: true, added: false });
    expect(getFilmState(137)).toMatchObject({
      added: true,
      selected: "diagram",
    });
    expect(getFilmState(166).selected).toBe("report");
  });

  test("shows the list, folder navigation and full search workspace before opening the result", () => {
    expect(getFilmState(234)).toMatchObject({
      selected: "diagram",
      folders: false,
    });
    expect(getFilmState(313).folders).toBe(true);
    expect(getFilmState(329).folderExpanded).toBe(false);
    expect(getFilmState(345).folderExpanded).toBe(true);
    expect(getFilmState(360).selected).toBe("notes");
    expect(getFilmState(403).searchVisible).toBe(true);
    expect(getFilmState(450)).toMatchObject({
      query: "release",
      searchVisible: true,
    });
    expect(getFilmState(478)).toMatchObject({
      selected: "release",
      searchVisible: false,
    });
  });

  test("rejects invalid frame numbers and keeps the selected file in the session", () => {
    expect(() => getFilmState(Number.NaN)).toThrow();
    expect(() => getFilmState(-1)).toThrow();
    for (let frame = 0; frame < 600; frame += 1) {
      const state = getFilmState(frame);
      expect(state.selected !== "report" || state.added).toBe(true);
    }
  });
});
