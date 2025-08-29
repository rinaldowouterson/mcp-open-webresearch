export enum ErrorCode {
  InvalidRequest = "invalid_request",
  MethodNotFound = "method_not_found",
  InternalError = "internal_error",
}

export class McpError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = "McpError";
  }
}
