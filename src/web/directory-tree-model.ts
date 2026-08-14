import type { Entry } from "../server/session.js";

export interface DirectoryTreeNode {
  directory: string;
  name: string;
  entries: Entry[];
  children: DirectoryTreeNode[];
}

/**
 * Collects session entry IDs contained directly or transitively in a directory.
 *
 * @param node - Directory subtree whose session entries are collected
 * @returns Entry IDs in tree traversal order
 */
export function collectDirectoryEntryIds(node: DirectoryTreeNode): string[] {
  return [
    ...node.entries.map(({ id }) => id),
    ...node.children.flatMap(collectDirectoryEntryIds),
  ];
}

/**
 * Determines whether a directory subtree contains the selected session entry.
 *
 * @param node - Directory subtree to inspect
 * @param selectedId - Selected session entry ID, or null when no entry is selected
 * @returns Whether the selected entry exists in the subtree
 */
export function directoryContainsEntry(
  node: DirectoryTreeNode,
  selectedId: string | null,
): boolean {
  return (
    selectedId !== null &&
    (node.entries.some((entry) => entry.id === selectedId) ||
      node.children.some((child) => directoryContainsEntry(child, selectedId)))
  );
}

interface ParsedDirectory {
  root: string;
  rootKey: string;
  separator: "/" | "\\";
  segments: string[];
}

interface DirectoryEntry {
  entry: Entry;
  directory: ParsedDirectory;
}

export function buildDirectoryTree(entries: Entry[]): DirectoryTreeNode[] {
  const entriesByRoot = new Map<string, DirectoryEntry[]>();
  for (const entry of entries) {
    const directory = parseParentDirectory(entry.absPath);
    const rootEntries = entriesByRoot.get(directory.rootKey) ?? [];
    rootEntries.push({ entry, directory });
    entriesByRoot.set(directory.rootKey, rootEntries);
  }

  return [...entriesByRoot.values()].map((rootEntries) => {
    const firstDirectory = rootEntries[0].directory;
    const commonSegments = findCommonSegments(
      rootEntries.map(({ directory }) => directory),
    );
    const treeRoot: DirectoryTreeNode = {
      directory: formatDirectory(firstDirectory, commonSegments),
      name:
        commonSegments.at(-1) ??
        (firstDirectory.root === "/" ? "/" : firstDirectory.root),
      entries: [],
      children: [],
    };

    for (const { entry, directory } of rootEntries) {
      let parent = treeRoot;
      const relativeSegments = directory.segments.slice(commonSegments.length);
      for (let index = 0; index < relativeSegments.length; index += 1) {
        const segments = [
          ...commonSegments,
          ...relativeSegments.slice(0, index + 1),
        ];
        const directoryPath = formatDirectory(firstDirectory, segments);
        let child = parent.children.find(
          (node) =>
            normalizeDirectoryKey(node.directory, directory.rootKey) ===
            normalizeDirectoryKey(directoryPath, directory.rootKey),
        );
        if (!child) {
          child = {
            directory: directoryPath,
            name: relativeSegments[index],
            entries: [],
            children: [],
          };
          parent.children.push(child);
        }
        parent = child;
      }
      parent.entries.push(entry);
    }

    return treeRoot;
  });
}

function parseParentDirectory(absPath: string): ParsedDirectory {
  const separator = absPath.includes("\\") ? "\\" : "/";
  const directory = parentDirectory(absPath);
  const driveMatch = directory.match(/^([A-Za-z]:)(?:\/|$)/);
  if (driveMatch) {
    return {
      root: driveMatch[1],
      rootKey: driveMatch[1].toLowerCase(),
      separator,
      segments: directory
        .slice(driveMatch[1].length)
        .split("/")
        .filter(Boolean),
    };
  }

  return {
    root: "/",
    rootKey: "/",
    separator: "/",
    segments: directory.split("/").filter(Boolean),
  };
}

function parentDirectory(absPath: string): string {
  const normalizedPath = absPath.replaceAll("\\", "/");
  const separatorIndex = normalizedPath.lastIndexOf("/");
  if (separatorIndex < 0) {
    return ".";
  }
  return normalizedPath.slice(0, separatorIndex) || "/";
}

function findCommonSegments(directories: ParsedDirectory[]): string[] {
  const [firstDirectory, ...remainingDirectories] = directories;
  let commonLength = 0;
  while (
    commonLength < firstDirectory.segments.length &&
    remainingDirectories.every((directory) =>
      segmentsMatch(
        firstDirectory.segments[commonLength],
        directory.segments[commonLength],
        directory.rootKey,
      ),
    )
  ) {
    commonLength += 1;
  }
  return firstDirectory.segments.slice(0, commonLength);
}

function segmentsMatch(
  left: string,
  right: string | undefined,
  rootKey: string,
): boolean {
  return rootKey === "/"
    ? left === right
    : left.toLowerCase() === right?.toLowerCase();
}

function formatDirectory(
  directory: ParsedDirectory,
  segments: string[],
): string {
  if (directory.root === "/") {
    return segments.length === 0 ? "/" : `/${segments.join("/")}`;
  }
  return segments.length === 0
    ? `${directory.root}${directory.separator}`
    : `${directory.root}${directory.separator}${segments.join(directory.separator)}`;
}

function normalizeDirectoryKey(directory: string, rootKey: string): string {
  const normalized = directory.replaceAll("\\", "/");
  return rootKey === "/" ? normalized : normalized.toLowerCase();
}
