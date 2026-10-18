import { useEffect, useState } from "react";

const STORAGE_KEY = "zatto:review-seen";
const CHANGE_EVENT = "zatto:review-seen-change";

/** When this browser started tracking, and the newest comment time seen per thread. */
interface SeenRecord {
  since: number;
  threads: Record<string, number>;
}

function read(): SeenRecord {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (value && typeof value.since === "number" && value.threads)
      return value as SeenRecord;
  } catch {
    // 読めない記録は作り直す
  }
  // 記録を始める前の返信は既読として扱い、使い始めに点が並ばないようにする
  const record = { since: Date.now(), threads: {} };
  write(record);
  return record;
}

function write(record: SeenRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // 保存できない環境では、このページを開いている間だけ覚える
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Remembers in this browser which LLM replies the user has opened, without adding server state.
 * @returns Whether a reply is unseen, and a way to mark a thread as seen up to a time
 */
export function useSeenReplies(): {
  isUnseen: (threadId: string, replyAt: number) => boolean;
  markSeen: (threadId: string, at: number) => void;
} {
  const [record, setRecord] = useState(read);
  useEffect(() => {
    const update = () => setRecord(read());
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return {
    isUnseen: (threadId, replyAt) =>
      replyAt > record.since && replyAt > (record.threads[threadId] ?? 0),
    markSeen: (threadId, at) => {
      const current = read();
      if ((current.threads[threadId] ?? 0) >= at) return;
      write({ ...current, threads: { ...current.threads, [threadId]: at } });
    },
  };
}
