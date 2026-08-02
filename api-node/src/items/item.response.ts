import type { Item } from '../generated/prisma/client';

/** The wire shape of an item. See docs/api-contract.md. */
export interface ItemResponse {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  createdAt: string;
}

/**
 * Maps a persisted row onto the wire shape.
 *
 * Two conversions here are deliberate rather than incidental:
 *
 * - `price` is stored as DECIMAL and handed back by Prisma as a Decimal value, which would
 *   serialise as a *string*. The contract says JSON number, so it is converted explicitly.
 * - `createdAt` is a `Date`; `toISOString()` guarantees the UTC `Z` form rather than
 *   whatever `JSON.stringify` would choose.
 *
 * Keeping this mapper separate from the entity is also what stops schema changes from
 * leaking into the API by accident: a new column is invisible to clients until it is added
 * here on purpose.
 */
export function toItemResponse(item: Item): ItemResponse {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    quantity: item.quantity,
    price: Number(item.price),
    createdAt: item.createdAt.toISOString(),
  };
}
