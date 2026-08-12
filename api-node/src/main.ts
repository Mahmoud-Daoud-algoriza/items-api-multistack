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

  // Week 3 puts a browser in front of this API, served from a different origin. A POST with
  // Content-Type: application/json is not a "simple" request, so the browser sends a preflight
  // OPTIONS /items first and refuses the real request unless it is answered — which is why the
  // apps fail in the browser while curl and the e2e tests keep working.
  //
  // This lives here rather than in configureApp() because configureApp exists to give the e2e
  // tests the same validation pipe and exception filter the server runs with. CORS is a browser
  // transport concern that no e2e test exercises, and putting it there would widen the surface
  // those tests are meant to pin down.
  app.enableCors({
    // An explicit allowlist, not `origin: true`. Reflecting whatever origin asks is convenient
    // and wrong, and this API sends no credentials, so there is nothing to gain from it.
    origin: ['http://localhost:4200', 'http://localhost:5173'],
    // Narrowed to the two verbs the contract actually has. Nest's default list includes PUT,
    // PATCH and DELETE, and advertising verbs that answer 404 is misleading.
    methods: ['GET', 'POST'],
  });

  // Without this, SIGINT kills the process before onModuleDestroy runs and the SQLite
  // connection is never closed.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? DEFAULT_PORT);
}

void bootstrap();
