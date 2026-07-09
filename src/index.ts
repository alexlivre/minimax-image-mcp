#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MiniMaxClient } from "./client.js";
import { createServer } from "./server.js";
import { getApiKey } from "./env.js";
import { installShutdownHandlers } from "./shutdown.js";

async function main(): Promise<void> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error("ERROR: MINIMAX_API_KEY environment variable is required");
    console.error("Set it in opencode.json under environment MINIMAX_API_KEY");
    process.exit(1);
  }

  const client = new MiniMaxClient(apiKey);
  const server = createServer(client);
  const transport = new StdioServerTransport();

  installShutdownHandlers(server);

  await server.connect(transport);
  console.error("MiniMax Image MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
