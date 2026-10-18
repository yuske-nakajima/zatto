import { describe, expect, test } from "vitest";
import { CUE, getFilmState, TOUR } from "../video/single-tab/timeline.js";

describe("single-tab promotion timeline", () => {
  test("adds the AI-written plan before the GUI click opens it in review", () => {
    expect(getFilmState(CUE.added - 1)).toMatchObject({
      added: false,
      selected: "diagram",
      reviewing: false,
    });
    expect(getFilmState(CUE.added)).toMatchObject({
      added: true,
      selected: "diagram",
    });
    expect(getFilmState(CUE.openPlan)).toMatchObject({
      selected: "plan",
      reviewing: true,
    });
  });

  test("comments on the selected sentence, then shows the reply before the edit", () => {
    const length = 12;
    expect(getFilmState(CUE.selectStart, length).review.selection).toBe(0);
    expect(getFilmState(CUE.selectEnd, length).review.selection).toBe(1);
    expect(getFilmState(CUE.openThread - 1, length).review.open).toBe(false);
    expect(getFilmState(CUE.openThread, length).review.open).toBe(true);
    expect(getFilmState(CUE.typeStart, length).review.typed).toBe(0);
    expect(getFilmState(CUE.typeEnd, length).review.typed).toBe(length);
    expect(getFilmState(CUE.send - 1, length).review.sent).toBe(false);
    expect(getFilmState(CUE.send, length).review).toMatchObject({
      sent: true,
      replied: false,
    });
    expect(getFilmState(CUE.reply, length).review).toMatchObject({
      replied: true,
      revised: false,
    });
    expect(getFilmState(CUE.revise, length).review.revised).toBe(true);
    expect(getFilmState(CUE.closeThread, length).review.open).toBe(false);
  });

  test("shows folders, another file and the search workspace after the thread closes", () => {
    expect(getFilmState(CUE.folders).view).toBe("folders");
    expect(getFilmState(CUE.notes).selected).toBe("notes");
    expect(getFilmState(CUE.search).searchVisible).toBe(true);
    expect(getFilmState(CUE.queryStart + 40).query).toBe("release");
  });

  test("rejects invalid frame numbers and opens the plan only after it arrives", () => {
    expect(() => getFilmState(Number.NaN)).toThrow();
    expect(() => getFilmState(-1)).toThrow();
    for (let frame = 0; frame < 750; frame += 1) {
      const state = getFilmState(frame);
      expect(state.selected !== "plan" || state.added).toBe(true);
    }
  });
});

describe("feature tour timeline", () => {
  const tour = (frame: number) => getFilmState(frame, 12, "tour");

  test("shares the review with the short cut", () => {
    for (let frame = 0; frame < CUE.closeThread; frame += 1) {
      expect(tour(frame).review).toEqual(getFilmState(frame, 12).review);
      expect(tour(frame).selected).toBe(getFilmState(frame, 12).selected);
    }
  });

  test("checks the task, then adds and opens the report from the CLI", () => {
    expect(tour(TOUR.checkTask - 1).taskDone).toBe(false);
    expect(tour(TOUR.checkTask).taskDone).toBe(true);
    expect(tour(TOUR.cliAdded - 1).entries).not.toContain("report");
    expect(tour(TOUR.cliAdded).entries.at(-1)).toBe("report");
    expect(tour(TOUR.openReport).selected).toBe("report");
  });

  test("stars the report, shows favorites, folders and search", () => {
    expect(tour(TOUR.star)).toMatchObject({ favorite: true, view: "list" });
    expect(tour(TOUR.favorites).view).toBe("favorites");
    expect(tour(TOUR.folders).view).toBe("folders");
    expect(tour(TOUR.notes).selected).toBe("notes");
    expect(tour(TOUR.search).searchVisible).toBe(true);
  });

  test("switches workspaces, clears search and selects the first file", () => {
    expect(tour(TOUR.workspaceMenu).workspaceMenu).toBe(true);
    expect(tour(TOUR.workspace)).toMatchObject({
      workspace: "launch",
      workspaceMenu: false,
      searchVisible: false,
      entries: ["release", "notes"],
      selected: "release",
    });
  });
});
