import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import {
  renderChangelog,
  sanitizeReleaseHtml,
} from "../scripts/changelog/render.mjs";

test("release HTML drops executable content, external resources, and unsafe links", () => {
  const input =
    '<h2 onclick="alert(1)">Changes</h2><script>alert(1)</script><style>body{display:none}</style><img src="https://example.com/x"><iframe src="https://example.com"></iframe><svg onload="alert(1)"><script>alert(1)</script></svg><p style="color:red">Text <a href="javascript:alert(1)">bad</a><a href="https://example.com/a?x=1&amp;y=2" onclick="bad()">good</a><a href="//example.com">relative</a><code>&lt;script&gt;</code></p>';
  const sanitized = sanitizeReleaseHtml(input);
  const document = new JSDOM(sanitized).window.document;
  expect(document.querySelectorAll("script,style,img,iframe,svg")).toHaveLength(
    0,
  );
  expect(document.querySelectorAll("[onclick],[onload],[style]")).toHaveLength(
    0,
  );
  expect(document.querySelectorAll("a")).toHaveLength(1);
  expect(document.querySelector("a")?.getAttribute("href")).toBe(
    "https://example.com/a?x=1&y=2",
  );
  expect(document.querySelector("code")?.textContent).toBe("<script>");
  expect(document.body.textContent).toContain("Text badgoodrelative");
});
test("metadata is escaped and unreleased work remains separate from published releases", () => {
  const snapshot = {
    repository: "yuske-nakajima/zatto",
    releases: [
      {
        tag: "<img src=x onerror=bad()>",
        name: "<script>bad</script>",
        publishedAt: "2026-10-17T00:00:00Z",
        url: "javascript:bad()",
        bodyHtml: "<p>Published</p>",
      },
    ],
  };
  const pending = {
    version: "2.0.0",
    en: { items: ["Pending RPC"], upgrade: ["zatto --stop"] },
    ja: { items: ["未公開RPC"], upgrade: ["zatto --stop"] },
  };
  const html = renderChangelog(snapshot, pending, "en");
  const document = new JSDOM(html).window.document;
  expect(document.querySelectorAll("script,img")).toHaveLength(0);
  expect(document.querySelectorAll('[href^="javascript:"]')).toHaveLength(0);
  expect(
    document.querySelector('[data-unreleased="2.0.0"]')?.textContent,
  ).toContain("Pending RPC");
  expect(document.querySelectorAll("article[data-release]")).toHaveLength(1);
});
test("checked-in English and Japanese pages reproducibly contain all captured releases", async () => {
  const snapshot = JSON.parse(
    await readFile("scripts/changelog/releases.json", "utf8"),
  );
  const pending = JSON.parse(
    await readFile("scripts/changelog/pending.json", "utf8"),
  );
  expect(snapshot.releases.length).toBeGreaterThanOrEqual(17);
  const tags = snapshot.releases.map((release: { tag: string }) => release.tag);
  for (const locale of ["en", "ja"] as const) {
    const html = renderChangelog(snapshot, pending, locale);
    expect(
      await readFile(`src/web/public/docs/${locale}/changelog.html`, "utf8"),
    ).toBe(html);
    const document = new JSDOM(html).window.document;
    expect(
      Array.from(document.querySelectorAll("article[data-release]"), (node) =>
        node.getAttribute("data-release"),
      ),
    ).toEqual(tags);
    expect(document.documentElement.lang).toBe(locale);
    expect(document.querySelectorAll("script,img,iframe,link")).toHaveLength(0);
    for (const release of snapshot.releases)
      expect(document.querySelector(`a[href="${release.url}"]`)).not.toBeNull();
  }
});
