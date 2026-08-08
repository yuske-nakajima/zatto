import { useEffect, useEffectEvent, useState } from "react";
import {
  type FilePanelView,
  readFilePanelView,
  storeFilePanelView,
} from "./file-panel-model.js";

const FILE_VIEW_PARAMETER = "fileView";
const PANEL_PARAMETER = "panel";

interface FilePanelLocation {
  view: FilePanelView;
  isVisible: boolean;
}

/**
 * ファイルパネルの表示方式と開閉をURL履歴へ同期する。
 *
 * @param beforePush - 新しい履歴を作る直前に保留中の状態を保存する処理
 * @returns 現在のパネル状態と履歴対応の更新処理
 */
export function useFilePanelNavigation(beforePush: () => void) {
  const [initialLocation] = useState(() => readLocation(true));
  const [view, setViewState] = useState(initialLocation.view);
  const [isVisible, setIsVisibleState] = useState(initialLocation.isVisible);

  useEffect(() => {
    replaceLocation(initialLocation);
    storeFilePanelView(initialLocation.view);
  }, [initialLocation]);

  const restoreFromHistory = useEffectEvent(() => {
    const location = readLocation(false);
    setViewState(location.view);
    setIsVisibleState(location.isVisible);
    storeFilePanelView(location.view);
    replaceLocation(location);
  });

  useEffect(() => {
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  function setView(nextView: FilePanelView): void {
    if (nextView === view) return;
    beforePush();
    pushLocation({ view: nextView, isVisible });
    setViewState(nextView);
    storeFilePanelView(nextView);
  }

  function setIsVisible(nextIsVisible: boolean): void {
    if (nextIsVisible === isVisible) return;
    beforePush();
    pushLocation({ view, isVisible: nextIsVisible });
    setIsVisibleState(nextIsVisible);
  }

  return {
    view,
    isVisible,
    setView,
    setIsVisible,
    toggleVisibility: () => setIsVisible(!isVisible),
  };
}

function readLocation(useStoredPreference: boolean): FilePanelLocation {
  try {
    const parameters = new URL(window.location.href).searchParams;
    const fileView = parameters.get(FILE_VIEW_PARAMETER);
    const panel = parameters.get(PANEL_PARAMETER);
    return {
      view:
        fileView === "folders"
          ? "directories"
          : fileView === null && useStoredPreference
            ? readFilePanelView()
            : "list",
      isVisible: panel !== "closed",
    };
  } catch {
    return { view: "list", isVisible: true };
  }
}

function replaceLocation(location: FilePanelLocation): void {
  writeLocation(location, "replace", true);
}

function pushLocation(location: FilePanelLocation): void {
  writeLocation(location, "push", false);
}

function writeLocation(
  location: FilePanelLocation,
  mode: "push" | "replace",
  preserveExplicitDefaults: boolean,
): void {
  try {
    const url = new URL(window.location.href);
    const fileView = url.searchParams.get(FILE_VIEW_PARAMETER);
    const panel = url.searchParams.get(PANEL_PARAMETER);
    setParameter(
      url,
      FILE_VIEW_PARAMETER,
      location.view === "directories"
        ? "folders"
        : preserveExplicitDefaults && fileView === "list"
          ? "list"
          : null,
    );
    setParameter(
      url,
      PANEL_PARAMETER,
      !location.isVisible
        ? "closed"
        : preserveExplicitDefaults && panel === "open"
          ? "open"
          : null,
    );
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (nextUrl === currentUrl()) return;
    window.history[`${mode}State`](window.history.state, "", nextUrl);
  } catch {
    return;
  }
}

function setParameter(url: URL, name: string, value: string | null): void {
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
}

function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
