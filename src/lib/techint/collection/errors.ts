export type CollectionErrorCode =
  | "SOURCE_DISABLED"
  | "SOURCE_ARCHIVED"
  | "SOURCE_NOT_AVAILABLE"
  | "SOURCE_ALREADY_RUNNING"
  | "SOURCE_COOLDOWN"
  | "INVALID_SOURCE_SETTINGS"
  | "INVALID_CURSOR"
  | "UNSUPPORTED_CURSOR_VERSION"
  | "LEASE_EXPIRED"
  | "LEASE_MISMATCH"
  | "HTTP_TIMEOUT"
  | "HTTP_STATUS"
  | "HTTP_BODY_TOO_LARGE"
  | "HTTP_CONTENT_TYPE"
  | "RATE_LIMITED"
  | "INVALID_SOURCE_RESPONSE"
  | "PAGE_LIMIT_EXCEEDED"
  | "ITEM_LIMIT_EXCEEDED"
  | "SIGNAL_LIMIT_EXCEEDED"
  | "SIGNAL_RECORDING_FAILED"
  | "COLLECTION_FAILED";

export class CollectionError extends Error {
  constructor(
    readonly code: CollectionErrorCode,
    message: string,
  ) {
    super(message.slice(0, 500));
    this.name = "CollectionError";
  }
}

export function controlledCollectionError(error: unknown): CollectionError {
  if (error instanceof CollectionError) return error;
  return new CollectionError("COLLECTION_FAILED", "Technical source collection failed safely.");
}
