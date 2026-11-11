import { BODY_READ_TIMEOUT_MS } from "./constants.js";
import { RequestCancelledError, RequestTimeoutError } from "./errors.js";

export interface TimeoutOptions {
  requestTimeoutMs: number;
  bodyTimeoutMs?: number;
  signal?: AbortSignal;
}

type Phase = "request" | "body";

async function runWithTimeouts<T>(
  options: TimeoutOptions,
  run: (signal: AbortSignal, startBodyPhase: () => void) => Promise<T>,
): Promise<T> {
  const {
    requestTimeoutMs,
    bodyTimeoutMs = BODY_READ_TIMEOUT_MS,
    signal,
  } = options;

  const controller = new AbortController();
  let phase: Phase = "request";
  let timedOut = false;
  let cancelled = false;

  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);

  const onAbort = (): void => {
    cancelled = true;
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      cancelled = true;
      controller.abort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const startBodyPhase = (): void => {
    phase = "body";
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, bodyTimeoutMs);
  };

  try {
    return await run(controller.signal, startBodyPhase);
  } catch (error) {
    if (cancelled) throw new RequestCancelledError();
    if (timedOut) {
      throw new RequestTimeoutError(
        phase === "request"
          ? `Request timed out after ${requestTimeoutMs}ms`
          : `Response body read timed out after ${bodyTimeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export interface TextFetchResult {
  response: Response;
  text: string;
}

export async function fetchText(
  url: string,
  init: RequestInit,
  options: TimeoutOptions,
): Promise<TextFetchResult> {
  return runWithTimeouts(options, async (signal, startBodyPhase) => {
    const response = await fetch(url, { ...init, signal });
    startBodyPhase();
    const text = await response.text();
    return { response, text };
  });
}

export interface BufferFetchResult {
  response: Response;
  buffer: Buffer;
}

export async function fetchBuffer(
  url: string,
  init: RequestInit,
  options: TimeoutOptions,
  maxBytes: number,
  onResponse?: (response: Response) => void,
): Promise<BufferFetchResult> {
  return runWithTimeouts(options, async (signal, startBodyPhase) => {
    const response = await fetch(url, { ...init, signal });
    onResponse?.(response);
    startBodyPhase();

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(
        `Downloaded content is too large: ${declared} bytes (limit ${maxBytes})`,
      );
    }

    const body = response.body;
    if (!body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) {
        throw new Error(
          `Downloaded content is too large: ${buffer.length} bytes (limit ${maxBytes})`,
        );
      }
      return { response, buffer };
    }

    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(
          `Downloaded content is too large: more than ${maxBytes} bytes`,
        );
      }
      chunks.push(Buffer.from(value));
    }

    return { response, buffer: Buffer.concat(chunks, total) };
  });
}
