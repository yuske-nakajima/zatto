import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(resolve("src/web/preview-page-search.css"), "utf8");

describe("preview page search styles", () => {
  test("右上配置・可変幅・操作領域・視覚階層を定義する", () => {
    expect(css).toContain("position: absolute");
    expect(css).toContain("max-width: 340px");
    expect(css).toMatch(/width:\s*(?:min\(|calc\()/u);
    expect(css).toContain("font-size: 13px");
    expect(css).toMatch(/min-(?:width|inline-size):\s*2[4-8]px/u);
    expect(css).toContain("border-radius: 8px");
    expect(css).toContain("box-shadow:");
    expect(css).toContain("border: 1px solid var(--color-border-default)");
    expect(css).toMatch(/box-shadow:[^;]+,[^;]+;/u);
    expect(css).toMatch(
      /\.preview-page-search input\s*\{[^}]*padding:\s*0 8px[^}]*border-radius:\s*4px[^}]*background:\s*var\(--color-bg-hover\)/su,
    );
  });
});
