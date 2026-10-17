import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import {
  compareVersions,
  extractReleaseNotes,
  parseChangelog,
} from "../scripts/changelog/entries.mjs";
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
test("release entries preserve Markdown bodies and ignore headings inside code fences", () => {
  const body =
    "### Features\n\n* **RPC** and `CLI`\n\n[reference][target]\n\n[target]: https://example.com\n\n```md\n## 99.0.0 (2026-10-17)\n```";
  const markdown = `# Changelog\n\n## [2.0.0](https://example.com/compare) (2026-10-17)\n\n${body}\n\n## 1.2.0 (2026-10-16)\n\nLegacy\n`;
  expect(parseChangelog(markdown)).toHaveLength(2);
  expect(extractReleaseNotes(markdown, "2.0.0")).toBe(body);
  expect(() => extractReleaseNotes(markdown, "1.3.0")).toThrow("Missing");
  expect(() =>
    parseChangelog(`${markdown}\n## 2.0.0 (2026-10-17)\nDuplicate`),
  ).toThrow("Duplicate");
  expect(() => parseChangelog("## 2.0.0-beta.1 (2026-10-17)\nNotes")).toThrow(
    "stable",
  );
  expect(() => extractReleaseNotes("## 2.0.0 (2026-10-17)\n", "2.0.0")).toThrow(
    "Missing",
  );
  expect(compareVersions("2.10.0", "2.9.0")).toBe(1);
});

test.each(["\r\n", "\r"])(
  "release notes normalize %j line endings consistently",
  (lineEnding) => {
    const body =
      "### Features\n\n* RPC\n\n```md\n## 99.0.0 (2026-10-17)\n```\n\n[reference][target]\n\n[target]: https://example.com";
    const markdown = `# Changelog\n\n## 2.0.0 (2026-10-17)\n\n${body}\n\n## 1.2.0 (2026-10-16)\n\nLegacy\n`;
    const converted = markdown.replaceAll("\n", lineEnding);
    expect(parseChangelog(converted)).toEqual(parseChangelog(markdown));
    expect(extractReleaseNotes(converted, "2.0.0")).toBe(body);
    const snapshot = { repository: "test", releases: [] };
    expect(renderChangelog(snapshot, converted, "2.0.0", "en")).toBe(
      renderChangelog(snapshot, markdown, "2.0.0", "en"),
    );
  },
);

test("canonical generated notes render safely without publication status or future versions", () => {
  const markdown = `# Changelog

## [2.1.0](https://example.com/future) (2026-10-18)

Future feature

## [2.0.0](https://example.com/compare) (2026-10-17)

### Features

* **RPC**: \`POST /rpc\`

| Client | Transport |
| --- | --- |
| CLI | RPC |

![remote](https://example.com/image.png)
<script>alert(1)</script>
<a href="javascript:bad()">unsafe</a>
`;
  for (const locale of ["en", "ja"] as const) {
    const document = new JSDOM(
      renderChangelog(
        { repository: "test", releases: [] },
        markdown,
        "2.0.0",
        locale,
      ),
    ).window.document;
    expect(document.querySelectorAll("article[data-release]")).toHaveLength(1);
    expect(
      document.querySelector("article")?.getAttribute("data-release"),
    ).toBe("v2.0.0");
    expect(document.querySelector("strong")?.textContent).toBe("RPC");
    expect(document.querySelector("table td")?.textContent).toBe("CLI");
    expect(
      document.querySelectorAll(
        "script,img,iframe,[data-unreleased],[href^='javascript:']",
      ),
    ).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(
      /Unreleased|未公開|Future feature/,
    );
  }
});

test("checked-in English and Japanese pages reproducibly contain all canonical historical notes", async () => {
  const snapshot = JSON.parse(
    await readFile("scripts/changelog/releases.json", "utf8"),
  );
  const markdown = await readFile("CHANGELOG.md", "utf8");
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  expect(snapshot.releases).toHaveLength(17);
  const entries = parseChangelog(markdown);
  for (const release of snapshot.releases) {
    expect(extractReleaseNotes(markdown, release.tag.replace(/^v/, ""))).toBe(
      release.body.trim(),
    );
  }
  const tags = entries
    .filter((entry) => compareVersions(entry.version, version) <= 0)
    .map((entry) => `v${entry.version}`);
  for (const locale of ["en", "ja"] as const) {
    const html = renderChangelog(snapshot, markdown, version, locale);
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
    for (const release of snapshot.releases) {
      expect(document.querySelector(`a[href="${release.url}"]`)).not.toBeNull();
    }
  }
});
