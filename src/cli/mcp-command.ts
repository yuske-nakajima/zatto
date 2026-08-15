import { MCP_USAGE, serveZattoMcp } from "../mcp/server.js";
import type { AgentContext } from "../shared/agent-context.js";

interface McpCommandDependencies {
  readContext: () => Promise<AgentContext>;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  serve?: typeof serveZattoMcp;
}

export async function runMcpCommand(
  args: string[],
  dependencies: McpCommandDependencies,
): Promise<number> {
  if (args.length === 1 && args[0] === "usage") {
    dependencies.stdout(JSON.stringify(MCP_USAGE, null, 2));
    return 0;
  }
  if (args.length === 1 && args[0] === "serve") {
    try {
      (dependencies.serve ?? serveZattoMcp)(dependencies.readContext);
      return 0;
    } catch (error) {
      dependencies.stderr(
        error instanceof Error ? error.message : String(error),
      );
      return 1;
    }
  }
  dependencies.stderr("Usage: zatto mcp <usage|serve>");
  return 1;
}
