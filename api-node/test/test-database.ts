import { join } from 'node:path';

/**
 * The database the e2e suite runs against.
 *
 * A separate file from `dev.db`, and not negotiable: the suite deletes every row before each
 * test, so pointing it at the development database would silently destroy the seed data on the
 * first run. Naming it here rather than in two config files is what stops the global setup and
 * the test workers from disagreeing about which file that is.
 *
 * Prisma resolves a relative `file:` URL against the directory the process was started from,
 * which for both `prisma migrate` and Jest is `api-node/`. An absolute path is used anyway, so
 * the suite does not depend on that being true.
 */
export const TEST_DATABASE_PATH = join(__dirname, '..', 'test.db');

export const TEST_DATABASE_URL = `file:${TEST_DATABASE_PATH}`;
