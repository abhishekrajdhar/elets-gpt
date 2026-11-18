// Typed fetch wrapper for the FastAPI backend (same-origin via Next.js rewrites: /api/* → backend).

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
  }
  get isEngineNotReady() {
    return this.code === "engine_not_ready";
  }
  get phase(): number | undefined {
    const d = this.details as { phase?: number } | undefined;
    return d?.phase;
  }
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
    method: opts.method ?? "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "eletsgpt",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: unknown; request_id?: string } })
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? (res.status >= 500 ? "The server is unavailable. Is the backend running?" : res.statusText),
      err?.details,
      err?.request_id,
    );
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "validation_error" && Array.isArray(e.details) && e.details.length) {
      const first = e.details[0] as { loc?: string[]; msg?: string };
      const field = first.loc?.filter((x) => x !== "body").join(".");
      return `${field ? field + ": " : ""}${first.msg ?? e.message}`;
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Unexpected error";
}
