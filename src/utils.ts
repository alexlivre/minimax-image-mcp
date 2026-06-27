import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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
      `output_dir fora do diretório permitido: ${resolved}\nPermitido: ${allowed}`
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

export async function saveImage(
  base64Data: string,
  prompt: string,
  outputDir: string,
  index: number
): Promise<string> {
  const timestamp = Date.now();
  const slug = sanitizeFilename(prompt);
  const suffix = randomUUID().slice(0, 8);
  const filename = `${slug}-${timestamp}-${index + 1}-${suffix}.jpeg`;
  const filepath = join(outputDir, filename);

  const buffer = Buffer.from(base64Data, "base64");
  await writeFile(filepath, buffer);

  return filepath;
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
