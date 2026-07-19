import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { DOWNLOAD_TIMEOUT_MS } from "./constants.js";

export const DEFAULT_OUTPUT_DIR = "./output";

export function resolveOutputDir(dir?: string): string {
  const requested = dir || process.env.MINIMAX_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
  const resolved = resolve(requested);
  const cwd = process.cwd();
  const envBase = process.env.MINIMAX_OUTPUT_DIR
    ? resolve(process.env.MINIMAX_OUTPUT_DIR)
    : null;
  const allowed = envBase ?? cwd;

  if (resolved !== allowed && !resolved.startsWith(allowed + sep)) {
    throw new Error(
      `output_dir outside allowed directory: ${resolved}\nAllowed: ${allowed}`
    );
  }
  return resolved;
}

export function sanitizeFilename(prompt: string, maxLength = 50): string {
  return (
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, maxLength) || "image"
  );
}

const FORMAT_SIGNATURES: ReadonlyArray<{ magic: readonly number[]; ext: string }> = [
  { magic: [0xff, 0xd8, 0xff], ext: ".jpeg" },
  { magic: [0x89, 0x50, 0x4e, 0x47], ext: ".png" },
  { magic: [0x52, 0x49, 0x46, 0x46], ext: ".webp" },
];

export function detectImageExtension(buffer: Buffer): string {
  for (const { magic, ext } of FORMAT_SIGNATURES) {
    if (magic.every((byte, i) => buffer[i] === byte)) {
      return ext;
    }
  }
  return ".jpeg";
}

export function isValidImage(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return FORMAT_SIGNATURES.some(({ magic }) =>
    magic.every((byte, i) => buffer[i] === byte),
  );
}

export async function saveImage(
  base64Data: string,
  prompt: string,
  outputDir: string,
  index: number
): Promise<string> {
  const timestamp = Date.now();
  const slug = sanitizeFilename(prompt);
  const suffix = randomUUID().slice(0, 8);

  const buffer = Buffer.from(base64Data, "base64");

  if (!isValidImage(buffer)) {
    throw new Error(
      `Image ${index + 1} data is not a valid image format (JPEG, PNG, WebP). First bytes: ${buffer.subarray(0, 4).toString("hex")}`
    );
  }

  const extension = detectImageExtension(buffer);
  const filename = `${slug}-${timestamp}-${index + 1}-${suffix}${extension}`;
  const filepath = join(outputDir, filename);

  await writeFile(filepath, buffer);

  return filepath;
}

export async function downloadImageFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to download image from URL: ${response.status} ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!isValidImage(buffer)) {
    throw new Error(
      `Downloaded data from URL is not a valid image: ${url}`
    );
  }
  return buffer;
}

export function readPackageMetadata(): { name: string; version: string } {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const raw = readFileSync(fileURLToPath(pkgUrl), "utf8");
    const pkg = JSON.parse(raw) as { name?: string; version?: string };
    return {
      name: pkg.name ?? "minimax-image-mcp",
      version: pkg.version ?? "1.0.0",
    };
  } catch {
    return { name: "minimax-image-mcp", version: "1.0.0" };
  }
}
