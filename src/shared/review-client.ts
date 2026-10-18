import type { ReviewClient } from "./review.js";

type Env = Record<string, string | undefined>;

/**
 * Tells which LLM client ran a command from the environment it passes to child processes.
 * @param env - Environment of the running command
 * @returns The client, or undefined for other tools
 */
export function detectReviewClient(env: Env): ReviewClient | undefined {
  if (env.CLAUDECODE) return "claude";
  if (env.CODEX_THREAD_ID || env.CODEX_SESSION_ID) return "codex";
  return undefined;
}

/**
 * Derives a review session ID from the conversation ID the LLM client exposes,
 * so the waiting command and its replies agree without the LLM choosing an ID.
 * @param env - Environment of the running command
 * @returns `claude:<id>` or `codex:<id>` shortened to 8 characters, or undefined when the client exposes none
 */
export function defaultReviewSession(env: Env): string | undefined {
  const claude = env.CLAUDE_CODE_SESSION_ID;
  if (env.CLAUDECODE && claude) return `claude:${claude.slice(0, 8)}`;
  const codex = env.CODEX_THREAD_ID ?? env.CODEX_SESSION_ID;
  if (codex) return `codex:${codex.slice(0, 8)}`;
  return undefined;
}
