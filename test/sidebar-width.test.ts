// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  readSidebarWidth,
  storeSidebarWidth,
} from "../src/web/sidebar-width.js";

describe("sidebar width", () => {
  afterEach(() => window.localStorage.clear());

  test("許容範囲外の幅を最小値と最大値へ丸める", () => {
    expect(clampSidebarWidth(MIN_SIDEBAR_WIDTH - 1)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(MAX_SIDEBAR_WIDTH + 1)).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  test("保存した幅を復元し、不正な保存値は既定値として扱う", () => {
    storeSidebarWidth(376);
    expect(readSidebarWidth()).toBe(376);

    window.localStorage.setItem("zatto:sidebar-width", "invalid");
    expect(readSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);
  });
});
