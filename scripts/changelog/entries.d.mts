export interface ChangelogEntry {
  version: string;
  date: string;
  body: string;
}
export function compareVersions(left: string, right: string): number;
export function parseChangelog(markdown: string): ChangelogEntry[];
export function extractReleaseNotes(markdown: string, version: string): string;
