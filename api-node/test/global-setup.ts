import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { TEST_DATABASE_PATH, TEST_DATABASE_URL } from './test-database';

/**
 * Builds a fresh test database before the suite runs.
 *
 * `prisma migrate deploy` rather than hand-written `CREATE TABLE` statements, for two reasons:
 * the schema stays in exactly one place, so a future migration cannot leave the tests asserting
 * against a table shape that no longer exists; and running the real migration path means the
 * suite fails if a committed migration is broken, which is worth knowing.
 *
 * The file is deleted first. SQLite would otherwise keep whatever the previous run left behind,
 * and `migrate deploy` is a no-op against an already-migrated database — so a stale schema would
 * persist invisibly.
 */
export default function globalSetup(): void {
  rmSync(TEST_DATABASE_PATH, { force: true });
  // SQLite's journal sidecar would otherwise be left describing a database that no longer exists.
  rmSync(`${TEST_DATABASE_PATH}-journal`, { force: true });

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: join(__dirname, '..'),
    // DATABASE_URL is passed explicitly, and `prisma.config.ts` imports `dotenv/config` — which
    // does *not* overwrite a variable that is already set. That is the only reason this does not
    // quietly migrate `dev.db` instead.
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    // npx is a shell script on Windows, so it cannot be executed directly.
    shell: true,
    stdio: 'inherit',
  });
}
