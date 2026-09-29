export type NodeClientErrorCode =
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INVALID_RESPONSE"
  | "UNAVAILABLE"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "REMOTE_ERROR";

export class NodeClientError extends Error {
  constructor(
    readonly code: NodeClientErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "NodeClientError";
  }
}

export function safeRetryAfter(value: string | null): number | null {
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  const seconds = Number(value);
  return seconds >= 1 && seconds <= 3600 ? seconds : null;
}
