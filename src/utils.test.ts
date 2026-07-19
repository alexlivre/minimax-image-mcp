import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { platform } from "node:process";
import {
  DEFAULT_OUTPUT_DIR,
  resolveOutputDir,
  sanitizeFilename,
  isValidImage,
  detectImageExtension,
  saveImage,
  downloadImageFromUrl,
  readPackageMetadata,
} from "./utils.js";

const IS_WINDOWS = platform === "win32";
const OUTSIDE_ABS_PATH = IS_WINDOWS ? "C:\\Windows" : "/etc";
const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const VALID_JPEG_B64 = Buffer.from(JPEG_MAGIC).toString("base64");
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const VALID_PNG_B64 = Buffer.from(PNG_MAGIC).toString("base64");
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const VALID_WEBP_B64 = Buffer.from(WEBP_MAGIC).toString("base64");

describe("resolveOutputDir", () => {
  const originalEnv = process.env.MINIMAX_OUTPUT_DIR;
  let cwd: string;

  beforeEach(() => {
    delete process.env.MINIMAX_OUTPUT_DIR;
    cwd = process.cwd();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MINIMAX_OUTPUT_DIR;
    } else {
      process.env.MINIMAX_OUTPUT_DIR = originalEnv;
    }
  });

  it("returns <cwd>/output when nothing is set", () => {
    expect(resolveOutputDir()).toBe(resolve(DEFAULT_OUTPUT_DIR));
    expect(resolveOutputDir()).toBe(join(cwd, "output"));
  });

  it("returns absolute path for a relative dir argument", () => {
    expect(resolveOutputDir("subdir")).toBe(resolve("subdir"));
    expect(resolveOutputDir("subdir")).toBe(join(cwd, "subdir"));
  });

  it("returns MINIMAX_OUTPUT_DIR path when env is set", () => {
    process.env.MINIMAX_OUTPUT_DIR = "./custom-output";
    expect(resolveOutputDir()).toBe(resolve("./custom-output"));
    expect(resolveOutputDir()).toBe(join(cwd, "custom-output"));
  });

  it("throws for path traversal outside cwd", () => {
    expect(() => resolveOutputDir("../..")).toThrow(/outside allowed directory/);
  });

  it("throws for absolute path outside cwd", () => {
    expect(() => resolveOutputDir(OUTSIDE_ABS_PATH)).toThrow(
      /outside allowed directory/,
    );
  });

  it("accepts absolute MINIMAX_OUTPUT_DIR as override", () => {
    process.env.MINIMAX_OUTPUT_DIR = OUTSIDE_ABS_PATH;
    expect(resolveOutputDir()).toBe(resolve(OUTSIDE_ABS_PATH));
  });

  it("accepts path that starts with cwd", () => {
    expect(resolveOutputDir(`./nested${sep}subdir`)).toBe(
      join(cwd, "nested", "subdir"),
    );
  });

  it("explicit dir argument still throws if outside cwd", () => {
    process.env.MINIMAX_OUTPUT_DIR = "./allowed";
    expect(() => resolveOutputDir("../escape")).toThrow(
      /outside allowed directory/,
    );
  });
});

describe("sanitizeFilename", () => {
  it("converts to lowercase", () => {
    expect(sanitizeFilename("HELLO")).toBe("hello");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFilename("hello world")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(sanitizeFilename("hello@world!#$")).toBe("helloworld");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(sanitizeFilename("hello   world")).toBe("hello-world");
  });

  it("returns 'image' for prompt with only accented characters", () => {
    expect(sanitizeFilename("áéíóú")).toBe("image");
  });

  it("returns 'image' for prompt with only emojis", () => {
    expect(sanitizeFilename("🎉🚀✨")).toBe("image");
  });

  it("limits output to maxLength", () => {
    const result = sanitizeFilename("hello world this is a long string", 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("preserves allowed hyphens from spaces", () => {
    expect(sanitizeFilename("a b c")).toBe("a-b-c");
  });
});

describe("isValidImage", () => {
  it("returns true for JPEG magic bytes", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(isValidImage(buf)).toBe(true);
  });

  it("returns true for PNG magic bytes", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(isValidImage(buf)).toBe(true);
  });

  it("returns true for WebP (RIFF) magic bytes", () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
    expect(isValidImage(buf)).toBe(true);
  });

  it("returns false for text content", () => {
    const buf = Buffer.from("hello world");
    expect(isValidImage(buf)).toBe(false);
  });

  it("returns false for empty buffer", () => {
    expect(isValidImage(Buffer.alloc(0))).toBe(false);
  });

  it("returns false for buffer with just zeros", () => {
    expect(isValidImage(Buffer.alloc(10))).toBe(false);
  });
});

describe("detectImageExtension", () => {
  it("returns .jpeg for JPEG magic bytes", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageExtension(buf)).toBe(".jpeg");
  });

  it("returns .png for PNG magic bytes", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(detectImageExtension(buf)).toBe(".png");
  });

  it("returns .webp for WebP (RIFF) magic bytes", () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
    expect(detectImageExtension(buf)).toBe(".webp");
  });

  it("defaults to .jpeg for unknown format", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(detectImageExtension(buf)).toBe(".jpeg");
  });
});

describe("saveImage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "minimax-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns the full filepath inside outputDir", async () => {
    const filepath = await saveImage(VALID_JPEG_B64, "a cat", tempDir, 0);
    expect(filepath.startsWith(tempDir + sep)).toBe(true);
    expect(existsSync(filepath)).toBe(true);
  });

  it("writes base64-decoded content correctly", async () => {
    const payload = "hello world from base64";
    const buf = Buffer.concat([Buffer.from(JPEG_MAGIC), Buffer.from(payload)]);
    const b64 = buf.toString("base64");
    const filepath = await saveImage(b64, "a cat", tempDir, 0);
    const content = readFileSync(filepath);
    expect(content.subarray(JPEG_MAGIC.length).toString("utf8")).toBe(payload);
  });

  it("filename contains the slug of the prompt", async () => {
    const filepath = await saveImage(VALID_JPEG_B64, "A Sunny Cat", tempDir, 0);
    expect(filepath).toMatch(/a-sunny-cat/);
  });

  it("filename ends with -<index+1>-<8-hex>.jpeg", async () => {
    const filepath = await saveImage(VALID_JPEG_B64, "cat", tempDir, 2);
    expect(filepath).toMatch(/-3-[\da-f]{8}\.jpeg$/);
  });

  it("uses 1-indexed number in filename (index 0 becomes 1)", async () => {
    const filepath = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    expect(filepath).toMatch(/-1-[\da-f]{8}\.jpeg$/);
  });

  it("filename includes a numeric timestamp segment", async () => {
    const filepath = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    expect(filepath).toMatch(/cat-\d+-\d+-[\da-f]{8}\.jpeg$/);
  });

  it("two saves with same prompt do not collide (UUID suffix)", async () => {
    const a = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    const b = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    expect(a).not.toBe(b);
    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(true);
  });

  it("writes a jpeg file for JPEG data", async () => {
    const filepath = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    expect(filepath.endsWith(".jpeg")).toBe(true);
  });

  it("writes a png file for PNG data", async () => {
    const filepath = await saveImage(VALID_PNG_B64, "cat", tempDir, 0);
    expect(filepath.endsWith(".png")).toBe(true);
  });

  it("writes a webp file for WebP data", async () => {
    const filepath = await saveImage(VALID_WEBP_B64, "cat", tempDir, 0);
    expect(filepath.endsWith(".webp")).toBe(true);
  });
});

describe("downloadImageFromUrl", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads and returns a Buffer for a valid image URL", async () => {
    const imgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    fetchMock.mockResolvedValueOnce(
      new Response(imgBuffer, { status: 200, headers: { "Content-Type": "image/jpeg" } }),
    );

    const result = await downloadImageFromUrl("https://example.com/valid.jpg");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result[0]).toBe(0xff);
  });

  it("throws if download URL returns non-200", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );

    await expect(downloadImageFromUrl("https://example.com/missing.jpg"))
      .rejects.toThrow(/Failed to download image from URL/);
  });

  it("throws if downloaded data is not a valid image", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not an image", { status: 200 }),
    );

    await expect(downloadImageFromUrl("https://example.com/text.txt"))
      .rejects.toThrow(/Downloaded data from URL is not a valid image/);
  });

  it("throws when download times out", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);

    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      });
    });

    const promise = downloadImageFromUrl("https://example.com/slow.jpg");

    controller.abort();

    await expect(promise).rejects.toThrow();
  });
});

describe("readPackageMetadata", () => {
  it("returns name from package.json", () => {
    const meta = readPackageMetadata();
    expect(meta.name).toBe("minimax-image-mcp");
  });

  it("returns version matching semver from package.json", () => {
    const meta = readPackageMetadata();
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
