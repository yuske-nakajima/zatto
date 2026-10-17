import { useRef, useState } from "react";
import type { CopyFeedback } from "./copy-feedback.js";

/**
 * Copies paths and discards feedback from superseded clipboard requests.
 * @returns Clipboard action, feedback, and a reset action
 * @throws Never; clipboard failures become visible feedback
 */
export function useCopyPath() {
  const requestId = useRef(0);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  function resetCopyFeedback(): void {
    requestId.current += 1;
    setCopyFeedback(null);
  }
  async function copyPath(path: string): Promise<void> {
    resetCopyFeedback();
    const current = requestId.current;
    try {
      await navigator.clipboard.writeText(path);
      if (current === requestId.current)
        setCopyFeedback({ kind: "success", message: "Path copied!" });
    } catch {
      if (current === requestId.current)
        setCopyFeedback({ kind: "error", message: "Could not copy the path." });
    }
  }
  return { copyFeedback, copyPath, resetCopyFeedback };
}
