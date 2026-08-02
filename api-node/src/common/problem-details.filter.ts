import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  buildGenericProblem,
  buildProblem,
  PROBLEM_CONTENT_TYPE,
  PROBLEM_KIND_BY_STATUS,
  type ProblemDetails,
} from './problem-details';

/**
 * Catches everything and renders it as `application/problem+json`.
 *
 * Registering it with a bare `@Catch()` is what makes the contract airtight: an exception
 * nobody anticipated becomes a 500 problem document rather than Nest's default JSON error
 * body, so there is no response shape the API can emit that a client hasn't been told about.
 */
/** Lowest status that means "the server broke", rather than "the request was wrong". */
const SERVER_ERROR_THRESHOLD = 500;

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const problem = this.toProblem(exception, request.url);

    if (problem.status >= SERVER_ERROR_THRESHOLD) {
      // The client gets a generic message; the operator gets the real one.
      this.logger.error(`Unhandled error on ${request.method} ${request.url}`, exception);
    }

    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }

  private toProblem(exception: unknown, instance: string): ProblemDetails {
    if (!(exception instanceof HttpException)) {
      return buildProblem(
        'internal-error',
        'An unexpected error occurred while processing the request.',
        instance,
      );
    }

    const status = exception.getStatus();
    const kind = PROBLEM_KIND_BY_STATUS[status];

    if (kind === 'validation-error') {
      return buildProblem(
        kind,
        'One or more fields are invalid.',
        instance,
        extractErrorMap(exception),
      );
    }

    if (kind === 'internal-error') {
      return buildProblem(
        kind,
        'An unexpected error occurred while processing the request.',
        instance,
      );
    }

    if (kind) {
      return buildProblem(kind, exception.message, instance);
    }

    return buildGenericProblem(status, exception.message, instance);
  }
}

/** Reads the field-keyed map planted by `validationExceptionFactory`. */
function extractErrorMap(exception: HttpException): Record<string, string[]> | undefined {
  const payload = exception.getResponse();

  if (typeof payload === 'object' && payload !== null && 'errors' in payload) {
    return (payload as { errors: Record<string, string[]> }).errors;
  }

  return undefined;
}
