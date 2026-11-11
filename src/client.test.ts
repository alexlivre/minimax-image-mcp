import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MiniMaxClient } from "./client.js";
import {
  MiniMaxApiError,
  MiniMaxHttpError,
  RequestCancelledError,
  RequestTimeoutError,
} from "./errors.js";
import {
  IMAGE_API_URL,
  DEFAULT_MODEL,
  DEFAULT_ASPECT_RATIO,
  MAX_BACKOFF_MS,
  RETRY_DELAYS,
  BODY_READ_TIMEOUT_MS,
} from "./constants.js";

function buildSuccessResponse(
  imageB64s: string[] = ["aGVsbG8="],
  metadata: { failed_count: string | number; success_count: string | number } = {
    failed_count: "0",
    success_count: String(imageB64s.length),
  },
): Response {
  return jsonResponse({
    id: "test-id-123",
    data: { image_base64: imageB64s },
    metadata,
    base_resp: { status_code: 0, status_msg: "success" },
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function buildErrorEnvelope(statusCode: number, statusMsg: string): Response {
  return jsonResponse({
    base_resp: { status_code: statusCode, status_msg: statusMsg },
  });
}

function buildHangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    return new Promise((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  });
}

function getRequestInit(fetchMock: ReturnType<typeof vi.fn>, call = 0): RequestInit {
  const entry = fetchMock.mock.calls[call];
  expect(entry).toBeDefined();
  return entry![1] as RequestInit;
}

describe("MiniMaxClient.generateImage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns parsed data on first-try success", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    const result = await client.generateImage({ prompt: "a cat" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.base_resp?.status_code).toBe(0);
    expect(result.data.image_base64).toEqual(["aGVsbG8="]);
  });

  it("coerces numeric metadata counts to strings", async () => {
    fetchMock.mockResolvedValueOnce(
      buildSuccessResponse(["aGVsbG8="], { failed_count: 0, success_count: 1 }),
    );
    const client = new MiniMaxClient("test-key");
    const result = await client.generateImage({ prompt: "a cat" });

    expect(result.metadata.failed_count).toBe("0");
    expect(result.metadata.success_count).toBe("1");
  });

  it("throws MiniMaxApiError without retry on fatal 1004", async () => {
    fetchMock.mockResolvedValueOnce(buildErrorEnvelope(1004, "Unauthorized"));
    const client = new MiniMaxClient("test-key");

    await expect(client.generateImage({ prompt: "a cat" }))
      .rejects.toBeInstanceOf(MiniMaxApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws MiniMaxApiError without retry on 2013 invalid params", async () => {
    fetchMock.mockResolvedValueOnce(buildErrorEnvelope(2013, "invalid parameters"));
    const client = new MiniMaxClient("test-key");

    const error = await client.generateImage({ prompt: "a cat" }).catch((e) => e);
    expect(error).toBeInstanceOf(MiniMaxApiError);
    expect(error.statusCode).toBe(2013);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry unknown API status codes", async () => {
    fetchMock.mockResolvedValueOnce(buildErrorEnvelope(9999, "mystery"));
    const client = new MiniMaxClient("test-key");

    await expect(client.generateImage({ prompt: "a cat" }))
      .rejects.toBeInstanceOf(MiniMaxApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 1002 even when the error payload has no data/metadata", async () => {
    fetchMock
      .mockResolvedValueOnce(buildErrorEnvelope(1002, "rate limit"))
      .mockResolvedValueOnce(buildSuccessResponse());

    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS[1002] ?? 0);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.base_resp?.status_code).toBe(0);
  });

  it("uses the 60s delay for 1002", async () => {
    fetchMock
      .mockResolvedValueOnce(buildErrorEnvelope(1002, "rate limit"))
      .mockResolvedValueOnce(buildSuccessResponse());

    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });

    await vi.advanceTimersByTimeAsync((RETRY_DELAYS[1002] ?? 0) - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the 30s delay for 2045", async () => {
    fetchMock
      .mockResolvedValueOnce(buildErrorEnvelope(2045, "growth limit"))
      .mockResolvedValueOnce(buildSuccessResponse());

    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });

    await vi.advanceTimersByTimeAsync((RETRY_DELAYS[2045] ?? 0) - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws Error with 'Unexpected API response shape' when response is malformed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "x" }));
    const client = new MiniMaxClient("test-key");

    await expect(client.generateImage({ prompt: "a cat" })).rejects.toThrow(
      /Unexpected API response shape/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws MiniMaxHttpError on invalid JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not json", { status: 200, statusText: "OK" }),
    );
    const client = new MiniMaxClient("test-key");

    await expect(client.generateImage({ prompt: "a cat" }))
      .rejects.toBeInstanceOf(MiniMaxHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-retryable HTTP 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "unauthorized" }, 401, { "x-test": "1" }),
    );
    const client = new MiniMaxClient("test-key");

    const error = await client.generateImage({ prompt: "a cat" }).catch((e) => e);
    expect(error).toBeInstanceOf(MiniMaxHttpError);
    expect(error.httpStatus).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries HTTP 500 with backoff", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("server error", { status: 500 }))
      .mockResolvedValueOnce(buildSuccessResponse());

    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });

    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.id).toBe("test-id-123");
  });

  it("honors Retry-After on HTTP 429", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("slow down", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(buildSuccessResponse());

    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.id).toBe("test-id-123");
  });

  it("retries on network error and uses full-jitter backoff", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(buildSuccessResponse());

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });

    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);

    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.id).toBe("test-id-123");

    const delayArgs = setTimeoutSpy.mock.calls
      .map(([, delay]) => delay)
      .filter(
        (delay): delay is number =>
          typeof delay === "number" && delay <= MAX_BACKOFF_MS,
      );
    expect(delayArgs.length).toBeGreaterThan(0);
    for (const delay of delayArgs) {
      expect(delay).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    }
  });

  it("throws after maxRetries+1 attempts when fetch always rejects", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const client = new MiniMaxClient("test-key", 60000, 2);
    const promise = client.generateImage({ prompt: "a cat" });
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);

    await expect(promise).rejects.toThrow(/ECONNREFUSED/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws RequestTimeoutError after the configured request timeout", async () => {
    fetchMock.mockImplementation(buildHangingFetch());

    const client = new MiniMaxClient("test-key", 5000);
    const promise = client.generateImage({ prompt: "a cat" });
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws RequestTimeoutError when reading the body takes too long", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });

    const client = new MiniMaxClient("test-key", BODY_READ_TIMEOUT_MS);
    const promise = client.generateImage({ prompt: "a cat" });
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws RequestCancelledError when the client signal aborts", async () => {
    fetchMock.mockImplementation(buildHangingFetch());

    const controller = new AbortController();
    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" }, controller.signal);

    const assertion = expect(promise).rejects.toBeInstanceOf(RequestCancelledError);
    controller.abort();

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends Bearer <apiKey> in Authorization header", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("sk-my-secret-key");
    await client.generateImage({ prompt: "a cat" });

    const headers = getRequestInit(fetchMock).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-my-secret-key");
  });

  it("POSTs to IMAGE_API_URL", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({ prompt: "a cat" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(IMAGE_API_URL);
    expect(getRequestInit(fetchMock).method).toBe("POST");
  });

  it("body defaults model and aspect_ratio", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({ prompt: "a cat" });

    const body = JSON.parse(getRequestInit(fetchMock).body as string);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.aspect_ratio).toBe(DEFAULT_ASPECT_RATIO);
  });

  it("body forwards model and generation params", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({
      prompt: "a cat",
      model: "image-01-live",
      aspect_ratio: "16:9",
      n: 2,
      seed: 42,
      prompt_optimizer: true,
      subject_reference: [
        { type: "character", image_file: "https://example.com/cat.png" },
      ],
    });

    const body = JSON.parse(getRequestInit(fetchMock).body as string);
    expect(body.model).toBe("image-01-live");
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.n).toBe(2);
    expect(body.seed).toBe(42);
    expect(body.prompt_optimizer).toBe(true);
    expect(body.subject_reference).toHaveLength(1);
  });

  it("body uses width/height instead of aspect_ratio when both are provided", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({
      prompt: "a cat",
      aspect_ratio: "16:9",
      width: 1024,
      height: 1536,
    });

    const body = JSON.parse(getRequestInit(fetchMock).body as string);
    expect(body.width).toBe(1024);
    expect(body.height).toBe(1536);
    expect(body.aspect_ratio).toBeUndefined();
  });

  it("Content-Type is application/json", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({ prompt: "a cat" });

    const headers = getRequestInit(fetchMock).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
