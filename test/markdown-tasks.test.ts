import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentContextStore } from "../src/server/agent-context.js";
import { createCommands } from "../src/server/commands/index.js";
import {
  findMarkdownTasks,
  markdownRevision,
  setMarkdownTask,
} from "../src/server/markdown-tasks.js";
import { renderMarkdownDocument } from "../src/server/markdown-view.js";
import { RealtimeHub } from "../src/server/realtime.js";
import { SessionStore } from "../src/server/session.js";

const SOURCE = [
  "# Tasks",
  "",
  "- [ ] first",
  "* [x] second",
  "1. [X] third",
  "> - [ ] quoted",
  "",
  "```md",
  "- [ ] in code",
  "```",
  "",
  "- [] not a task",
  "",
].join("\r\n");

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zatto-md-tasks-"));
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

function checkboxes(html: string) {
  return [
    ...new JSDOM(html).window.document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    ),
  ];
}

describe("Markdown task markers", () => {
  test("コードブロック外のタスクを文書順に見つける", () => {
    expect(findMarkdownTasks(SOURCE).map(({ checked }) => checked)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  test("指定したタスクの状態文字だけを書き換え、改行や他の行を保つ", () => {
    const checked = setMarkdownTask(SOURCE, 0, true);
    expect(checked).toBe(SOURCE.replace("- [ ] first", "- [x] first"));
    expect(setMarkdownTask(SOURCE, 2, false)).toBe(
      SOURCE.replace("1. [X] third", "1. [ ] third"),
    );
    expect(setMarkdownTask(SOURCE, 1, true)).toBe(SOURCE);
    expect(setMarkdownTask(SOURCE, 4, true)).toBeNull();
  });

  test("描画したチェックボックスとタスクが一致する場合だけ切り替えを有効にする", () => {
    const html = renderMarkdownDocument(SOURCE, "Tasks");
    expect(
      checkboxes(html).map((input) => [input.dataset.task, input.checked]),
    ).toEqual([
      ["0", false],
      ["1", true],
      ["2", true],
      ["3", false],
    ]);
    expect(html).toContain(`data-revision="${markdownRevision(SOURCE)}"`);
    expect(html).toContain("zatto:markdown-task");

    const nested =
      "- item\n\n      ```\n      - [ ] in nested code\n      ```\n- [ ] real\n";
    const fallback = renderMarkdownDocument(nested, "Nested");
    expect(checkboxes(fallback).every((input) => !input.dataset.task)).toBe(
      true,
    );
    expect(checkboxes(fallback).every((input) => input.disabled)).toBe(true);
    expect(fallback).not.toContain("zatto:markdown-task");
  });
});

describe("markdown.setTask", () => {
  async function fixture() {
    const store = new SessionStore(path.join(dir, "session.json"));
    await store.load();
    const commands = createCommands({
      sessionStore: store,
      agentContextStore: new AgentContextStore(),
      realtimeHub: new RealtimeHub(),
      logError: vi.fn(),
    });
    return { store, commands };
  }

  test("表示時の内容と一致する場合だけ書き込み、権限とシンボリックリンクを保つ", async () => {
    const { store, commands } = await fixture();
    const target = path.join(dir, "tasks.md");
    const link = path.join(dir, "link.md");
    await writeFile(target, SOURCE);
    await chmod(target, 0o640);
    await symlink(target, link);
    const research = await store.createWorkspace("Research");
    const [entry] = await store.addEntries([link], research.id);

    const result = await commands.execute(
      "markdown.setTask",
      {
        workspaceId: research.id,
        id: entry.id,
        index: 3,
        checked: true,
        revision: markdownRevision(SOURCE),
      },
      [],
    );

    const updated = SOURCE.replace("> - [ ] quoted", "> - [x] quoted");
    expect(result).toEqual({ revision: markdownRevision(updated) });
    await expect(readFile(target, "utf8")).resolves.toBe(updated);
    expect((await stat(target)).mode & 0o777).toBe(0o640);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);

    await expect(
      commands.execute(
        "markdown.setTask",
        {
          workspaceId: research.id,
          id: entry.id,
          index: 0,
          checked: true,
          revision: markdownRevision(SOURCE),
        },
        [],
      ),
    ).rejects.toMatchObject({ code: 1007, data: { kind: "conflict" } });
    await expect(readFile(target, "utf8")).resolves.toBe(updated);
  });

  test("存在しないエントリとMarkdown以外を拒否する", async () => {
    const { store, commands } = await fixture();
    const page = path.join(dir, "page.html");
    await writeFile(page, "<title>Page</title>");
    const [entry] = await store.addEntries([page]);
    const params = {
      workspaceId: "default",
      index: 0,
      checked: true,
      revision: "r",
    };

    await expect(
      commands.execute("markdown.setTask", { ...params, id: "missing" }, []),
    ).rejects.toMatchObject({ code: 1001 });
    await expect(
      commands.execute("markdown.setTask", { ...params, id: entry.id }, []),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      commands.execute(
        "markdown.setTask",
        { ...params, id: entry.id, index: -1 },
        [],
      ),
    ).rejects.toMatchObject({ code: -32602 });
  });
});
