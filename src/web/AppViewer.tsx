import type { Entry } from "../server/session.js";
import type { CopyFeedback } from "./copy-feedback.js";
import { DocsView } from "./DocsView.js";
import { SearchWorkspace } from "./SearchWorkspace.js";
import type { SearchResultLocator } from "./search-navigation-url.js";
import type { DocsNavigation } from "./useDocsNavigation.js";
import type { SearchNavigation } from "./useSearchNavigation.js";
import { Viewer } from "./Viewer.js";

interface AppViewerProps {
  search: SearchNavigation;
  docs: DocsNavigation;
  selectedEntry: Entry | null;
  reloadVersion: number;
  isFilePanelVisible: boolean;
  errorMessage: string | null;
  copyFeedback: CopyFeedback | null;
  canPickFiles: boolean;
  isFilePickerOpen: boolean;
  onSelect: (entryId: string, locator: SearchResultLocator | null) => void;
  onToggleFilePanel: () => void;
  onCopyPath: (path: string) => void;
  onRemove: (id: string) => void;
  onPickFiles: () => void;
}

export function AppViewer({
  search,
  docs,
  selectedEntry,
  reloadVersion,
  isFilePanelVisible,
  errorMessage,
  copyFeedback,
  canPickFiles,
  isFilePickerOpen,
  onSelect,
  onToggleFilePanel,
  onCopyPath,
  onRemove,
  onPickFiles,
}: AppViewerProps) {
  return (
    <>
      {docs.isVisible && <DocsView navigation={docs} />}
      <SearchWorkspace
        navigation={search}
        isFilePanelVisible={isFilePanelVisible}
        onSelect={onSelect}
        onToggleFilePanel={onToggleFilePanel}
      />
      <Viewer
        isHidden={search.isVisible || docs.isVisible}
        filePanelButtonRef={search.viewerPanelButtonRef}
        previewTarget={search.previewTarget}
        searchQuery={search.query}
        selectedEntry={selectedEntry}
        reloadVersion={reloadVersion}
        isFilePanelVisible={isFilePanelVisible}
        errorMessage={errorMessage}
        copyFeedback={copyFeedback}
        canPickFiles={canPickFiles}
        isFilePickerOpen={isFilePickerOpen}
        onToggleFilePanel={onToggleFilePanel}
        onCopyPath={onCopyPath}
        onRemove={onRemove}
        onPickFiles={onPickFiles}
      />
    </>
  );
}
