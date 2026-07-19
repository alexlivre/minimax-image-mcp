import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createMockServer(closeImpl?: () => Promise<void>) {
  return {
    close: closeImpl ? vi.fn(closeImpl) : vi.fn().mockResolvedValue(undefined),
  } as unknown as McpServer;
}

describe("installShutdownHandlers", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  async function importAndInstall(server: McpServer) {
    const { installShutdownHandlers } = await import("./shutdown.js");
    installShutdownHandlers(server);
    return installShutdownHandlers;
  }

  it("calls server.close() on SIGINT", async () => {
    const server = createMockServer();
    await importAndInstall(server);

    process.emit("SIGINT");
    await vi.waitFor(() => expect(server.close).toHaveBeenCalledTimes(1));
  });

  it("calls server.close() on SIGTERM", async () => {
    const server = createMockServer();
    await importAndInstall(server);

    process.emit("SIGTERM");
    await vi.waitFor(() => expect(server.close).toHaveBeenCalledTimes(1));
  });

  it("calls process.exit(0) when server.close() succeeds", async () => {
    const server = createMockServer();
    await importAndInstall(server);

    process.emit("SIGINT");
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
  });

  it("calls process.exit(1) when server.close() rejects", async () => {
    const server = createMockServer(async () => {
      throw new Error("close failed");
    });
    await importAndInstall(server);

    process.emit("SIGINT");
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
  });

  it("does not call server.close() twice on double signal", async () => {
    const server = createMockServer();
    await importAndInstall(server);

    process.emit("SIGINT");
    process.emit("SIGINT");
    await vi.waitFor(() => expect(server.close).toHaveBeenCalledTimes(1));
  });
});
