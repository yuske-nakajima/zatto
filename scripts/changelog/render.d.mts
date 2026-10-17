/** Immutable public metadata imported before release PR automation. */
export interface ReleaseSnapshot {
  repository: string;
  releases: Array<{
    tag: string;
    name: string;
    publishedAt: string;
    url: string;
    bodyHtml: string;
    body?: string;
  }>;
}
export function sanitizeReleaseHtml(html: string): string;
/** Renders CHANGELOG.md entries through the package version. */
export function renderChangelog(
  snapshot: ReleaseSnapshot,
  markdown: string,
  version: string,
  locale: "en" | "ja",
): string;
