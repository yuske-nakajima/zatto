import { useEffect, useEffectEvent } from "react";
import {
  isMarkdownTaskRequest,
  MARKDOWN_TASK_MESSAGE,
  type MarkdownTaskResult,
} from "../shared/markdown-task-message.js";
import { rpcCall } from "../shared/rpc-client.js";

interface MarkdownTaskBridgeOptions {
  workspaceId: string | null;
  selectedEntryId: string | null;
  setErrorMessage: (message: string | null) => void;
}

/**
 * Saves task checkbox changes posted by the selected Markdown preview frame.
 * @param options - Displayed workspace, selected entry, and error reporter
 * @returns Nothing
 */
export function useMarkdownTaskBridge({
  workspaceId,
  selectedEntryId,
  setErrorMessage,
}: MarkdownTaskBridgeOptions): void {
  const handleMessage = useEffectEvent(async (event: MessageEvent) => {
    if (
      event.origin !== window.location.origin ||
      !isMarkdownTaskRequest(event.data) ||
      !(event.source && "postMessage" in event.source)
    )
      return;
    const source = event.source as Window;
    const request = event.data;
    const reply = (result: Omit<MarkdownTaskResult, "type">) =>
      source.postMessage(
        { type: MARKDOWN_TASK_MESSAGE.result, ...result },
        window.location.origin,
      );
    if (!workspaceId || request.entryId !== selectedEntryId) {
      reply({ ok: false });
      return;
    }
    try {
      const { revision } = await rpcCall("markdown.setTask", {
        workspaceId,
        id: request.entryId,
        index: request.index,
        checked: request.checked,
        revision: request.revision,
      });
      reply({ ok: true, revision });
    } catch {
      setErrorMessage(
        "Could not update the task. The file was reloaded with its latest content.",
      );
      reply({ ok: false });
    }
  });

  useEffect(() => {
    const listener = (event: MessageEvent) => void handleMessage(event);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
}
