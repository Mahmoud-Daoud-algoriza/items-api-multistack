/**
 * RFC 9457 "Problem Details for HTTP APIs" — the single error shape this API returns,
 * defined once in docs/api-contract.md and implemented identically by both stacks.
 */

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const PROBLEM_TYPE_BASE = 'https://items-api.local/problems';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  /** Present on 400 only: camelCase field name -> messages. */
  errors?: Record<string, string[]>;
}

export type ProblemKind = 'validation-error' | 'not-found' | 'duplicate-sku' | 'internal-error';

const CATALOGUE: Record<ProblemKind, { status: number; title: string }> = {
  'validation-error': { status: 400, title: 'Validation failed' },
  'not-found': { status: 404, title: 'Item not found' },
  'duplicate-sku': { status: 409, title: 'SKU already exists' },
  'internal-error': { status: 500, title: 'Internal server error' },
};

/** Maps an HTTP status back to the catalogue entry that produces it. */
export const PROBLEM_KIND_BY_STATUS: Record<number, ProblemKind> = {
  400: 'validation-error',
  404: 'not-found',
  409: 'duplicate-sku',
  500: 'internal-error',
};

export function buildProblem(
  kind: ProblemKind,
  detail: string,
  instance: string,
  errors?: Record<string, string[]>,
): ProblemDetails {
  const { status, title } = CATALOGUE[kind];
  return {
    type: `${PROBLEM_TYPE_BASE}/${kind}`,
    title,
    status,
    detail,
    instance,
    ...(errors ? { errors } : {}),
  };
}

/**
 * Fallback for statuses outside the catalogue — an unmatched route method, say. RFC 9457
 * allows `about:blank` when no specific problem type applies.
 */
export function buildGenericProblem(
  status: number,
  detail: string,
  instance: string,
): ProblemDetails {
  return { type: 'about:blank', title: 'Request failed', status, detail, instance };
}
