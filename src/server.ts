import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MiniMaxClient } from "./client.js";
import { ImageGenerateSchema } from "./schemas.js";
import { toTextResult, toErrorResult } from "./errors.js";
import { resolveOutputDir, saveImage } from "./utils.js";

function readPackageMetadata(): { name: string; version: string } {
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

const { name: PKG_NAME, version: PKG_VERSION } = readPackageMetadata();

export function createServer(client: MiniMaxClient): McpServer {
  const server = new McpServer(
    { name: PKG_NAME, version: PKG_VERSION },
    {
      instructions: [
        "This server wraps MiniMax's image-01 image generation API.",
        "",
        "Capabilities:",
        "  • Text-to-Image generation with various aspect ratios",
        "  • Batch generation (1-9 images per call, 8× faster than individual calls)",
        "  • Image-to-Image with character reference images",
        "  • Prompt optimization",
        "  • Seed-based reproducibility",
        "",
        "Generated images are saved to disk at ./output/ by default.",
        "Override per-call via output_dir, or globally via MINIMAX_OUTPUT_DIR env var.",
        "",
        "Best practices:",
        "  • Use n=9 for batch generation (same cost, 8× faster)",
        "  • Use response_format='base64' for persistence (URLs expire in 24h)",
        "  • Set timeout ≥ 60s for n=9",
        "  • Don't add artificial delays between requests",
      ].join("\n"),
    }
  );

  server.registerTool(
    "minimax_image_generate",
    {
      title: "Generate Image (MiniMax)",
      description:
        "Generate images from text prompts using MiniMax's image-01 model. " +
        "Supports multiple aspect ratios, batch generation (1-9 images), " +
        "image-to-image with character references, prompt optimization, " +
        "and seed-based reproducibility. " +
        "Images are saved to disk and file paths are returned.",
      inputSchema: ImageGenerateSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const outputDir = resolveOutputDir(params.output_dir);

        const response = await client.generateImage({
          prompt: params.prompt,
          aspect_ratio: params.aspect_ratio,
          n: params.n,
          seed: params.seed,
          response_format: params.response_format,
          prompt_optimizer: params.prompt_optimizer,
          subject_reference: params.subject_reference,
        });

        const images = response.data?.image_base64 ?? [];
        if (images.length === 0) {
          return toErrorResult(new Error("API retornou sucesso mas sem imagens"));
        }

        const savedPaths: string[] = [];
        for (let i = 0; i < images.length; i++) {
          const path = await saveImage(images[i], params.prompt, outputDir, i);
          savedPaths.push(path);
        }

        const text = [
          `Generated ${images.length} image(s) successfully.`,
          "",
          "Saved files:",
          ...savedPaths.map((p, i) => `  ${i + 1}. ${p}`),
          "",
          `Metadata: ${response.metadata?.success_count ?? images.length} succeeded, ${response.metadata?.failed_count ?? 0} failed`,
        ].join("\n");

        return toTextResult(text, {
          id: response.id,
          image_count: images.length,
          file_paths: savedPaths,
          metadata: response.metadata,
        });
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  return server;
}
