import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Collapses class-validator's nested result tree into the flat
 * `{ field: [message, ...] }` map the contract requires.
 *
 * The DTOs here are flat, so a single level is enough; nested DTOs would need recursion
 * into `error.children`.
 */
function toErrorMap(errors: ValidationError[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const error of errors) {
    map[error.property] = Object.values(error.constraints ?? {});
  }

  return map;
}

/**
 * Replaces `ValidationPipe`'s default `{ message: string[] }` payload with the field-keyed
 * map. The pipe still throws a `BadRequestException`, so `ProblemDetailsFilter` renders it
 * like every other error.
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({ errors: toErrorMap(errors) });
}
