import { useEffect, useState } from "react";
import type { Entry } from "../server/session.js";
import {
  buildDirectoryTree,
  type DirectoryTreeNode,
} from "./directory-tree-model.js";
import { EntryRow } from "./EntryRow.js";
import { Icon } from "./icons.js";

interface DirectoryTreeProps {
  entries: Entry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCopyPath: (path: string) => void;
  onRemove: (id: string) => void;
}

interface DirectoryBranchProps {
  node: DirectoryTreeNode;
  selectedId: string | null;
  collapsedDirectories: Set<string>;
  isRoot?: boolean;
  onToggle: (directory: string) => void;
  onSelect: (id: string) => void;
  onCopyPath: (path: string) => void;
  onRemove: (id: string) => void;
}

const COLLAPSED_DIRECTORY_PATHS_KEY = "zatto:collapsed-directory-paths";

export function DirectoryTree({
  entries,
  selectedId,
  onSelect,
  onCopyPath,
  onRemove,
}: DirectoryTreeProps) {
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(
    readCollapsedDirectoryPaths,
  );
  useEffect(
    () => storeCollapsedDirectoryPaths(collapsedDirectories),
    [collapsedDirectories],
  );

  function toggleDirectory(directory: string): void {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(directory)) {
        next.delete(directory);
      } else {
        next.add(directory);
      }
      return next;
    });
  }

  return (
    <nav className="entry-list" aria-label="HTML entries by folder">
      <ul className="directory-tree">
        {buildDirectoryTree(entries).map((node) => (
          <DirectoryBranch
            key={node.directory}
            node={node}
            selectedId={selectedId}
            collapsedDirectories={collapsedDirectories}
            isRoot
            onToggle={toggleDirectory}
            onSelect={onSelect}
            onCopyPath={onCopyPath}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </nav>
  );
}

function readCollapsedDirectoryPaths(): Set<string> {
  try {
    const storedValue = window.localStorage.getItem(
      COLLAPSED_DIRECTORY_PATHS_KEY,
    );
    if (storedValue === null) {
      return new Set();
    }
    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) {
      return new Set();
    }
    return new Set(
      parsedValue.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set();
  }
}

function storeCollapsedDirectoryPaths(paths: Set<string>): void {
  try {
    window.localStorage.setItem(
      COLLAPSED_DIRECTORY_PATHS_KEY,
      JSON.stringify([...paths]),
    );
  } catch {
    return;
  }
}

function DirectoryBranch({
  node,
  selectedId,
  collapsedDirectories,
  isRoot = false,
  onToggle,
  onSelect,
  onCopyPath,
  onRemove,
}: DirectoryBranchProps) {
  const isExpanded = !collapsedDirectories.has(node.directory);
  const containsSelection = nodeContainsEntry(node, selectedId);
  const toggleLabel = `${isExpanded ? "Collapse" : "Expand"} directory ${node.directory}`;
  const branchClassName = [
    "directory-branch",
    isRoot && "directory-branch--root",
    containsSelection && !isExpanded && "directory-branch--collapsed-selection",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={branchClassName}>
      <div className="directory-heading">
        <button
          className="directory-toggle"
          type="button"
          aria-label={toggleLabel}
          aria-expanded={isExpanded}
          onClick={() => onToggle(node.directory)}
        >
          <Icon name={isExpanded ? "chevronDown" : "chevronRight"} size={12} />
          <Icon name="folder" size={14} />
          <strong>{node.name}</strong>
        </button>
        <button
          className="directory-path-copy icon-button"
          type="button"
          aria-label={`Copy directory path ${node.directory}`}
          onClick={() => onCopyPath(node.directory)}
        >
          <Icon name="clipboardCopy" size={12} />
        </button>
      </div>
      {isExpanded && (
        <ul className="directory-children">
          {node.entries.map((entry) => (
            <EntryRow
              grouped
              entry={entry}
              isSelected={entry.id === selectedId}
              key={entry.id}
              onSelect={onSelect}
              onCopyPath={onCopyPath}
              onRemove={onRemove}
            />
          ))}
          {node.children.map((child) => (
            <DirectoryBranch
              key={child.directory}
              node={child}
              selectedId={selectedId}
              collapsedDirectories={collapsedDirectories}
              onToggle={onToggle}
              onSelect={onSelect}
              onCopyPath={onCopyPath}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function nodeContainsEntry(
  node: DirectoryTreeNode,
  selectedId: string | null,
): boolean {
  return (
    selectedId !== null &&
    (node.entries.some((entry) => entry.id === selectedId) ||
      node.children.some((child) => nodeContainsEntry(child, selectedId)))
  );
}
