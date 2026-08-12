import { toItemResponse } from './item.response';

/**
 * The two conversions in `toItemResponse` are the ones the contract is most specific about, and
 * both are places where the framework's default is wrong:
 *
 * - Prisma hands `price` back as a `Decimal`, which `JSON.stringify` would render as a *string*.
 * - `createdAt` is a `Date`, and `JSON.stringify` would produce whatever its own serialisation
 *   chooses rather than a guaranteed `Z`-suffixed instant.
 *
 * Unit tests rather than e2e, because the point is the mapping in isolation. The e2e suite asserts
 * the same guarantees over real HTTP; this asserts them without a database, which is where a
 * regression would be diagnosed fastest.
 *
 * The input is typed loosely on purpose: the real `Item` type carries Prisma's `Decimal`, and
 * constructing one here would couple this test to the generated client for no gain.
 */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Mechanical Keyboard',
    sku: 'KBD-87-BLK',
    quantity: 12,
    price: 249.99,
    createdAt: new Date('2026-08-02T18:30:00.000Z'),
    ...overrides,
  } as unknown as Parameters<typeof toItemResponse>[0];
}

describe('toItemResponse', () => {
  it('maps every field of the wire shape', () => {
    expect(toItemResponse(row())).toEqual({
      id: 1,
      name: 'Mechanical Keyboard',
      sku: 'KBD-87-BLK',
      quantity: 12,
      price: 249.99,
      createdAt: '2026-08-02T18:30:00.000Z',
    });
  });

  it('converts price to a JSON number', () => {
    const response = toItemResponse(row());

    expect(typeof response.price).toBe('number');
  });

  it('converts a Decimal-like price object to a number', () => {
    // Standing in for Prisma's Decimal, which is an object with a numeric `toString`. Left
    // unconverted it would serialise as "189.5" with quotes.
    const decimalLike = { toString: () => '189.5', valueOf: () => 189.5 };

    expect(toItemResponse(row({ price: decimalLike })).price).toBe(189.5);
  });

  it('emits createdAt as an ISO-8601 UTC instant ending in Z', () => {
    const { createdAt } = toItemResponse(row());

    expect(createdAt).toBe('2026-08-02T18:30:00.000Z');
    expect(createdAt.endsWith('Z')).toBe(true);
  });

  it('normalises a non-UTC Date to UTC', () => {
    // The contract requires a `Z` offset regardless of where the value came from.
    const response = toItemResponse(row({ createdAt: new Date('2026-08-02T20:30:00+02:00') }));

    expect(response.createdAt).toBe('2026-08-02T18:30:00.000Z');
  });

  it('preserves a zero quantity', () => {
    // The contract allows 0, and it is the value most likely to be lost to a falsy check.
    expect(toItemResponse(row({ quantity: 0 })).quantity).toBe(0);
  });

  it('omits columns that are not part of the wire shape', () => {
    // The mapper exists so a new column stays invisible to clients until it is added here on
    // purpose. This is the assertion that keeps that true.
    const response = toItemResponse(row({ internalNote: 'not for clients' }));

    expect(response).not.toHaveProperty('internalNote');
    expect(Object.keys(response).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'price',
      'quantity',
      'sku',
    ]);
  });
});
