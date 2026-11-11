import { readFileSync } from "node:fs";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOWNLOAD_TIMEOUT_MS,
  MAX_DOWNLOAD_BYTES,
  MAX_REFERENCE_BYTES,
} from "./constants.js";
import { RequestCancelledError } from "./errors.js";
import { fetchBuffer } from "./http.js";

export const DEFAULT_OUTPUT_DIR = "./output";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** True when `child` is `parent` or a path under `parent`. */
export function isPathInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function parseAllowedRoots(): string[] | null {
  const raw = process.env.MINIMAX_ALLOWED_OUTPUT_ROOTS?.trim();
  if (!raw) return null;
  const roots = raw
    .split(delimiter)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => resolve(r));
  return roots.length > 0 ? roots : null;
}

function outsideAllowedError(resolved: string, allowed: string): Error {
  return new Error(
    `output_dir outside allowed directory: ${resolved}\nAllowed: ${allowed}\n` +
      `Pass an absolute workspace path, or set MINIMAX_ALLOWED_OUTPUT_ROOTS.`,
  );
}

export function resolveOutputDir(dir?: string): string {
  const requested = dir || process.env.MINIMAX_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
  const resolved = resolve(requested);
  const allowedRoots = parseAllowedRoots();

  if (allowedRoots) {
    if (!allowedRoots.some((root) => isPathInside(resolved, root))) {
      throw outsideAllowedError(resolved, allowedRoots.join(delimiter));
    }
    return resolved;
  }

  if (isAbsolute(requested)) {
    return resolved;
  }

  const cwd = process.cwd();
  if (!isPathInside(resolved, cwd)) {
    throw outsideAllowedError(resolved, cwd);
  }
  return resolved;
}

function parseAllowedReferenceRoots(): string[] | null {
  const raw = process.env.MINIMAX_ALLOWED_REFERENCE_ROOTS?.trim();
  if (!raw) return null;
  const roots = raw
    .split(delimiter)
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => resolve(root));
  return roots.length > 0 ? roots : null;
}

function referenceOutsideAllowedError(resolved: string, allowed: string): Error {
  return new Error(
    `subject_reference path outside allowed directory: ${resolved}\nAllowed: ${allowed}\n` +
      `Pass an absolute path, or set MINIMAX_ALLOWED_REFERENCE_ROOTS.`,
  );
}

function assertReferencePathAllowed(resolved: string, original: string): void {
  const allowedRoots = parseAllowedReferenceRoots();

  if (allowedRoots) {
    if (!allowedRoots.some((root) => isPathInside(resolved, root))) {
      throw referenceOutsideAllowedError(resolved, allowedRoots.join(delimiter));
    }
    return;
  }

  if (isAbsolute(original)) return;

  const cwd = process.cwd();
  if (!isPathInside(resolved, cwd)) {
    throw referenceOutsideAllowedError(resolved, cwd);
  }
}

export async function resolveReferenceImage(
  imageFile: string,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new RequestCancelledError();

  if (/^https?:\/\//i.test(imageFile)) return imageFile;

  const dataUrl = /^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/i.exec(imageFile);
  if (dataUrl) {
    const payload = dataUrl[1] ?? "";
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    const bytes = Math.floor((payload.length * 3) / 4) - padding;
    if (bytes > MAX_REFERENCE_BYTES) {
      throw new Error(`Reference image exceeds ${MAX_REFERENCE_BYTES} bytes`);
    }
    return imageFile;
  }

  const requested = resolve(imageFile);
  assertReferencePathAllowed(requested, imageFile);

  let realResolved: string;
  try {
    realResolved = await realpath(requested);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Reference image not found: ${requested}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot access reference image: ${requested} (${message})`);
  }

  assertReferencePathAllowed(realResolved, imageFile);

  const stats = await stat(realResolved);
  if (!stats.isFile()) {
    throw new Error(`Reference image is not a file: ${realResolved}`);
  }
  if (stats.size === 0) {
    throw new Error(`Reference image is empty: ${realResolved}`);
  }
  if (stats.size > MAX_REFERENCE_BYTES) {
    throw new Error(
      `Reference image exceeds ${MAX_REFERENCE_BYTES} bytes: ${realResolved} (${stats.size} bytes)`,
    );
  }

  const buffer = await readFile(realResolved);
  if (signal?.aborted) throw new RequestCancelledError();

  if (!isValidImage(buffer)) {
    throw new Error(`Reference image is not a valid image (JPEG or PNG): ${realResolved}`);
  }

  const extension = detectImageExtension(buffer);
  if (extension !== ".jpeg" && extension !== ".png") {
    throw new Error(`Reference image must be JPEG or PNG: ${realResolved}`);
  }

  const mimeType = extension === ".png" ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function sanitizeFilename(prompt: string, maxLength = 50): string {
  return (
    prompt
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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

export interface SavedImage {
  path: string;
  mimeType: string;
}

export async function saveImage(
  base64Data: string,
  prompt: string,
  outputDir: string,
  index: number
): Promise<SavedImage> {
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

  return {
    path: filepath,
    mimeType: MIME_BY_EXTENSION[extension] ?? "image/jpeg",
  };
}

export async function downloadImageFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const { buffer } = await fetchBuffer(
    url,
    { method: "GET" },
    {
      requestTimeoutMs: DOWNLOAD_TIMEOUT_MS,
      bodyTimeoutMs: DOWNLOAD_TIMEOUT_MS,
      signal,
    },
    MAX_DOWNLOAD_BYTES,
    (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to download image from URL: ${response.status} ${response.statusText}`,
        );
      }
    },
  );

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
