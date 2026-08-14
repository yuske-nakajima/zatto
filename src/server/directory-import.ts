import type { Stats } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export type DirectoryImportMode = "direct" | "recursive";

interface PathIdentity {
  dev: number;
  ino: number;
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface ValidatedPath {
  absolutePath: string;
  canonicalPath: string;
  identity: PathIdentity;
}

type PathKind = "directory" | "file";

/**
 * Enumerates regular HTML files within a selected directory without following
 * symbolic links. Every selected path is revalidated before the result is
 * returned so a changed filesystem causes the complete import to fail.
 *
 * @param rootPath - Absolute path of the selected directory
 * @param mode - Whether to inspect only direct children or all descendants
 * @returns Absolute HTML paths sorted by relative Unicode code-point order
 * @throws When a selected path is invalid, changes during inspection, escapes
 * the selected root, or cannot be read
 */
export async function enumerateHtmlFiles(
  rootPath: string,
  mode: DirectoryImportMode,
): Promise<string[]> {
  const absoluteRoot = path.resolve(rootPath);
  const root = await validatePath(absoluteRoot, "directory", undefined, true);
  const files: ValidatedPath[] = [];
  await collectHtmlPaths(root, root, mode, files);
  files.sort((left, right) =>
    compareCodePoints(
      path.relative(root.absolutePath, left.absolutePath),
      path.relative(root.absolutePath, right.absolutePath),
    ),
  );

  await revalidatePath(root, root, "directory");
  for (const file of files) {
    await revalidatePath(file, root, "file");
  }
  await revalidatePath(root, root, "directory");
  return files.map((file) => file.absolutePath);
}

async function collectHtmlPaths(
  directory: ValidatedPath,
  root: ValidatedPath,
  mode: DirectoryImportMode,
  output: ValidatedPath[],
): Promise<void> {
  await revalidatePath(directory, root, "directory");
  const entries = await readdir(directory.absolutePath, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const absolutePath = path.join(directory.absolutePath, entry.name);
    if (entry.isFile() && isHtmlPath(entry.name)) {
      output.push(await validatePath(absolutePath, "file", root));
    } else if (mode === "recursive" && entry.isDirectory()) {
      const child = await validatePath(absolutePath, "directory", root);
      await collectHtmlPaths(child, root, mode, output);
    }
  }
  await revalidatePath(directory, root, "directory");
}

async function validatePath(
  absolutePath: string,
  kind: PathKind,
  root?: ValidatedPath,
  selectedRoot = false,
): Promise<ValidatedPath> {
  const before = await lstat(absolutePath);
  assertPathKind(before, kind, selectedRoot);
  const canonicalBefore = await realpath(absolutePath);
  if (root) assertWithinRoot(canonicalBefore, root.canonicalPath);

  const after = await lstat(absolutePath);
  assertPathKind(after, kind, selectedRoot);
  const canonicalAfter = await realpath(absolutePath);
  if (
    canonicalBefore !== canonicalAfter ||
    !sameIdentity(toIdentity(before), toIdentity(after))
  ) {
    throw new Error("ディレクトリの読み取り中にファイル構成が変更されました");
  }
  if (root) assertWithinRoot(canonicalAfter, root.canonicalPath);
  return {
    absolutePath,
    canonicalPath: canonicalAfter,
    identity: toIdentity(after),
  };
}

async function revalidatePath(
  expected: ValidatedPath,
  root: ValidatedPath,
  kind: PathKind,
): Promise<void> {
  const current = await validatePath(expected.absolutePath, kind, root);
  if (!sameIdentity(current.identity, expected.identity)) {
    throw new Error("ディレクトリの読み取り中にファイル構成が変更されました");
  }
}

function assertPathKind(
  stats: Stats,
  kind: PathKind,
  selectedRoot: boolean,
): void {
  const matches = kind === "directory" ? stats.isDirectory() : stats.isFile();
  if (stats.isSymbolicLink() || !matches) {
    if (selectedRoot) {
      throw new Error("選択対象は通常のディレクトリである必要があります");
    }
    throw new Error(
      "選択対象には通常のファイルとディレクトリだけを指定できます",
    );
  }
}

function assertWithinRoot(candidate: string, root: string): void {
  const relativePath = path.relative(root, candidate);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`)) {
    throw new Error("選択したディレクトリの外部は読み取れません");
  }
}

function toIdentity(stats: Stats): PathIdentity {
  return {
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
  };
}

function sameIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function isHtmlPath(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".html" || extension === ".htm";
}

function compareCodePoints(left: string, right: string): number {
  const leftCodePoints = Array.from(left);
  const rightCodePoints = Array.from(right);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference =
      (leftCodePoints[index]?.codePointAt(0) ?? 0) -
      (rightCodePoints[index]?.codePointAt(0) ?? 0);
    if (difference !== 0) return difference;
  }
  return leftCodePoints.length - rightCodePoints.length;
}
