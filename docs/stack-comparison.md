# NestJS vs Django REST Framework — Week 2 comparison note

**Weekly output for Week 2.** The brief asks for a short comparison note between the backend stacks
studied. This one is written from having built the same API twice rather than from reading about the
two frameworks.

## Method

One contract, [api-contract.md](api-contract.md), frozen before either implementation started. Two
implementations, no shared code. Both satisfy the same 6 requirements and are checked by 72 tests
asserting the same behaviour.

That setup is the argument: anything that differs is a property of the framework, because nothing
else was allowed to differ. Every claim below traces to code in this repository or to a transcript in
[manual-test-evidence.md](manual-test-evidence.md).

Nest and DRF sit at opposite ends of the design spectrum — Nest is explicitly assembled (DI
container, DTO classes, pipes, filters, a separately chosen ORM), Django is convention-driven and
batteries-included (ORM, migrations, serializers, admin, test runner in the box). That gap is the
point.

## The headline number is not the line count

Non-blank, non-comment lines, excluding generated code, migrations and tests:

| | Lines | Files |
|---|---|---|
| `api-node` (NestJS) | 319 | 13 |
| `api-python` (DRF) | 264 | 16 |

Django is about 17% shorter — real, but not the interesting number. This is:

| | Direct dependencies | Installed packages |
|---|---|---|
| `api-node` | 10 runtime + 25 dev | **541** |
| `api-python` | 2 | **7** |

**541 installed packages versus 7**, for the same six endpoints' worth of behaviour. Django and DRF
bring an ORM, a migration system, a serialization layer, an admin interface and a test runner in
those two packages. The Node side needed Nest, Prisma, a SQLite driver adapter, `class-validator`,
`class-transformer`, `dotenv`, plus Jest, ts-jest, supertest, ESLint, Prettier and TypeScript to
reach the same place.

That is the sharpest thing this exercise measured, and it is a maintenance and supply-chain fact
before it is an aesthetic one.

## Where the code actually goes

| Area | NestJS | DRF | Shorter |
|---|---|---|---|
| Problem+json error layer | 125 | 78 | **DRF** by 47 |
| Validation rules | 36 | 23 | **DRF** by 13 |
| Routing + request handling | 80 | 34 | **DRF** by 46 |
| Model + wire mapping | 19 | 12 | **DRF** by 7 |
| Framework wiring | 59 | **91** | **NestJS** by 32 |

DRF wins every area except wiring — and that one row deserves an asterisk. Django's 91 lines are
almost entirely `settings.py` as `django-admin startproject` generated it: session middleware,
message framework, static files, four password validators, a template engine. None of it is needed
by a JSON API with one model. It was deliberately left in place, because trimming it is a decision
about deployment rather than about this exercise, and keeping it is an honest record of what
`startproject` actually hands you.

Read past that and the pattern is consistent: **DRF needed less code for everything that is the
API's actual job.** Nest's extra lines are the DI wiring, the module declarations, and a
three-file error layer where Django needed one.

## Where DRF was clearly better

**The ORM and migrations are already there.** `models.py` is 12 lines and
`makemigrations` writes the migration. On the Node side, choosing Prisma meant a schema file, a
generator config, a driver adapter, a `PrismaService` managing connection lifecycle against Nest's
lifecycle hooks, and a generated client — which then caused three separate problems, described below.

**Serializers do double duty.** One `ItemSerializer` declares the write rules *and* the wire shape.
Nest needs a `CreateItemDto` for input and an `ItemResponse` plus a `toItemResponse` mapper for
output. Nest's split is arguably the better design — it makes it impossible for a new database column
to leak into the API by accident, and there is a test asserting exactly that — but it is more moving
parts for the same result.

**Test isolation is free, and this is the most concrete gap in the whole comparison.** Django creates
and destroys a dedicated test database automatically; the Django suite required zero setup. The
equivalent on the Node side took **three files** — `test-database.ts`, `global-setup.ts`,
`setup-env.ts` — plus two non-obvious Jest settings, because the suite truncates tables between
tests and pointing it at `dev.db` would have destroyed the seed data on the first run.

**The tests run 8× faster.** 1 second for 30 Django tests against 8 seconds for 35 Jest e2e tests.
Most of that gap is TypeScript compilation, not test execution.

## Where NestJS was clearly better

**Types across the whole request path, checked at build time.** `CreateItemDto` is the validation
schema *and* the type the service receives *and* the type the mapper consumes. Rename a field and the
compiler finds every use. The Python side has no equivalent: the serializer enforces shape at
runtime, and nothing checks that `views.py` and `serializers.py` agree until a request arrives. No
`mypy` is configured here, so this is a real difference in what the two stacks catch before running.

**Uniform error handling with a smaller blast radius.** A bare `@Catch()` filter means no exception
can escape as anything but `problem+json` — including one nobody anticipated. DRF's
`EXCEPTION_HANDLER` covers DRF's own exceptions, and Django's `handler404`/`handler500` cover the
rest, which is two mechanisms instead of one. It also has a trap: `handler404` is **bypassed while
`DEBUG = True`**, so an API relying on it has one error shape in development and another in
production. Working around that needed a terminal catch-all URL pattern.

**Dependency injection makes substitution obvious.** Testing a service against a fake repository is a
provider override. Django's ORM is reached through the model class itself, which is convenient and
means there is no seam — you swap the database, not the dependency.

## What each framework actively fought

The most useful part of the week. Four of these are recorded in code comments at the point where they
bite.

### Prisma 7 caused three separate problems, none of them about databases

1. **The generated client had to live inside `src/`.** `tsc` infers its root directory from the common
   ancestor of every compiled file, so a client generated at `../generated` silently moved the build
   output from `dist/main.js` to `dist/src/main.js` and broke `npm run start:prod`.
2. **The client had to be told to emit CommonJS.** Prisma 7 emits ESM by default, which uses
   `import.meta.url`. Nest compiles to CommonJS, and Node refuses to load ESM-only syntax as
   CommonJS — the app died during module resolution with a completely misleading *"Cannot find module
   ./internal/class.js"*.
3. **Jest needed two workarounds for it.** The generated TypeScript imports its own siblings with a
   `.js` extension (correct for Node's ESM resolution, unresolvable for Jest), and Prisma loads its
   WASM query compiler through a dynamic `import()` that Jest's CommonJS VM cannot execute unless the
   test run is compiled as `commonjs`. Both are documented at length in `test/jest-e2e.config.js`.

None of these is a Nest problem, which is the point: **Nest's unopinionated approach to persistence
means the ORM's problems are yours.** Django's ORM is not better than Prisma, but it is already
integrated, and nothing above has an equivalent on that side.

### DRF's defaults were wrong for this contract twice

1. **`COERCE_DECIMAL_TO_STRING`.** DRF serialises `DecimalField` as a *string* by default, to protect
   precision through JavaScript's float. The contract says `price` is a JSON number, so this had to be
   switched off deliberately. A sensible default, and the wrong one here — and it would have shipped
   silently, because `"249.99"` looks fine until a client does arithmetic on it.
2. **`UniqueValidator` had to be removed.** `ModelSerializer` generates one from the model's
   `unique=True`, and it issues its own `SELECT` and answers `400`. The contract says a duplicate SKU
   is `409`. Declaring `sku` explicitly removes the validator and lets the database decide — which is
   also the only check that cannot lose a race against a concurrent insert.

### Nest's pipes needed configuring before they were usable

`ValidationPipe` reports *every* failing constraint by default, so an omitted `price` answered with
"This field is required." **and** "Must not exceed 99999999.99." — the range checks all firing
against `undefined` and burying the useful message. `stopAtFirstError: true` fixes it. A custom
`exceptionFactory` was then needed to turn class-validator's nested error tree into the contract's
flat field-keyed map.

### Django's transaction semantics produced the only real bug

`perform_create` caught `IntegrityError` to convert it into the contract's `409` — and did not wrap
the insert in an atomic block. Django marks a transaction unusable as soon as a database error occurs
inside it, so the next query raises `TransactionManagementError`.

Invisible under the default autocommit-per-request. Fatal the moment an outer transaction exists —
`ATOMIC_REQUESTS = True`, a service method wrapping several writes, or a `TestCase`, which is where it
surfaced. A duplicate SKU would have poisoned the rest of the request and turned a clean `409` into a
`500`.

**Found by the test suite, not by review**, and it is the strongest argument in this repository for
having written the tests at all. Fixed with a savepoint, which is Django's documented rule: do not
catch `IntegrityError` outside an atomic block.

## Two places the stacks still differ

Both found by sending the same request to each — which no per-stack suite can do — and both now
recorded in the contract.

- **`DELETE /items/1` answers `404` from Nest and `405` from Django.** Nest has no `DELETE` handler,
  so its router never matches; Django's URL pattern matches and the view rejects the method. Both are
  `problem+json`, and the contract specifies nothing for a verb it does not define.
- **A whole-number price serialises as `649` from Node and `649.0` from Django.** The same JSON number
  either way; JavaScript has one numeric type, Python distinguishes `int` from `float`. Unfixable
  short of sending `price` as a string, which the contract rejects.

Where the two *did* agree is worth stating too: the `400` required-field response is byte-identical
including every message string, and the `409` differs only by Python's space-after-colon.

## Which would I choose

**For this API — a handful of endpoints over one table — Django REST Framework.** Less code for
everything that is the actual job, two dependencies instead of 541 packages, migrations and a test
database for free, and a test suite that runs in a second. Nothing Nest offered was needed at this
size, and its ORM choice cost three separate problems before a single endpoint worked.

That answer changes as the surface grows, and the reason is the typing. On a one-model API, runtime
validation at the serializer is enough. On thirty models with relations between them, `CreateItemDto`
being simultaneously the validation schema, the service's parameter type and the mapper's input is
worth a great deal — a renamed field becomes a build error rather than a `KeyError` in production.
DRF has no equivalent without adding `mypy` and type stubs, which is to say without rebuilding some
of what Nest starts with.

The honest dividing line is **how much the contract changes and how many people change it.** Two
endpoints that are already written: Django, comfortably. A large API under active development by
several people: Nest's compile-time guarantees start to pay for its ceremony.

## Where this note is thin

- **SQLite only.** `DECIMAL(10,2)` behaves differently on other engines, and `price` precision is
  exactly the rule most likely to move on PostgreSQL or SQL Server. Neither stack has run against
  either.
- **No concurrency was ever applied.** Both stacks decide SKU uniqueness at the database specifically
  so they are correct under a race. That reasoning is sound and completely untested — no concurrent
  load was run.
- **One model, no relations.** The comparison never touches where ORMs actually diverge: joins, eager
  versus lazy loading, `N+1` queries, transactions across aggregates. Prisma's typed relational
  queries versus Django's `select_related` is probably the most consequential difference between these
  stacks and this exercise cannot see it.
- **No authentication.** Which is the other place the two ecosystems differ sharply, and is out of
  scope here.
- **PHP and Laravel are in the Week 2 topic list and are not here.** The brief asks for at least two
  backend stacks; this repository does two properly rather than four superficially.
