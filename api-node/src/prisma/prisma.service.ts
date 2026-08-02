import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';

const DEFAULT_DATABASE_URL = 'file:./dev.db';

/**
 * Wraps the generated Prisma client as an injectable singleton and ties its connection
 * lifetime to Nest's, so shutdown closes the SQLite handle instead of leaking it.
 *
 * Prisma 7 has no Rust query engine: the client talks to the database through a driver
 * adapter, which is why the connection is constructed here rather than being read from the
 * schema.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaBetterSqlite3({
        url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
