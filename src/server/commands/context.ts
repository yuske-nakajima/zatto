import type { AgentContextStore } from "../agent-context.js";
import type { PickDirectory, PickFiles } from "../file-picker.js";
import type { RealtimeHub } from "../realtime.js";
import type { Session, SessionStore } from "../session.js";
import { domainError } from "./errors.js";
/** Dependencies owned by the shared command layer. */
export interface CommandOptions {
  sessionStore: SessionStore;
  agentContextStore: AgentContextStore;
  realtimeHub: RealtimeHub;
  serverIdentity?: { instanceId: string; protocolVersion: number };
  pickFiles?: PickFiles;
  pickDirectory?: PickDirectory;
  shutdown?: () => Promise<void> | void;
  onSessionChanged?: (session: Session) => Promise<void> | void;
  logError: (error: unknown, message?: string) => void;
}
/** Validated command dependencies and mutation guards. */
export interface CommandContext extends CommandOptions {
  publish: () => Promise<void>;
  /** Rejects a workspace other than the shared active selection. */
  activeWorkspace: (expected: string) => string;
  /** Rejects a workspace ID that does not exist. */
  existingWorkspace: (id: string) => string;
  identity: (expected?: string, required?: boolean) => void;
}
/** Deferred effects that may run only after the transport sends all responses. */
export type CommandEffects = Array<() => Promise<void> | void>;
/**
 * Creates mutation guards and serialized publication shared by all commands.
 * @param options - Store, observers, capabilities, and logger
 * @returns Command context
 * @throws Never during construction
 */
export function createCommandContext(options: CommandOptions): CommandContext {
  let publishedWorkspaceId =
    options.sessionStore.getWorkspaceState().activeWorkspaceId;
  let pending = Promise.resolve();
  return {
    ...options,
    activeWorkspace(expected) {
      const id = options.sessionStore.getWorkspaceState().activeWorkspaceId;
      if (expected !== id)
        throw domainError(
          "workspace",
          "Workspace changed. Retry from the active workspace.",
        );
      return id;
    },
    existingWorkspace(id) {
      options.sessionStore.getWorkspace(id);
      return id;
    },
    identity(expected, required = false) {
      if (
        (required && !options.serverIdentity) ||
        (options.serverIdentity &&
          expected !== options.serverIdentity.instanceId)
      )
        throw domainError("instance", "サーバー識別子が一致しません");
    },
    publish() {
      pending = pending.then(async () => {
        const session = options.sessionStore.getSession();
        const state = options.sessionStore.getWorkspaceState();
        if (publishedWorkspaceId !== state.activeWorkspaceId) {
          options.agentContextStore.setBrowserContext({
            activeEntryId: null,
            view: "preview",
          });
          publishedWorkspaceId = state.activeWorkspaceId;
        }
        try {
          await options.onSessionChanged?.(session);
        } catch (error) {
          options.logError(error, "セッション更新observerの実行に失敗しました");
        }
        try {
          options.realtimeHub.broadcast({
            type: "session:update",
            entries: session.entries,
            ...state,
          });
        } catch (error) {
          options.logError(
            error,
            "セッション更新のWebSocket配信に失敗しました",
          );
        }
      });
      return pending;
    },
  };
}
