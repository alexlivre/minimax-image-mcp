import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const { registerToolMock, McpServerMock, saveImageMock, downloadImageFromUrlMock } = vi.hoisted(() => {
  const registerToolMock = vi.fn();
  const McpServerMock = vi.fn(() => ({ registerTool: registerToolMock }));
  const saveImageMock = vi.fn();
  const downloadImageFromUrlMock = vi.fn();
  return { registerToolMock, McpServerMock, saveImageMock, downloadImageFromUrlMock };
});

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: McpServerMock,
}));

vi.mock("./utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./utils.js")>();
  return {
    ...actual,
    saveImage: saveImageMock,
    downloadImageFromUrl: downloadImageFromUrlMock,
  };
});

import { createServer } from "./server.js";
import { MiniMaxClient } from "./client.js";
import { ImageGenerateOutputSchema } from "./schemas.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

type ToolParams = {
  prompt: string;
  model?: "image-01" | "image-01-live";
  aspect_ratio?: string;
  width?: number;
  height?: number;
  n?: number;
  seed?: number;
  response_format?: "url" | "base64";
  prompt_optimizer?: boolean;
  subject_reference?: Array<{ type: "character"; image_file: string }>;
  output_dir?: string;
  inline_images?: boolean;
};
type ToolCallback = (
  params: ToolParams,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) => Promise<unknown>;

type ToolConfig = {
  title: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  annotations: unknown;
};

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type CallToolResult = {
  content: ContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
};

type SuccessResponse = Awaited<ReturnType<MiniMaxClient["generateImage"]>>;

function buildExtra(overrides: {
  progressToken?: string | number;
  sendNotification?: ReturnType<typeof vi.fn>;
  signal?: AbortSignal;
} = {}): RequestHandlerExtra<ServerRequest, ServerNotification> {
  const sendNotification =
    overrides.sendNotification ?? vi.fn().mockResolvedValue(undefined);
  const meta =
    "progressToken" in overrides && overrides.progressToken !== undefined
      ? { progressToken: overrides.progressToken }
      : undefined;
  return {
    signal: overrides.signal ?? new AbortController().signal,
    _meta: meta,
    requestId: 1,
    sendNotification,
  } as unknown as RequestHandlerExtra<ServerRequest, ServerNotification>;
}

function successResponse(imageBase64: string[]): SuccessResponse {
  return {
    id: "resp-1",
    data: { image_base64: imageBase64 },
    metadata: {
      failed_count: "0",
      success_count: String(imageBase64.length),
    },
    base_resp: { status_code: 0, status_msg: "" },
  };
}

describe("createServer", () => {
  let tmpDir: string;
  let client: MiniMaxClient;
  let toolCallback: ToolCallback;
  let toolConfig: ToolConfig;
  let toolName: string;
  const originalMinimaxEnv = process.env.MINIMAX_OUTPUT_DIR;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "minimax-mcp-test-"));
    process.env.MINIMAX_OUTPUT_DIR = tmpDir;

    client = new MiniMaxClient("test-key");

    registerToolMock.mockReset();
    registerToolMock.mockImplementation(
      (name: string, config: ToolConfig, cb: ToolCallback) => {
        toolName = name;
        toolConfig = config;
        toolCallback = cb;
      },
    );

    saveImageMock.mockReset();
    saveImageMock.mockImplementation(
      async (_data: string, _prompt: string, dir: string, idx: number) => ({
        path: join(dir, `fake-${idx}.jpeg`),
        mimeType: "image/jpeg",
      }),
    );

    downloadImageFromUrlMock.mockReset();
    downloadImageFromUrlMock.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    );

    createServer(client);
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    if (originalMinimaxEnv === undefined) {
      delete process.env.MINIMAX_OUTPUT_DIR;
    } else {
      process.env.MINIMAX_OUTPUT_DIR = originalMinimaxEnv;
    }
    vi.restoreAllMocks();
  });

  it("registers a tool named 'minimax_image_generate'", () => {
    expect(registerToolMock).toHaveBeenCalledTimes(1);
    expect(toolName).toBe("minimax_image_generate");
  });

  it("registers a tool with inputSchema and outputSchema objects", () => {
    expect(toolConfig.inputSchema).toBeDefined();
    expect(typeof toolConfig.inputSchema).toBe("object");
    expect(toolConfig.outputSchema).toBeDefined();
    expect(typeof toolConfig.outputSchema).toBe("object");
  });

  it("registers a tool with the expected annotations", () => {
    expect(toolConfig.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it("returns isError when output_dir is outside the allowed directory", async () => {
    const result = (await toolCallback(
      { prompt: "a cat", output_dir: "../../etc" },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.type === "text" ? result.content[0].text : "").toMatch(
      /output_dir outside allowed directory/,
    );
  });

  it("returns success with 2 images saved when the API returns 2", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(
      successResponse(["aGVsbG8=", "d29ybGQ="]),
    );

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.type === "text" ? result.content[0].text : "").toMatch(
      /Generated 2 image\(s\); saved 2\./,
    );

    const parsed = ImageGenerateOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.image_count).toBe(2);
      expect(parsed.data.saved_count).toBe(2);
      expect(parsed.data.file_paths).toHaveLength(2);
      expect(parsed.data.failures).toBeUndefined();
    }
  });

  it("attaches image content blocks by default", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(
      successResponse(["aGVsbG8=", "d29ybGQ="]),
    );

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir },
      buildExtra(),
    )) as CallToolResult;

    expect(result.content).toHaveLength(3);
    expect(result.content[1]).toEqual({
      type: "image",
      data: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
    expect(result.content[2]).toEqual({
      type: "image",
      data: "d29ybGQ=",
      mimeType: "image/jpeg",
    });
  });

  it("omits image content blocks when inline_images is false", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(
      successResponse(["aGVsbG8="]),
    );

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir, inline_images: false },
      buildExtra(),
    )) as CallToolResult;

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });

  it("returns isError when the API returns an empty image array", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(successResponse([]));

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.type === "text" ? result.content[0].text : "").toMatch(
      /API returned success but no images/,
    );
  });

  it("reports partial failures when some saves fail", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(
      successResponse(["a", "b", "c"]),
    );

    saveImageMock.mockImplementation(
      async (_data: string, _prompt: string, dir: string, idx: number) => {
        if (idx === 1) {
          throw new Error("disk full");
        }
        return { path: join(dir, `fake-${idx}.jpeg`), mimeType: "image/jpeg" };
      },
    );

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const parsed = ImageGenerateOutputSchema.safeParse(result.structuredContent);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.image_count).toBe(3);
      expect(parsed.data.saved_count).toBe(2);
      expect(parsed.data.file_paths).toHaveLength(2);
      expect(parsed.data.failures).toEqual([{ index: 1, error: "disk full" }]);
    }
    expect(result.content.filter((block) => block.type === "image")).toHaveLength(2);
  });

  it("returns isError when every save fails", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(successResponse(["a"]));
    saveImageMock.mockRejectedValue(new Error("EACCES"));

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.type === "text" ? result.content[0].text : "").toMatch(
      /^Failed to save all 1 image/,
    );
  });

  it("forwards params to client.generateImage in the expected shape", async () => {
    const spy = vi
      .spyOn(client, "generateImage")
      .mockResolvedValue(successResponse([]));

    await toolCallback(
      {
        prompt: "a cat",
        aspect_ratio: "16:9",
        n: 2,
        seed: 42,
        response_format: "url",
        prompt_optimizer: true,
        subject_reference: [
          { type: "character", image_file: "https://example.com/cat.png" },
        ],
        output_dir: tmpDir,
      },
      buildExtra(),
    );

    expect(spy).toHaveBeenCalledWith(
      {
        prompt: "a cat",
        model: "image-01",
        aspect_ratio: "16:9",
        width: undefined,
        height: undefined,
        n: 2,
        seed: 42,
        response_format: "url",
        prompt_optimizer: true,
        subject_reference: [
          { type: "character", image_file: "https://example.com/cat.png" },
        ],
      },
      expect.anything(),
    );
  });

  it("forwards width/height and model to the client", async () => {
    const spy = vi
      .spyOn(client, "generateImage")
      .mockResolvedValue(successResponse([]));

    await toolCallback(
      {
        prompt: "a cat",
        model: "image-01",
        width: 1024,
        height: 1536,
        output_dir: tmpDir,
      },
      buildExtra(),
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "image-01",
        width: 1024,
        height: 1536,
      }),
      expect.anything(),
    );
  });

  it("rejects width without height before calling the API", async () => {
    const spy = vi.spyOn(client, "generateImage");

    const result = (await toolCallback(
      { prompt: "a cat", width: 1024, output_dir: tmpDir },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects image-01-live without subject_reference", async () => {
    const spy = vi.spyOn(client, "generateImage");

    const result = (await toolCallback(
      { prompt: "a cat", model: "image-01-live", output_dir: tmpDir },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("converts a local reference image to a data URL before calling the API", async () => {
    const referencePath = join(tmpDir, "reference.png");
    writeFileSync(referencePath, PNG_MAGIC);
    const spy = vi
      .spyOn(client, "generateImage")
      .mockResolvedValue(successResponse([]));

    await toolCallback(
      {
        prompt: "a cat",
        subject_reference: [{ type: "character", image_file: referencePath }],
        output_dir: tmpDir,
      },
      buildExtra(),
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject_reference: [
          expect.objectContaining({
            type: "character",
            image_file: expect.stringMatching(/^data:image\/png;base64,/),
          }),
        ],
      }),
      expect.anything(),
    );
  });

  it("returns isError when the local reference image does not exist", async () => {
    const spy = vi.spyOn(client, "generateImage");

    const result = (await toolCallback(
      {
        prompt: "a cat",
        subject_reference: [
          { type: "character", image_file: join(tmpDir, "missing.png") },
        ],
        output_dir: tmpDir,
      },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call sendNotification when no progressToken is provided", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(
      successResponse(["aGVsbG8="]),
    );
    const sendNotification = vi.fn().mockResolvedValue(undefined);

    await toolCallback(
      { prompt: "a cat", output_dir: tmpDir },
      buildExtra({ progressToken: undefined, sendNotification }),
    );

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends progress notifications when a progressToken is provided", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(
      successResponse(["aGVsbG8="]),
    );
    const sendNotification = vi.fn().mockResolvedValue(undefined);

    await toolCallback(
      { prompt: "a cat", output_dir: tmpDir, n: 1 },
      buildExtra({ progressToken: "tok-1", sendNotification }),
    );

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenNthCalledWith(1, {
      method: "notifications/progress",
      params: {
        progressToken: "tok-1",
        progress: 0,
        total: 1,
        message: "Requesting MiniMax API...",
      },
    });
    expect(sendNotification).toHaveBeenNthCalledWith(2, {
      method: "notifications/progress",
      params: {
        progressToken: "tok-1",
        progress: 1,
        total: 1,
        message: "Saving images to disk...",
      },
    });
  });

  it("does not throw when sendNotification rejects", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue(
      successResponse(["aGVsbG8="]),
    );
    const sendNotification = vi.fn().mockRejectedValue(new Error("closed"));

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir },
      buildExtra({ progressToken: "tok-1", sendNotification }),
    )) as CallToolResult;

    expect(result).toBeDefined();
    expect(result.isError).toBeUndefined();
    expect(sendNotification).toHaveBeenCalled();
  });

  it("returns isError when abort signal fires before save completes", async () => {
    const controller = new AbortController();
    controller.abort();

    vi.spyOn(client, "generateImage").mockResolvedValue(
      successResponse(["aGVsbG8="]),
    );

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir },
      buildExtra({ signal: controller.signal }),
    )) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.type === "text" ? result.content[0].text : "").toMatch(
      /cancel/i,
    );
  });

  it("saves images from URLs when API returns image_urls", async () => {
    vi.spyOn(client, "generateImage").mockResolvedValue({
      id: "resp-url",
      data: { image_urls: ["https://example.com/a.jpg"] },
      metadata: { failed_count: "0", success_count: "1" },
      base_resp: { status_code: 0, status_msg: "" },
    });

    const result = (await toolCallback(
      { prompt: "a cat", output_dir: tmpDir, response_format: "url" },
      buildExtra(),
    )) as CallToolResult;

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.type === "text" ? result.content[0].text : "").toMatch(
      /Generated 1 image/,
    );
    expect(downloadImageFromUrlMock).toHaveBeenCalledWith(
      "https://example.com/a.jpg",
      expect.anything(),
    );
  });
});
