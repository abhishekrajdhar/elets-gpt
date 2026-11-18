import { API_BASE, ApiError } from "./api";

export type SSEHandler = (event: string, data: unknown) => void;

/** POST a JSON body and consume a text/event-stream response, dispatching each event. */
export async function postSSE(path: string, body: unknown, onEvent: SSEHandler, signal?: AbortSignal) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", "X-Requested-With": "eletsgpt" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let err: { code?: string; message?: string; details?: unknown } | undefined;
    try {
      err = (await res.json())?.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? res.statusText, err?.details);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) continue;
      let data: unknown = dataLines.join("\n");
      try {
        data = JSON.parse(data as string);
      } catch {
        /* keep raw */
      }
      onEvent(event, data);
    }
  }
}
