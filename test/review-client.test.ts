import { expect, test } from "vitest";
import {
  defaultReviewSession,
  detectReviewClient,
} from "../src/shared/review-client.js";

test("環境変数から LLM のクライアントと会話のセッションを見分ける", () => {
  const claude = {
    CLAUDECODE: "1",
    CLAUDE_CODE_SESSION_ID: "a99ca6b9-95a3-4385-bb42-98b02fa2e833",
  };
  const codex = { CODEX_THREAD_ID: "019a2b3c-4d5e", CODEX_SESSION_ID: "x" };

  expect(detectReviewClient(claude)).toBe("claude");
  expect(defaultReviewSession(claude)).toBe("claude:a99ca6b9");
  expect(detectReviewClient(codex)).toBe("codex");
  expect(defaultReviewSession(codex)).toBe("codex:019a2b3c");
  expect(detectReviewClient({ CODEX_SESSION_ID: "s" })).toBe("codex");
  expect(detectReviewClient({})).toBeUndefined();
  expect(defaultReviewSession({ CLAUDECODE: "1" })).toBeUndefined();
});
