import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function installShutdownHandlers(server: McpServer): void {
  let isShuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.error(`Received ${signal}, shutting down...`);
    try {
      await server.close();
      process.exit(0);
    } catch (err) {
      console.error("Error during server.close():", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
