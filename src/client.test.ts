import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { MiniMaxClient } from "./client.js";
import { MiniMaxApiError } from "./errors.js";
import {
  IMAGE_API_URL,
  MODEL_ID,
  MAX_RETRIES,
  MAX_BACKOFF_MS,
  RETRY_DELAY_1002_MS,
  RETRY_DELAY_2045_MS,
} from "./constants.js";

function buildSuccessResponse(imageB64s: string[] = ["aGVsbG8="]): Response {
  return new Response(
    JSON.stringify({
      id: "test-id-123",
      data: {
        image_base64: imageB64s,
      },
      metadata: { failed_count: "0", success_count: String(imageB64s.length) },
      base_resp: { status_code: 0, status_msg: "success" },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function buildErrorResponse(
  statusCode: number,
  statusMsg: string,
): Response {
  return new Response(
    JSON.stringify({
      id: "test-id-err",
      data: { image_base64: [] },
      metadata: { failed_count: "1", success_count: "0" },
      base_resp: { status_code: statusCode, status_msg: statusMsg },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function buildMalformedResponse(): Response {
  return new Response(JSON.stringify({ id: "x" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MiniMaxClient.generateImage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // AbortSignal is an interface in TS, so vi.spyOn needs a cast.
  type AbortSpy = ReturnType<typeof vi.spyOn> & {
    mockImplementation: (fn: (ms: number) => AbortSignal) => AbortSpy;
    mockRestore: () => void;
  };
  let abortSpy: AbortSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    abortSpy = vi
      .spyOn(AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }, "timeout")
      .mockImplementation(() => new AbortController().signal) as AbortSpy;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    abortSpy.mockRestore();
    vi.useRealTimers();
  });

  it("returns parsed data on first-try success", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.base_resp.status_code).toBe(0);
    expect(result.data.image_base64).toEqual(["aGVsbG8="]);
  });

  it("throws MiniMaxApiError with isFatal=true on fatal status code (1004), no retry", async () => {
    fetchMock.mockResolvedValueOnce(
      buildErrorResponse(1004, "Não autorizado"),
    );
    const client = new MiniMaxClient("test-key");
    await expect(
      client.generateImage({ prompt: "a cat" }),
    ).rejects.toBeInstanceOf(MiniMaxApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 1002 then succeeds; uses 60s delay between attempts", async () => {
    fetchMock
      .mockResolvedValueOnce(buildErrorResponse(1002, "rate limit"))
      .mockResolvedValueOnce(buildErrorResponse(1002, "rate limit"))
      .mockResolvedValueOnce(buildSuccessResponse());

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_1002_MS);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_1002_MS);

    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.base_resp.status_code).toBe(0);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), RETRY_DELAY_1002_MS);

    setTimeoutSpy.mockRestore();
  });

  it("retries on 2045 then succeeds; uses 30s delay between attempts", async () => {
    fetchMock
      .mockResolvedValueOnce(buildErrorResponse(2045, "growth limit"))
      .mockResolvedValueOnce(buildErrorResponse(2045, "growth limit"))
      .mockResolvedValueOnce(buildSuccessResponse());

    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_2045_MS);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_2045_MS);

    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.base_resp.status_code).toBe(0);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), RETRY_DELAY_2045_MS);

    setTimeoutSpy.mockRestore();
  });

  it("throws Error with 'Unexpected API response shape' when response is malformed", async () => {
    fetchMock.mockResolvedValueOnce(buildMalformedResponse());
    const client = new MiniMaxClient("test-key");
    await expect(client.generateImage({ prompt: "a cat" })).rejects.toThrow(
      /Unexpected API response shape/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on network error (fetch rejects) and uses full-jitter backoff", async () => {
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
    expect(result.base_resp.status_code).toBe(0);

    const delayArgs = setTimeoutSpy.mock.calls
      .map(([, delay]) => delay)
      .filter((d): d is number => typeof d === "number");
    expect(delayArgs.length).toBeGreaterThan(0);
    for (const d of delayArgs) {
      expect(d).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    }

    setTimeoutSpy.mockRestore();
  });

  it("throws after MAX_RETRIES+1 attempts when fetch always rejects", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const client = new MiniMaxClient("test-key");
    const promise = client.generateImage({ prompt: "a cat" });
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);

    await expect(promise).rejects.toThrow(/ECONNREFUSED/);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it("uses custom timeout via AbortSignal.timeout", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key", 5000);
    await client.generateImage({ prompt: "a cat" });
    expect(abortSpy).toHaveBeenCalledWith(5000);
  });

  it("uses default timeout when none provided", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({ prompt: "a cat" });
    expect(abortSpy).toHaveBeenCalledWith(60_000);
  });

  it("sends Bearer <apiKey> in Authorization header", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("sk-my-secret-key");
    await client.generateImage({ prompt: "a cat" });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-my-secret-key");
  });

  it("POSTs to IMAGE_API_URL", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({ prompt: "a cat" });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe(IMAGE_API_URL);
    const init = call![1] as RequestInit;
    expect(init.method).toBe("POST");
  });

  it("body contains model: MODEL_ID plus forwarded params", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({
      prompt: "a cat",
      aspect_ratio: "16:9",
      n: 2,
      seed: 42,
    });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(MODEL_ID);
    expect(body.prompt).toBe("a cat");
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.n).toBe(2);
    expect(body.seed).toBe(42);
  });

  it("Content-Type is application/json", async () => {
    fetchMock.mockResolvedValueOnce(buildSuccessResponse());
    const client = new MiniMaxClient("test-key");
    await client.generateImage({ prompt: "a cat" });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
