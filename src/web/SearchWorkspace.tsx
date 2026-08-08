import { SearchView } from "./SearchView.js";
import type { SearchResultLocator } from "./search-navigation-url.js";
import type { SearchNavigation } from "./useSearchNavigation.js";

interface SearchWorkspaceProps {
  navigation: SearchNavigation;
  isFilePanelVisible: boolean;
  onSelect: (entryId: string, locator: SearchResultLocator | null) => void;
  onToggleFilePanel: () => void;
}

export function SearchWorkspace({
  navigation,
  isFilePanelVisible,
  onSelect,
  onToggleFilePanel,
}: SearchWorkspaceProps) {
  return (
    <SearchView
      isActive={navigation.isVisible}
      query={navigation.query}
      result={navigation.result}
      phase={navigation.phase}
      collapsedEntryIds={navigation.collapsedEntryIds}
      scrollTop={navigation.scrollTop}
      isFilePanelVisible={isFilePanelVisible}
      onQueryChange={navigation.setQuery}
      onClose={navigation.close}
      onRetry={navigation.retry}
      onToggleEntry={navigation.toggleEntry}
      onSelect={onSelect}
      onScroll={navigation.setScrollTop}
      onToggleFilePanel={onToggleFilePanel}
    />
  );
}
