import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_OUTPUT_DIR = "./output";

export function resolveOutputDir(dir?: string): string {
  return dir || process.env.MINIMAX_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
}

export function sanitizeFilename(prompt: string, maxLength = 50): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, maxLength);
}

export async function saveImage(
  base64Data: string,
  prompt: string,
  outputDir: string,
  index: number
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const timestamp = Date.now();
  const slug = sanitizeFilename(prompt);
  const filename = `${slug}-${timestamp}-${index + 1}.jpeg`;
  const filepath = join(outputDir, filename);

  const buffer = Buffer.from(base64Data, "base64");
  await writeFile(filepath, buffer);

  return filepath;
}
