import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { validationExceptionFactory } from './common/validation-problem';

/**
 * Applies the cross-cutting configuration that defines the API's behaviour.
 *
 * It lives here rather than inline in `bootstrap()` so the e2e tests exercise the same pipe
 * and the same filter the server runs with — a test suite against a differently configured
 * app would prove nothing about validation or error shape, which is most of what this API is.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties with no matching DTO decorator: the contract's "unknown fields are
      // ignored" rule.
      whitelist: true,
      // Run class-transformer, so @Transform (trimming `name`) applies before validation.
      transform: true,
      // Report one message per field instead of every failing constraint. Without this, an
      // omitted `price` answers with "This field is required." *and* "Must not exceed
      // 99999999.99." — the range checks all fire against `undefined` and bury the useful
      // message in noise.
      stopAtFirstError: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.useGlobalFilters(new ProblemDetailsFilter());
}
