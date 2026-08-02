import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * A handful of items so `GET /items` returns something on a fresh clone.
 *
 * Upsert-by-sku rather than insert, so re-running the seed is a no-op instead of a 409.
 */
const SEED_ITEMS = [
  { name: 'Mechanical Keyboard', sku: 'KBD-87-BLK', quantity: 12, price: 249.99 },
  { name: 'USB-C Docking Station', sku: 'DOCK-13P', quantity: 5, price: 189.5 },
  { name: 'Noise Cancelling Headset', sku: 'HDST-PRO-2', quantity: 0, price: 320.0 },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./dev.db' }),
  });

  try {
    for (const item of SEED_ITEMS) {
      await prisma.item.upsert({ where: { sku: item.sku }, update: {}, create: item });
    }

    console.log(`Seeded ${SEED_ITEMS.length} items.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
