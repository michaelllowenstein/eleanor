/**
 * Browser twin of api/src/core/redact.ts. Applied to every log field before
 * it is buffered, printed or sent, so a careless call can't leak a key.
 */

const SECRET_KEY =
  /(authorization|cookie|password|passwd|secret|token|api[-_]?key|apikey|credential|private[-_]?key|session[-_]?id|id[-_]?token)/i;
const SDP_KEYS = new Set(["sdp", "offer", "answer", "offerSdp", "answerSdp", "body"]);

const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_KEYS = 60;
const MAX_STRING = 2_000;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;

  if (value instanceof Error || isDomException(value)) return serializeError(value as Error, depth);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return `[binary ${(value as ArrayBuffer).byteLength} bytes]`;
  }
  if (typeof MediaStream !== "undefined" && value instanceof MediaStream) {
    return { mediaStream: value.id.slice(0, 8), tracks: value.getTracks().length };
  }

  if (depth >= MAX_DEPTH) return "[truncated: depth]";

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`[+${value.length - MAX_ARRAY} more]`);
    return items;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (count++ >= MAX_KEYS) {
        out["…"] = "[truncated: keys]";
        break;
      }
      if (SECRET_KEY.test(key)) {
        out[key] = inner === undefined || inner === null || inner === "" ? inner : "[redacted]";
      } else if (SDP_KEYS.has(key) && typeof inner === "string" && looksLikeSdp(inner)) {
        out[key] = `[sdp ${byteLength(inner)} bytes]`;
      } else {
        out[key] = redact(inner, depth + 1);
      }
    }
    return out;
  }

  return String(value);
}

export function redactString(value: string): string {
  if (looksLikeSdp(value)) return `[sdp ${byteLength(value)} bytes]`;
  const masked = value
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***");
  return masked.length > MAX_STRING
    ? `${masked.slice(0, MAX_STRING)}…[+${masked.length - MAX_STRING} chars]`
    : masked;
}

function looksLikeSdp(value: string): boolean {
  return value.trimStart().startsWith("v=0") && /\r?\n[a-z]=/.test(value);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isDomException(value: unknown): boolean {
  return typeof DOMException !== "undefined" && value instanceof DOMException;
}

function serializeError(error: Error, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: error.name,
    message: redactString(error.message),
  };
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") out["code"] = code;
  if (error.stack) out["stack"] = error.stack.split("\n").slice(0, 6).join("\n");
  if (error.cause !== undefined && depth < MAX_DEPTH) out["cause"] = redact(error.cause, depth + 1);
  return out;
}
