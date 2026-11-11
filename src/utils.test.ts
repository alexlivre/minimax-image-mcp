import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve, sep } from "node:path";
import { platform } from "node:process";
import {
  DEFAULT_OUTPUT_DIR,
  resolveOutputDir,
  isPathInside,
  sanitizeFilename,
  isValidImage,
  detectImageExtension,
  saveImage,
  downloadImageFromUrl,
  resolveReferenceImage,
  readPackageMetadata,
} from "./utils.js";
import {
  DOWNLOAD_TIMEOUT_MS,
  MAX_DOWNLOAD_BYTES,
  MAX_REFERENCE_BYTES,
} from "./constants.js";
import {
  RequestCancelledError,
  RequestTimeoutError,
} from "./errors.js";

const IS_WINDOWS = platform === "win32";
const OUTSIDE_ABS_PATH = IS_WINDOWS ? "C:\\Windows" : "/etc";
const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const VALID_JPEG_B64 = Buffer.from(JPEG_MAGIC).toString("base64");
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const VALID_PNG_B64 = Buffer.from(PNG_MAGIC).toString("base64");
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const VALID_WEBP_B64 = Buffer.from(WEBP_MAGIC).toString("base64");

describe("isPathInside", () => {
  it("returns true for the same path", () => {
    const dir = resolve(".");
    expect(isPathInside(dir, dir)).toBe(true);
  });

  it("returns true for a nested child", () => {
    expect(isPathInside(join(resolve("."), "a", "b"), resolve("."))).toBe(true);
  });

  it("returns false for a sibling path that only shares a prefix", () => {
    const parent = join(tmpdir(), "allowed-root");
    const sibling = join(tmpdir(), "allowed-root-extra");
    expect(isPathInside(sibling, parent)).toBe(false);
  });
});

describe("resolveOutputDir", () => {
  const originalEnv = process.env.MINIMAX_OUTPUT_DIR;
  const originalRoots = process.env.MINIMAX_ALLOWED_OUTPUT_ROOTS;
  let cwd: string;

  beforeEach(() => {
    delete process.env.MINIMAX_OUTPUT_DIR;
    delete process.env.MINIMAX_ALLOWED_OUTPUT_ROOTS;
    cwd = process.cwd();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MINIMAX_OUTPUT_DIR;
    } else {
      process.env.MINIMAX_OUTPUT_DIR = originalEnv;
    }
    if (originalRoots === undefined) {
      delete process.env.MINIMAX_ALLOWED_OUTPUT_ROOTS;
    } else {
      process.env.MINIMAX_ALLOWED_OUTPUT_ROOTS = originalRoots;
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

  it("accepts absolute path outside cwd", () => {
    expect(resolveOutputDir(OUTSIDE_ABS_PATH)).toBe(resolve(OUTSIDE_ABS_PATH));
  });

  it("accepts absolute MINIMAX_OUTPUT_DIR as default", () => {
    process.env.MINIMAX_OUTPUT_DIR = OUTSIDE_ABS_PATH;
    expect(resolveOutputDir()).toBe(resolve(OUTSIDE_ABS_PATH));
  });

  it("accepts path that starts with cwd", () => {
    expect(resolveOutputDir(`./nested${sep}subdir`)).toBe(
      join(cwd, "nested", "subdir"),
    );
  });

  it("relative escape still throws when MINIMAX_OUTPUT_DIR is set", () => {
    process.env.MINIMAX_OUTPUT_DIR = "./allowed";
    expect(() => resolveOutputDir("../escape")).toThrow(
      /outside allowed directory/,
    );
  });

  it("accepts absolute path under MINIMAX_ALLOWED_OUTPUT_ROOTS", () => {
    const root = mkdtempSync(join(tmpdir(), "minimax-allowed-"));
    try {
      process.env.MINIMAX_ALLOWED_OUTPUT_ROOTS = root;
      const nested = join(root, "images");
      expect(resolveOutputDir(nested)).toBe(resolve(nested));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects absolute path outside MINIMAX_ALLOWED_OUTPUT_ROOTS", () => {
    const root = mkdtempSync(join(tmpdir(), "minimax-allowed-"));
    try {
      process.env.MINIMAX_ALLOWED_OUTPUT_ROOTS = root;
      expect(() => resolveOutputDir(OUTSIDE_ABS_PATH)).toThrow(
        /outside allowed directory/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports multiple roots separated by path.delimiter", () => {
    const rootA = mkdtempSync(join(tmpdir(), "minimax-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "minimax-b-"));
    try {
      process.env.MINIMAX_ALLOWED_OUTPUT_ROOTS = `${rootA}${delimiter}${rootB}`;
      expect(resolveOutputDir(join(rootB, "out"))).toBe(
        resolve(join(rootB, "out")),
      );
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
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

  it("strips diacritics instead of dropping the letters", () => {
    expect(sanitizeFilename("áéíóú")).toBe("aeiou");
    expect(sanitizeFilename("coração")).toBe("coracao");
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

  it("returns the saved path inside outputDir", async () => {
    const saved = await saveImage(VALID_JPEG_B64, "a cat", tempDir, 0);
    expect(saved.path.startsWith(tempDir + sep)).toBe(true);
    expect(existsSync(saved.path)).toBe(true);
    expect(saved.mimeType).toBe("image/jpeg");
  });

  it("writes base64-decoded content correctly", async () => {
    const payload = "hello world from base64";
    const buf = Buffer.concat([Buffer.from(JPEG_MAGIC), Buffer.from(payload)]);
    const b64 = buf.toString("base64");
    const saved = await saveImage(b64, "a cat", tempDir, 0);
    const content = readFileSync(saved.path);
    expect(content.subarray(JPEG_MAGIC.length).toString("utf8")).toBe(payload);
  });

  it("filename contains the slug of the prompt", async () => {
    const saved = await saveImage(VALID_JPEG_B64, "A Sunny Cat", tempDir, 0);
    expect(saved.path).toMatch(/a-sunny-cat/);
  });

  it("filename ends with -<index+1>-<8-hex>.jpeg", async () => {
    const saved = await saveImage(VALID_JPEG_B64, "cat", tempDir, 2);
    expect(saved.path).toMatch(/-3-[\da-f]{8}\.jpeg$/);
  });

  it("uses 1-indexed number in filename (index 0 becomes 1)", async () => {
    const saved = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    expect(saved.path).toMatch(/-1-[\da-f]{8}\.jpeg$/);
  });

  it("filename includes a numeric timestamp segment", async () => {
    const saved = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    expect(saved.path).toMatch(/cat-\d+-\d+-[\da-f]{8}\.jpeg$/);
  });

  it("two saves with same prompt do not collide (UUID suffix)", async () => {
    const a = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    const b = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    expect(a.path).not.toBe(b.path);
    expect(existsSync(a.path)).toBe(true);
    expect(existsSync(b.path)).toBe(true);
  });

  it("writes a jpeg file for JPEG data", async () => {
    const saved = await saveImage(VALID_JPEG_B64, "cat", tempDir, 0);
    expect(saved.path.endsWith(".jpeg")).toBe(true);
    expect(saved.mimeType).toBe("image/jpeg");
  });

  it("writes a png file for PNG data", async () => {
    const saved = await saveImage(VALID_PNG_B64, "cat", tempDir, 0);
    expect(saved.path.endsWith(".png")).toBe(true);
    expect(saved.mimeType).toBe("image/png");
  });

  it("writes a webp file for WebP data", async () => {
    const saved = await saveImage(VALID_WEBP_B64, "cat", tempDir, 0);
    expect(saved.path.endsWith(".webp")).toBe(true);
    expect(saved.mimeType).toBe("image/webp");
  });
});

describe("resolveReferenceImage", () => {
  let tempDir: string;
  const originalRoots = process.env.MINIMAX_ALLOWED_REFERENCE_ROOTS;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "minimax-ref-"));
    delete process.env.MINIMAX_ALLOWED_REFERENCE_ROOTS;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalRoots === undefined) {
      delete process.env.MINIMAX_ALLOWED_REFERENCE_ROOTS;
    } else {
      process.env.MINIMAX_ALLOWED_REFERENCE_ROOTS = originalRoots;
    }
  });

  function writeReference(name: string, buffer: Buffer): string {
    const path = join(tempDir, name);
    writeFileSync(path, buffer);
    return path;
  }

  it("returns public http(s) URLs unchanged", async () => {
    const url = "https://example.com/reference.png";
    await expect(resolveReferenceImage(url)).resolves.toBe(url);
  });

  it("returns data URLs unchanged", async () => {
    const dataUrl = "data:image/png;base64,aGVsbG8=";
    await expect(resolveReferenceImage(dataUrl)).resolves.toBe(dataUrl);
  });

  it("converts a local JPEG to a data URL", async () => {
    const path = writeReference("reference.jpg", Buffer.from(JPEG_MAGIC));
    const result = await resolveReferenceImage(path);
    expect(result.startsWith("data:image/jpeg;base64,")).toBe(true);
    const decoded = Buffer.from(result.split(",")[1] ?? "", "base64");
    expect(decoded.equals(Buffer.from(JPEG_MAGIC))).toBe(true);
  });

  it("converts a local PNG to a data URL", async () => {
    const path = writeReference("reference.png", Buffer.from(PNG_MAGIC));
    const result = await resolveReferenceImage(path);
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("rejects a missing file", async () => {
    await expect(resolveReferenceImage(join(tempDir, "missing.png")))
      .rejects.toThrow(/not found/);
  });

  it("rejects a non-image file", async () => {
    const path = writeReference("reference.png", Buffer.from("not an image"));
    await expect(resolveReferenceImage(path)).rejects.toThrow(/not a valid image/);
  });

  it("rejects WebP because the API only supports JPEG/PNG", async () => {
    const path = writeReference("reference.webp", Buffer.from(WEBP_MAGIC));
    await expect(resolveReferenceImage(path)).rejects.toThrow(/must be JPEG or PNG/);
  });

  it("rejects files larger than the 10 MB limit", async () => {
    const path = writeReference(
      "large.png",
      Buffer.alloc(MAX_REFERENCE_BYTES + 1),
    );
    await expect(resolveReferenceImage(path)).rejects.toThrow(/exceeds/);
  });

  it("rejects relative paths outside the cwd", async () => {
    await expect(resolveReferenceImage("../escape.png"))
      .rejects.toThrow(/outside allowed directory/);
  });

  it("honors MINIMAX_ALLOWED_REFERENCE_ROOTS", async () => {
    process.env.MINIMAX_ALLOWED_REFERENCE_ROOTS = tempDir;
    const inside = writeReference("reference.png", Buffer.from(PNG_MAGIC));
    await expect(resolveReferenceImage(inside)).resolves.toMatch(/^data:image\/png/);
    await expect(resolveReferenceImage(join(tmpdir(), "outside-reference.png")))
      .rejects.toThrow(/outside allowed directory/);
  });

  it("rejects when the caller signal is already aborted", async () => {
    const path = writeReference("reference.png", Buffer.from(PNG_MAGIC));
    const controller = new AbortController();
    controller.abort();
    await expect(resolveReferenceImage(path, controller.signal))
      .rejects.toBeInstanceOf(RequestCancelledError);
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
    vi.useRealTimers();
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

  it("throws when the declared content length exceeds the limit", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("x", {
        status: 200,
        headers: { "Content-Length": String(MAX_DOWNLOAD_BYTES + 1) },
      }),
    );

    await expect(downloadImageFromUrl("https://example.com/huge.jpg"))
      .rejects.toThrow(/too large/);
  });

  it("throws RequestTimeoutError when the download times out", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const promise = downloadImageFromUrl("https://example.com/slow.jpg");
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(DOWNLOAD_TIMEOUT_MS);
    await assertion;
  });

  it("throws RequestCancelledError when the caller aborts", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const controller = new AbortController();
    const promise = downloadImageFromUrl("https://example.com/slow.jpg", controller.signal);
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestCancelledError);

    controller.abort();
    await assertion;
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
