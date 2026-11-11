import { describe, it, expect } from "vitest";
import {
  ImageGenerateSchema,
  ImageGenerateOutputSchema,
} from "./schemas.js";

const REFERENCE_URL = "https://example.com/cat.png";

describe("ImageGenerateSchema", () => {
  it("accepts minimal prompt with defaults", () => {
    const result = ImageGenerateSchema.parse({ prompt: "a" });
    expect(result.prompt).toBe("a");
    expect(result.model).toBe("image-01");
    expect(result.aspect_ratio).toBe("1:1");
    expect(result.n).toBe(1);
    expect(result.response_format).toBe("base64");
    expect(result.prompt_optimizer).toBe(false);
    expect(result.inline_images).toBe(true);
  });

  it("accepts all fields filled", () => {
    const result = ImageGenerateSchema.parse({
      prompt: "A cyberpunk cat",
      model: "image-01",
      aspect_ratio: "16:9",
      n: 4,
      seed: 42,
      response_format: "url",
      prompt_optimizer: true,
      subject_reference: [
        { type: "character", image_file: REFERENCE_URL },
      ],
      output_dir: "./my-output",
      inline_images: false,
    });
    expect(result.model).toBe("image-01");
    expect(result.aspect_ratio).toBe("16:9");
    expect(result.n).toBe(4);
    expect(result.seed).toBe(42);
    expect(result.response_format).toBe("url");
    expect(result.prompt_optimizer).toBe(true);
    expect(result.subject_reference).toHaveLength(1);
    expect(result.output_dir).toBe("./my-output");
    expect(result.inline_images).toBe(false);
  });

  it("rejects empty prompt", () => {
    const result = ImageGenerateSchema.safeParse({ prompt: "" });
    expect(result.success).toBe(false);
  });

  it("rejects prompt longer than 1500 chars", () => {
    const longPrompt = "a".repeat(1501);
    const result = ImageGenerateSchema.safeParse({ prompt: longPrompt });
    expect(result.success).toBe(false);
  });

  it("accepts prompt of exactly 1500 chars", () => {
    const prompt = "a".repeat(1500);
    const result = ImageGenerateSchema.safeParse({ prompt });
    expect(result.success).toBe(true);
  });

  it("rejects invalid aspect_ratio", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      aspect_ratio: "5:5",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid model", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      model: "image-02",
    });
    expect(result.success).toBe(false);
  });

  it("rejects n=0", () => {
    const result = ImageGenerateSchema.safeParse({ prompt: "x", n: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects n=10", () => {
    const result = ImageGenerateSchema.safeParse({ prompt: "x", n: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects negative seed", () => {
    const result = ImageGenerateSchema.safeParse({ prompt: "x", seed: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects seed > 4294967295", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      seed: 4294967296,
    });
    expect(result.success).toBe(false);
  });

  it("accepts seed at uint32 max", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      seed: 4294967295,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid response_format", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      response_format: "binary",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid width and height", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      width: 1024,
      height: 1536,
    });
    expect(result.success).toBe(true);
  });

  it("rejects width without height", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      width: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects height without width", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      height: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects dimensions not divisible by 8", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      width: 1002,
      height: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects dimensions outside 512-2048", () => {
    expect(
      ImageGenerateSchema.safeParse({ prompt: "x", width: 256, height: 512 }).success,
    ).toBe(false);
    expect(
      ImageGenerateSchema.safeParse({ prompt: "x", width: 2056, height: 2048 }).success,
    ).toBe(false);
  });

  it("accepts image-01-live with a subject reference", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      model: "image-01-live",
      subject_reference: [{ type: "character", image_file: REFERENCE_URL }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects image-01-live without a subject reference", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      model: "image-01-live",
    });
    expect(result.success).toBe(false);
  });

  it("rejects width/height for image-01-live", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      model: "image-01-live",
      width: 1024,
      height: 1024,
      subject_reference: [{ type: "character", image_file: REFERENCE_URL }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects subject_reference with more than 1 item", () => {
    const refs = Array.from({ length: 2 }, () => ({
      type: "character" as const,
      image_file: REFERENCE_URL,
    }));
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      subject_reference: refs,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a base64 data URL reference", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      subject_reference: [
        {
          type: "character",
          image_file: "data:image/png;base64,aGVsbG8=",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-image data URL reference", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      subject_reference: [
        { type: "character", image_file: "data:text/plain;base64,aGVsbG8=" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects subject_reference with invalid URL", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      subject_reference: [{ type: "character", image_file: "not-a-url" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects subject_reference with empty array", () => {
    const result = ImageGenerateSchema.safeParse({
      prompt: "x",
      subject_reference: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts arbitrary output_dir string", () => {
    const result = ImageGenerateSchema.parse({
      prompt: "x",
      output_dir: "any-string-here/with/slashes",
    });
    expect(result.output_dir).toBe("any-string-here/with/slashes");
  });
});

describe("ImageGenerateOutputSchema", () => {
  const baseOutput = {
    id: "abc123",
    image_count: 2,
    saved_count: 2,
    file_paths: ["/tmp/a.jpeg", "/tmp/b.jpeg"],
    metadata: { failed_count: "0", success_count: "2" },
  };

  it("accepts full success output without failures", () => {
    const result = ImageGenerateOutputSchema.parse(baseOutput);
    expect(result.id).toBe("abc123");
    expect(result.image_count).toBe(2);
    expect(result.failures).toBeUndefined();
  });

  it("accepts output with failures array", () => {
    const result = ImageGenerateOutputSchema.parse({
      ...baseOutput,
      failures: [{ index: 1, error: "disk full" }],
    });
    expect(result.failures).toEqual([{ index: 1, error: "disk full" }]);
  });

  it("rejects output missing id", () => {
    const rest: Record<string, unknown> = { ...baseOutput };
    delete rest.id;
    const result = ImageGenerateOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer image_count", () => {
    const result = ImageGenerateOutputSchema.safeParse({
      ...baseOutput,
      image_count: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects metadata missing failed_count", () => {
    const result = ImageGenerateOutputSchema.safeParse({
      ...baseOutput,
      metadata: { success_count: "2" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects metadata missing success_count", () => {
    const result = ImageGenerateOutputSchema.safeParse({
      ...baseOutput,
      metadata: { failed_count: "0" },
    });
    expect(result.success).toBe(false);
  });
});
