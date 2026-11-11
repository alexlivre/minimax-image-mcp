import { mkdir } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { MiniMaxClient } from "./client.js";
import { ImageGenerateOutputSchema, ImageGenerateSchema, ImageGenerateSchemaBase } from "./schemas.js";
import { EmptyResponseError, RequestCancelledError, toErrorResult } from "./errors.js";
import {
  downloadImageFromUrl,
  readPackageMetadata,
  resolveOutputDir,
  resolveReferenceImage,
  saveImage,
  type SavedImage,
} from "./utils.js";

const { name: PKG_NAME, version: PKG_VERSION } = readPackageMetadata();

function createProgressNotifier(extra: RequestHandlerExtra<ServerRequest, ServerNotification>) {
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
      // ignore
    }
  };
}

function formatValidationError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

export function createServer(client: MiniMaxClient): McpServer {
  const server = new McpServer(
    { name: PKG_NAME, version: PKG_VERSION },
    {
      instructions: [
        "This server wraps MiniMax's image-01 image generation API.",
        "",
        "Capabilities:",
        "  • Text-to-Image generation with various aspect ratios or explicit width/height",
        "  • Batch generation (1-9 images per call, 8x faster than individual calls)",
        "  • Image-to-Image with a single character reference image",
        "  • Prompt optimization",
        "  • Seed-based reproducibility",
        "  • Optional inline image content blocks (inline_images, default true)",
        "",
        "Generated images are saved to disk at ./output/ by default (relative to the MCP process cwd).",
        "To save into the user's project, pass output_dir as an absolute workspace path.",
        "Absolute output_dir is accepted. Relative paths must stay under the process cwd.",
        "Optional defaults: MINIMAX_OUTPUT_DIR. Optional lockdown: MINIMAX_ALLOWED_OUTPUT_ROOTS.",
        "Optional tuning: MINIMAX_TIMEOUT_MS (default 60000), MINIMAX_MAX_RETRIES (default 3).",
        "",
        "Best practices:",
        "  • Pass absolute output_dir when saving into the open workspace (do not copy afterward)",
        "  • Use n=9 for batch generation (same cost, 8x faster)",
        "  • Use response_format='base64' for persistence (URLs expire in 24h)",
        "  • Set inline_images=false for large batches to save context",
        "  • Use width/height (512-2048, divisible by 8) instead of aspect_ratio when exact dimensions matter",
        "  • Use model='image-01-live' only with subject_reference for character consistency",
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
        "Supports multiple aspect ratios, explicit width/height, batch generation (1-9 images), " +
        "image-to-image with a character reference, prompt optimization, " +
        "and seed-based reproducibility. " +
        "Images are saved to disk, file paths are returned, and images can be attached inline.",
      inputSchema: ImageGenerateSchemaBase.shape,
      outputSchema: ImageGenerateOutputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params, extra) => {
      const validation = ImageGenerateSchema.safeParse(params);
      if (!validation.success) {
        return toErrorResult(
          new Error(`Invalid input: ${formatValidationError(validation.error)}`),
        );
      }
      const input = validation.data;

      if (extra.signal.aborted) {
        return toErrorResult(new RequestCancelledError());
      }

      const notify = createProgressNotifier(extra);

      try {
        const subjectReference = input.subject_reference
          ? await Promise.all(
              input.subject_reference.map(async (reference) => ({
                type: reference.type,
                image_file: await resolveReferenceImage(reference.image_file, extra.signal),
              })),
            )
          : undefined;

        const outputDir = resolveOutputDir(input.output_dir);
        await mkdir(outputDir, { recursive: true }).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Cannot create output directory: ${msg}\n\nEnsure ${outputDir} is writable or set a different output_dir.`
          );
        });

        const total = input.n ?? 1;
        await notify(0, total, "Requesting MiniMax API...");

        const response = await client.generateImage(
          {
            prompt: input.prompt,
            model: input.model,
            aspect_ratio: input.aspect_ratio,
            width: input.width,
            height: input.height,
            n: input.n,
            seed: input.seed,
            response_format: input.response_format,
            prompt_optimizer: input.prompt_optimizer,
            subject_reference: subjectReference,
          },
          extra.signal,
        );

        const imagesBase64 = response.data?.image_base64 ?? [];
        const imageUrls = response.data?.image_urls ?? [];

        if (imagesBase64.length === 0 && imageUrls.length === 0) {
          return toErrorResult(new EmptyResponseError());
        }

        const imageCount = imagesBase64.length + imageUrls.length;
        await notify(imageCount, imageCount, "Saving images to disk...");

        const abortAware = <T>(promise: Promise<T>): Promise<T> => {
          if (extra.signal.aborted) {
            return Promise.reject(new RequestCancelledError());
          }
          return new Promise<T>((resolve, reject) => {
            const onAbort = () => {
              extra.signal.removeEventListener("abort", onAbort);
              reject(new RequestCancelledError());
            };
            if (extra.signal.aborted) {
              reject(new RequestCancelledError());
              return;
            }
            extra.signal.addEventListener("abort", onAbort, { once: true });
            promise.then(resolve, reject).finally(() => {
              extra.signal.removeEventListener("abort", onAbort);
            });
          });
        };

        type SavedWithSource = SavedImage & { base64: string };

        const tasks: Array<Promise<SavedWithSource>> = [];

        imagesBase64.forEach((image, i) => {
          tasks.push(
            abortAware(saveImage(image, input.prompt, outputDir, i)).then(
              (saved) => ({ ...saved, base64: image }),
            ),
          );
        });

        imageUrls.forEach((url, i) => {
          const index = imagesBase64.length + i;
          tasks.push(
            abortAware(
              (async () => {
                const buffer = await downloadImageFromUrl(url, extra.signal);
                const base64 = buffer.toString("base64");
                const saved = await saveImage(base64, input.prompt, outputDir, index);
                return { ...saved, base64 };
              })(),
            ),
          );
        });

        const results = await Promise.allSettled(tasks);

        const savedImages: SavedWithSource[] = [];
        const failures: Array<{ index: number; error: string }> = [];
        for (const [i, result] of results.entries()) {
          if (result.status === "fulfilled") {
            savedImages.push(result.value);
          } else {
            failures.push({
              index: i,
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        }

        if (savedImages.length === 0) {
          return toErrorResult(
            new Error(
              `Failed to save all ${imageCount} image(s): ${failures.map(f => f.error).join("; ")}`
            )
          );
        }

        const savedPaths = savedImages.map((image) => image.path);

        const textLines = [
          `Generated ${imageCount} image(s); saved ${savedPaths.length}.`,
          ...(failures.length > 0 ? [`Failed to save: ${failures.length}`] : []),
          "",
          "Saved files:",
          ...savedPaths.map((p, i) => `  ${i + 1}. ${p}`),
          ...(failures.length > 0
            ? ["", "Save failures:", ...failures.map(f => `  #${f.index + 1}: ${f.error}`)]
            : []),
          "",
          `Metadata: ${response.metadata.success_count} succeeded, ${response.metadata.failed_count} failed`,
          ...(input.inline_images
            ? ["", `Attached ${savedImages.length} image(s) inline as MCP image content.`]
            : []),
        ];

        const content: CallToolResult["content"] = [
          { type: "text", text: textLines.join("\n") },
        ];

        if (input.inline_images) {
          for (const saved of savedImages) {
            content.push({
              type: "image",
              data: saved.base64,
              mimeType: saved.mimeType,
            });
          }
        }

        return {
          content,
          structuredContent: {
            id: response.id,
            image_count: imageCount,
            saved_count: savedPaths.length,
            file_paths: savedPaths,
            ...(failures.length > 0 ? { failures } : {}),
            metadata: response.metadata,
          },
        };
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  return server;
}
