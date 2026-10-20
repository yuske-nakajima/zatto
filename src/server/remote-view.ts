import path from "node:path";
import type { ServerMessage } from "../shared/protocol.js";
import type { SearchResponse } from "../shared/search.js";
import type { Entry } from "./session.js";

/** 外の端末へ渡すエントリ。absPath はファイル名だけにし、フォルダの構造を渡さない。 */
export function remoteEntry(entry: Entry): Entry {
  return { ...entry, absPath: path.basename(entry.absPath) };
}

/** 外の端末へ渡す検索結果。 */
export function remoteSearch(response: SearchResponse): SearchResponse {
  return {
    ...response,
    files: response.files.map((file) => ({
      ...file,
      absPath: file.fileName,
    })),
  };
}

/**
 * 外の端末へ配信する通知に変える。
 * レビューと表示の依頼は Mac で使うものなので、外の端末には送らない。
 * @param message - 配信する通知
 * @returns 外の端末へ送る通知。送らないときは null
 */
export function remoteMessage(message: ServerMessage): ServerMessage | null {
  if (message.type === "session:update")
    return { ...message, entries: message.entries.map(remoteEntry) };
  if (message.type === "file:changed") return message;
  return null;
}
