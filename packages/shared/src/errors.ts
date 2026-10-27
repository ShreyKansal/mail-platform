/**
 * Structured application errors. Every error that crosses a service boundary
 * (HTTP response, SMTP reply, worker log) is an AppError with a stable code.
 */
export type ErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'idempotency_conflict'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'domain_not_verified'
  | 'sender_not_authorized'
  | 'account_suspended'
  | 'payload_too_large'
  | 'invalid_state'
  | 'internal_error';

const HTTP_STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_conflict: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  domain_not_verified: 403,
  sender_not_authorized: 403,
  account_suspended: 403,
  payload_too_large: 413,
  invalid_state: 409,
  internal_error: 500,
};

export interface ErrorDetail {
  path?: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
