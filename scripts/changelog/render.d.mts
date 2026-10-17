/** Captured public release metadata and original source bodies. */
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
/** Hand-authored notes explicitly separated from public releases. */
export interface PendingRelease {
  version: string;
  en: { items: string[]; upgrade: string[] };
  ja: { items: string[]; upgrade: string[] };
}
/** Reconstructs inert markup with an allowlist and HTTPS-only links. */
export function sanitizeReleaseHtml(html: string): string;
/** Renders a deterministic offline release-history document. */
export function renderChangelog(
  snapshot: ReleaseSnapshot,
  pending: PendingRelease,
  locale: "en" | "ja",
): string;
