import { REQUEST_TIMEOUT_MS } from "../constants.js";

export interface ApiRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | undefined>;
  timeout_ms?: number;
}

export async function apiGet<T>(
  baseUrl: string,
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { headers = {}, params, timeout_ms = REQUEST_TIMEOUT_MS } = options;

  const url = new URL(`${baseUrl}/${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "model-rankings-mcp-server/1.0",
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}` +
        (body ? ` — ${body.slice(0, 200)}` : "")
      );
    }

    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request to ${url.hostname}${url.pathname} timed out after ${timeout_ms}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
