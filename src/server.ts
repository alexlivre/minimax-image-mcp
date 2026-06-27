import { mkdir } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { MiniMaxClient } from "./client.js";
import { ImageGenerateOutputSchema, ImageGenerateSchema } from "./schemas.js";
import { EmptyResponseError, toErrorResult, toTextResult } from "./errors.js";
import { readPackageMetadata, resolveOutputDir, saveImage } from "./utils.js";

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
      outputSchema: ImageGenerateOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params, extra) => {
      const createNotifier = (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
        const token = extra._meta?.progressToken;
        if (token === undefined) {
          return async () => {};
        }
        return async (progress: number, total: number, message: string) => {
          try {
            await extra.sendNotification({
              method: "notifications/progress",
              params: { progressToken: token, progress, total, message },
            });
          } catch {
            // progress is best-effort; never break the tool
          }
        };
      };
      const notify = createNotifier(extra);

      try {
        const outputDir = resolveOutputDir(params.output_dir);
        await mkdir(outputDir, { recursive: true });

        const total = params.n ?? 1;
        await notify(0, total, "Requesting MiniMax API...");

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
          return toErrorResult(new EmptyResponseError());
        }

        await notify(total, total, "Saving images to disk...");

        const results = await Promise.allSettled(
          images.map((image, i) => saveImage(image, params.prompt, outputDir, i))
        );

        const savedPaths: string[] = [];
        const failures: Array<{ index: number; error: string }> = [];
        for (const [i, r] of results.entries()) {
          if (r.status === "fulfilled") {
            savedPaths.push(r.value);
          } else {
            failures.push({
              index: i,
              error: r.reason instanceof Error ? r.reason.message : String(r.reason),
            });
          }
        }

        if (savedPaths.length === 0) {
          return toErrorResult(
            new Error(
              `Falha ao salvar todas as ${images.length} imagens: ${failures.map(f => f.error).join("; ")}`
            )
          );
        }

        const textLines = [
          `Generated ${images.length} image(s); saved ${savedPaths.length}.`,
          ...(failures.length > 0 ? [`Failed to save: ${failures.length}`] : []),
          "",
          "Saved files:",
          ...savedPaths.map((p, i) => `  ${i + 1}. ${p}`),
          ...(failures.length > 0
            ? ["", "Save failures:", ...failures.map(f => `  #${f.index + 1}: ${f.error}`)]
            : []),
          "",
          `Metadata: ${response.metadata?.success_count ?? savedPaths.length} succeeded, ${response.metadata?.failed_count ?? failures.length} failed`,
        ];

        return toTextResult(textLines.join("\n"), {
          id: response.id,
          image_count: images.length,
          saved_count: savedPaths.length,
          file_paths: savedPaths,
          ...(failures.length > 0 ? { failures } : {}),
          metadata: response.metadata,
        });
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  return server;
}
