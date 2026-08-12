/**
 * Jest configuration for the e2e suite.
 *
 * A `.js` file rather than the `jest-e2e.json` the Nest scaffold ships, because three of these
 * settings are non-obvious enough to need explaining and JSON has nowhere to put the reasons.
 * Jest also validates unknown keys, so "comment" properties in the JSON version produced warnings.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',

  transform: {
    // The project compiles as `nodenext`, which *preserves* dynamic `import()` in the emitted
    // JavaScript. Prisma 7 loads its WASM query compiler through exactly that, and Jest's
    // CommonJS VM cannot execute a dynamic import without `--experimental-vm-modules`; every
    // test failed at `app.init()` with "A dynamic import callback was invoked without
    // --experimental-vm-modules".
    //
    // Compiling the test run as `commonjs` downlevels `import()` into a `require`, which Jest can
    // execute. `moduleResolution` and `resolvePackageJsonExports` come along because `nodenext`
    // resolution is not valid alongside `commonjs` emit.
    //
    // Type checking is switched off here and left to `npm run build`, which uses the real
    // tsconfig — so nothing is lost, and the suite does not report type errors caused by the
    // downgraded resolution mode rather than by the code.
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node10',
          resolvePackageJsonExports: false,
        },
        diagnostics: false,
      },
    ],
  },

  moduleNameMapper: {
    // The generated Prisma client is TypeScript that imports its own siblings with a `.js`
    // extension — correct for Node's ESM resolution, and unresolvable for Jest, which looks for
    // `internal/class.js` while the file on disk is `internal/class.ts`.
    //
    // Stripping the extension from relative specifiers is the standard fix. It affects nothing
    // hand-written here, because no source file in this project imports with an extension.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Creates a fresh test.db and runs the real migrations against it.
  globalSetup: '<rootDir>/global-setup.ts',
  // Points the app at that database, inside each worker process.
  setupFiles: ['<rootDir>/setup-env.ts'],

  // Every test truncates the items table, so concurrent test files would delete each other's rows
  // mid-request. One worker is the simplest correct answer for a suite this size; the alternative
  // is a database per worker keyed on JEST_WORKER_ID.
  maxWorkers: 1,
};
