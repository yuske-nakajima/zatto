import { createContext, useContext } from "react";
import { NAVIGATION_PARAMETERS } from "./main-view-url.js";

/** 外の端末から開いた画面か。閲覧に要らない操作とレビューを隠す。 */
export const RemoteAccessContext = createContext(false);

/** 外の端末から開いた画面か。 */
export function useRemoteAccess(): boolean {
  return useContext(RemoteAccessContext);
}

/** 外の端末の画面で見ているワークスペースを URL から読む。 */
export function readRemoteWorkspaceId(): string | null {
  try {
    return new URL(window.location.href).searchParams.get(
      NAVIGATION_PARAMETERS.workspace,
    );
  } catch {
    return null;
  }
}

/** 外の端末の画面で見ているワークスペースを URL に書く。 */
export function writeRemoteWorkspaceId(id: string): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(NAVIGATION_PARAMETERS.workspace, id);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // 履歴を書き換えられない環境では、URL に残さず表示だけを切り替える
  }
}
