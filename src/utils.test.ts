import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  saveImage,
  readPackageMetadata,
} from "./utils.js";

const IS_WINDOWS = platform === "win32";
const OUTSIDE_ABS_PATH = IS_WINDOWS ? "C:\\Windows" : "/etc";

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
    expect(() => resolveOutputDir("../..")).toThrow(/fora do diretório permitido/);
  });

  it("throws for absolute path outside cwd", () => {
    expect(() => resolveOutputDir(OUTSIDE_ABS_PATH)).toThrow(
      /fora do diretório permitido/,
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
      /fora do diretório permitido/,
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

describe("saveImage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "minimax-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns the full filepath inside outputDir", async () => {
    const filepath = await saveImage("aGVsbG8=", "a cat", tempDir, 0);
    expect(filepath.startsWith(tempDir + sep)).toBe(true);
    expect(existsSync(filepath)).toBe(true);
  });

  it("writes base64-decoded content correctly", async () => {
    const original = "hello world from base64";
    const b64 = Buffer.from(original).toString("base64");
    const filepath = await saveImage(b64, "a cat", tempDir, 0);
    const content = readFileSync(filepath);
    expect(content.toString("utf8")).toBe(original);
  });

  it("filename contains the slug of the prompt", async () => {
    const filepath = await saveImage("aGVsbG8=", "A Sunny Cat", tempDir, 0);
    expect(filepath).toMatch(/a-sunny-cat/);
  });

  it("filename ends with -<index+1>-<8-hex>.jpeg", async () => {
    const filepath = await saveImage("aGVsbG8=", "cat", tempDir, 2);
    expect(filepath).toMatch(/-3-[\da-f]{8}\.jpeg$/);
  });

  it("uses 1-indexed number in filename (index 0 becomes 1)", async () => {
    const filepath = await saveImage("aGVsbG8=", "cat", tempDir, 0);
    expect(filepath).toMatch(/-1-[\da-f]{8}\.jpeg$/);
  });

  it("filename includes a numeric timestamp segment", async () => {
    const filepath = await saveImage("aGVsbG8=", "cat", tempDir, 0);
    expect(filepath).toMatch(/cat-\d+-\d+-[\da-f]{8}\.jpeg$/);
  });

  it("two saves with same prompt do not collide (UUID suffix)", async () => {
    const a = await saveImage("aGVsbG8=", "cat", tempDir, 0);
    const b = await saveImage("aGVsbG8=", "cat", tempDir, 0);
    expect(a).not.toBe(b);
    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(true);
  });

  it("writes a jpeg file", async () => {
    const filepath = await saveImage("aGVsbG8=", "cat", tempDir, 0);
    expect(filepath.endsWith(".jpeg")).toBe(true);
  });
});

describe("readPackageMetadata", () => {
  it("returns name and version from package.json", () => {
    const meta = readPackageMetadata();
    expect(meta.name).toBe("minimax-image-mcp");
    expect(meta.version).toBe("1.0.0");
  });
});
