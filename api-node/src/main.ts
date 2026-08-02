// Nest does not read .env on its own, and DATABASE_URL is needed before the Prisma driver
// adapter is constructed — so this import has to come first.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  // Without this, SIGINT kills the process before onModuleDestroy runs and the SQLite
  // connection is never closed.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? DEFAULT_PORT);
}

void bootstrap();
