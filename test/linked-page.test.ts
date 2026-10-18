import { expect, test } from "vitest";
import type { Entry } from "../src/server/session.js";
import { linkedPageOf } from "../src/web/linked-page.js";

const entry: Entry = {
  id: "a b",
  title: "Index",
  absPath: "/work/docs/index.md",
  addedAt: 1,
};

test("リンクで移った先のページを、登録ファイルのフォルダーからの絶対パスにする", () => {
  expect(linkedPageOf(entry, "/f/a%20b/")).toBeNull();
  expect(linkedPageOf(entry, "/f/other/x.md")).toBeNull();
  expect(linkedPageOf(entry, "/f/a%20b/sub/%E5%AD%90.md")).toEqual({
    absPath: "/work/docs/sub/子.md",
    isViewable: true,
  });
  expect(linkedPageOf(entry, "/f/a%20b/sibling.html")).toMatchObject({
    absPath: "/work/docs/sibling.html",
    isViewable: true,
  });
  expect(linkedPageOf(entry, "/f/a%20b/image.png")).toMatchObject({
    isViewable: false,
  });
});
