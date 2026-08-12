import { TEST_DATABASE_URL } from './test-database';

/**
 * Points the application at the test database.
 *
 * This runs inside every Jest worker, before the test file is imported, which is what makes it
 * reliable: `PrismaService` reads `process.env.DATABASE_URL` in its constructor, and Jest workers
 * are separate processes from the one `globalSetup` ran in. Setting it there and hoping it is
 * inherited is the version of this that works until it does not.
 */
process.env.DATABASE_URL = TEST_DATABASE_URL;
