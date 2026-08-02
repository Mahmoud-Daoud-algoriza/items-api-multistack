# Items API — NestJS

The Node.js implementation of [the shared contract](../docs/api-contract.md). NestJS 11 on
Express, Prisma 7 over SQLite.

## Prerequisites

- Node.js 20+ (developed on 22.21)
- npm 10+

## Run it

```bash
cd api-node
npm install
cp .env.example .env          # DATABASE_URL for the local SQLite file
npx prisma migrate dev        # creates dev.db, applies migrations, generates the client
npm run db:seed               # optional — three sample items
npm run start:dev             # http://localhost:3000
```

`npm install` alone is not enough to compile: the Prisma client is generated code and is
deliberately gitignored, so `prisma migrate dev` (or `npx prisma generate`) has to run before
the first build.

Quick check:

```bash
curl http://localhost:3000/items

curl -X POST http://localhost:3000/items \
  -H "Content-Type: application/json" \
  -d '{"name":"4K Monitor","sku":"MON-27-4K","quantity":3,"price":499.95}'
```

Ready-made requests covering every case in the contract live in [../http/](../http/).

## Scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` / `npm run start:prod` | Compile to `dist/`, run the compiled app |
| `npm run db:migrate` | `prisma migrate dev` — create and apply a migration |
| `npm run db:seed` | Upsert the sample items (safe to re-run) |
| `npm run db:reset` | Drop and rebuild the database from migrations |
| `npm run lint` / `npm run format` | ESLint (with `--fix`) / Prettier |
| `npm run test:e2e` | End-to-end tests |

## Layout

```
prisma/
  schema.prisma          model, generator and datasource
  migrations/            checked in; the database is rebuilt from these
  seed.ts                sample data
src/
  main.ts                bootstrap
  app-setup.ts           the global pipe and filter, shared with the e2e tests
  common/                RFC 9457 problem details: shape, filter, validation adapter
  items/                 controller, service, DTO, response mapper
  prisma/                PrismaService — client lifetime tied to Nest's
  generated/prisma/      generated client; gitignored, recreated by `prisma generate`
```

The request path is the ordinary Nest one: `ValidationPipe` builds and validates a
`CreateItemDto`, the controller delegates to `ItemsService`, the service talks to Prisma, and
anything thrown along the way is rendered by `ProblemDetailsFilter` as
`application/problem+json`.

## Notes on the Prisma 7 setup

Three things differ from the Prisma most people last used, and each cost real time:

- **The client is generated into `src/`, not a sibling folder.** `tsc` infers its root
  directory from the common ancestor of every file it compiles, so a client at
  `../generated` silently moves the build output from `dist/main.js` to `dist/src/main.js`
  and breaks `start:prod`. The same reasoning is why `prisma/` and `prisma.config.ts` are
  excluded in `tsconfig.build.json`.
- **`moduleFormat = "cjs"` is not optional here.** Prisma 7 emits an ESM client by default,
  and that client uses `import.meta.url`. Nest compiles to CommonJS, Node refuses to load a
  file containing ESM-only syntax as CommonJS, and the failure surfaces as a thoroughly
  misleading `Cannot find module './internal/class.js'`.
- **There is no Rust query engine.** Prisma 7 reaches the database through a driver adapter,
  so the connection is constructed in `PrismaService` with `PrismaBetterSqlite3` instead of
  being read from the schema's `datasource` block.

The seed runs under `tsx` rather than `ts-node`, which cannot load the generated client.

## Contract details worth knowing

- `price` is stored as `DECIMAL` and converted to a JSON **number** in `item.response.ts`;
  left alone, Prisma's `Decimal` would serialise as a string.
- `ValidationPipe` runs with `whitelist: true`, so unknown request properties are stripped
  rather than rejected — a client-supplied `id` is discarded, not honoured.
- `stopAtFirstError: true` keeps `errors` to one message per field. Without it an omitted
  `price` reports "This field is required." alongside "Must not exceed 99999999.99.", because
  the range checks all fire against `undefined` too.
- `GET /items/abc` answers `404`, not `400`. `ParseIntPipe` would answer `400`, so the id is
  parsed by hand in the controller.
- Uniqueness of `sku` is enforced by the database, and the `409` is raised from Prisma's
  `P2002` error. A `SELECT`-then-`INSERT` pre-check would still lose the race.
