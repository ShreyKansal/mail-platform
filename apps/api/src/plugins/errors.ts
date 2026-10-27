import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { metrics } from '@mp/observability';
import { AppError, isAppError, type ErrorCode } from '@mp/shared';

/** Same path syntax as admission errors: `to[0]`, `headers.X-Foo`, `[2].subject` for batches. */
export function formatPath(segments: ReadonlyArray<string | number>): string {
  return segments.reduce<string>((acc, s) => (typeof s === 'number' ? `${acc}[${s}]` : acc ? `${acc}.${s}` : s), '');
}

/** Single error envelope for every failure: { error: { code, message, details? }, request_id }. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    let appErr: AppError;
    if (isAppError(err)) {
      appErr = err;
    } else if (hasZodFastifySchemaValidationErrors(err)) {
      appErr = new AppError(
        'validation_error',
        'request validation failed',
        err.validation.map((v) => {
          const path = formatPath(v.params.issue.path);
          return path ? { path, message: v.params.issue.message } : { message: v.params.issue.message };
        }),
      );
    } else if (isResponseSerializationError(err)) {
      req.log.error({ err }, 'response did not match its declared schema');
      appErr = new AppError('internal_error', 'internal error');
    } else if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      // Malformed JSON, wrong content type and similar transport-level problems.
      const code: ErrorCode =
        err.statusCode === 413 ? 'payload_too_large' : err.statusCode === 429 ? 'rate_limited' : err.statusCode === 404 ? 'not_found' : 'bad_request';
      appErr = new AppError(code, err.message);
    } else {
      req.log.error({ err }, 'unhandled error');
      appErr = new AppError('internal_error', 'internal error');
    }
    metrics.apiErrors.inc({ code: appErr.code });
    return reply.status(appErr.status).send({ error: appErr.toJSON(), request_id: req.id });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: { code: 'not_found', message: `route ${req.method} ${req.url.split('?')[0]} not found` }, request_id: req.id });
  });
}
