# Week 2 self-assessment

**Weekly output for Week 2.**

Two halves, kept deliberately separate:

- **Sections 1–4 are factual** — what was delivered, what each Week 2 topic was actually exercised by,
  and what was not covered. All of it is checkable against the repository, and it is the material to
  draw on when filling in the program's self-assessment form.
- **Section 5 is for the participant to complete.** Confidence ratings, personal strengths and gaps,
  and next learning steps are self-reflection. Nobody else can answer them honestly, and a pre-filled
  answer there would be worth less than a blank one. Prompts and observations are provided to make
  them easier to answer, not to answer them.

## 1. Brief requirements

The Week 2 practical exercise asks for backend exercises in **at least two** backend stacks, with six
things each.

| Requirement | `api-node` (NestJS) | `api-python` (DRF) |
|---|---|---|
| `GET /items` endpoint | ✅ | ✅ |
| `POST /items` endpoint | ✅ | ✅ |
| Basic validation | ✅ 4 fields, 5 rule types | ✅ same rules |
| Basic error handling | ✅ RFC 9457 `problem+json`, 4 statuses | ✅ same envelope |
| Database interaction *or* mock data | ✅ SQLite via Prisma — the stronger option | ✅ SQLite via Django ORM |
| README explaining how to run it | ✅ [api-node/README.md](../api-node/README.md) | ✅ [api-python/README.md](../api-python/README.md) |

| Weekly output | Status |
|---|---|
| Week 2 self-assessment form | This document is the source material for it |
| Backend exercise code / repository / branch | `items-api-multistack`, branch `feature/week-02-backend-multistack` |
| Short comparison note between the stacks studied | [stack-comparison.md](stack-comparison.md) |
| Main challenges faced | [challenges.md](challenges.md) |

Beyond the brief:

- **A frozen contract written before either stack** ([api-contract.md](api-contract.md)), which is what
  makes the comparison note evidence rather than opinion.
- **`GET /items/{id}`**, which the brief does not ask for. It is the only endpoint that exercises route
  parameters and a `404` path, and it later became the thing Week 3's detail screen was built on.
- **72 tests** and [manual test evidence](manual-test-evidence.md) — the brief asks for neither.

## 2. Topic coverage

Every Week 2 topic for the two stacks built, with the specific thing that exercised it. "Exercised by"
is the point of the table: a topic ticked with nothing concrete against it has not been learned.

### Node.js — NestJS

| Topic | Exercised by |
|---|---|
| Project structure | Feature module (`ItemsModule`), a `common/` error layer, an infrastructure module for Prisma; `main.ts` separated from `app-setup.ts` so tests configure the app identically to the server |
| Routing | `@Controller('items')`, `@Get()`, `@Get(':id')`, `@Post()`, a hand-written id parse so a bad id is `404` rather than `ParseIntPipe`'s `400` |
| Middleware | `ValidationPipe` (global) and `ProblemDetailsFilter` (global exception filter) — Nest's equivalents, configured rather than accepted by default |
| Async handling | `async`/`await` throughout the service; `enableShutdownHooks` so SIGINT closes the SQLite connection instead of leaking it |
| API development | Three endpoints against a frozen contract, `Location` header on create, `201`/`200` statuses |
| Error handling | Bare `@Catch()` filter, so nothing can escape as anything but `problem+json`; a custom `exceptionFactory` producing the contract's field-keyed error map |
| ORM basics | Prisma 7 — schema, migration, generated client, a driver adapter, and `PrismaService` binding connection lifetime to Nest's lifecycle |
| Validation | `class-validator` DTO with 5 rule types, `@Transform` to trim, `whitelist: true` to ignore unknown fields |

### Python — Django REST Framework

| Topic | Exercised by |
|---|---|
| Django basics | `startproject`/`startapp` layout, `INSTALLED_APPS`, middleware stack, `manage.py`, a custom management command for seeding |
| Routing | `urlpatterns` with `path('items', ...)` and `path('items/<int:pk>', ...)`, deliberately without trailing slashes because the contract's paths have none; a terminal catch-all pattern for unmatched routes |
| Models / schemas | `Item` model with `db_table` matching the Prisma model, `Meta.ordering` for the contract's deterministic order, and a migration |
| Validation | `ItemSerializer` with every field declared explicitly — `RegexField`, `min_length`, `min_value`, `DecimalField(max_digits, decimal_places)` — and `UniqueValidator` deliberately removed |
| API development | `ListCreateAPIView` and `RetrieveAPIView`, `get_success_headers` for the `Location` header |
| Error handling | Custom `EXCEPTION_HANDLER` rendering `problem+json`, a `DuplicateSku` exception for `409`, `handler500`, and a catch-all view because `handler404` is bypassed while `DEBUG` is on |

### Shared engineering skills

| Skill | Exercised by |
|---|---|
| REST APIs | Status code choices argued in the contract (`404` not `400` for a bad id; `409` not `400` for a duplicate; `200` with `[]` not `404` for an empty collection), `Location` on create, RFC 9457 for errors |
| SQL & database basics | Two migrations creating the same table, a unique index surfaced as `409`, `DECIMAL(10,2)` and why `price` is not a float, `PositiveIntegerField` vs `Int` + validator |
| Testing basics | 72 tests: HTTP-level contract tests on both stacks, unit tests for the response mapper and the error-map translation, an isolated test database on the Node side |
| Debugging | Four problems in [challenges.md](challenges.md) whose error messages pointed away from the cause, including *"Cannot find module ./internal/class.js"* for an ESM/CJS mismatch |
| Documentation | A frozen contract, two stack READMEs, an `http/` guide, and five docs |
| Git & pull requests | Conventional Commits, feature branch, PR |
| AI-assisted development | [ai-usage-log.md](ai-usage-log.md) |

## 3. Not covered

Stated plainly, because a self-assessment that only lists what went well is not one.

- **PHP / Laravel and .NET / ASP.NET Core.** Both are in the Week 2 topic list; neither was built. The
  brief asks for *at least two* stacks, and the choice made was two done thoroughly rather than four
  superficially. That is a defensible trade and it is still a gap — .NET in particular, given the
  program's emphasis on it.
- **FastAPI.** The brief offers "FastAPI *or* Django basics"; Django was chosen. FastAPI's Pydantic
  validation and async model would have made a *sharper* contrast with NestJS than Django did.
- **`PUT` / `PATCH` / `DELETE`.** No update or delete path anywhere, so no optimistic concurrency and no
  soft-delete considerations.
- **Authentication and authorization.** Out of scope for the contract, and one of the two places these
  ecosystems differ most.
- **Any database except SQLite.** `DECIMAL(10,2)` behaves differently elsewhere, and `price` precision is
  exactly the rule most likely to move on PostgreSQL or SQL Server. **SQL Server integration is named
  in the .NET topic list and was never touched.**
- **Relations, joins, and `N+1` queries.** One table with no foreign keys, so the comparison never
  reaches where ORMs actually diverge — `select_related` versus Prisma's typed relational queries is
  probably the most consequential difference between these stacks and this exercise cannot see it.
- **Concurrency.** Both stacks decide SKU uniqueness at the database specifically so they are correct
  under a race. No concurrent load was applied. The reasoning is sound and the evidence is absent.
- **Deployment and containerisation.** A `docker-compose.yml` exists in the repository root but neither
  stack has been deployed or run from a container.

## 4. Evidence

| Check | Result |
|---|---|
| `api-node` build (full TypeScript check) | clean |
| `api-node` unit tests | 7 passing |
| `api-node` e2e tests | 35 passing |
| `api-python` tests | 30 passing |
| Both stacks over real HTTP with `curl` | [manual-test-evidence.md](manual-test-evidence.md) |
| Same request sent to both stacks and compared | 2 divergences found and documented |
| `dev.db` intact after a full e2e run | 5 rows, verified directly |

Three findings came from that verification rather than from writing code:

1. A **real bug** — `IntegrityError` caught outside an atomic block, which would turn a clean `409` into
   a `500` under `ATOMIC_REQUESTS`. Found by the first test that queried after a rejected duplicate,
   having already survived manual `curl` testing.
2. A **cross-stack divergence no test suite could see** — `DELETE` answers `404` from Nest and `405`
   from Django. Both suites passed because each only asserted its own stack.
3. An **undocumented serialization difference** — a whole-number price is `649` from Node and `649.0`
   from Django.

The most useful single fact from Week 2 is that the bug in (1) passed manual testing. That is the
argument for the test suite, and it is why Week 3 was tested from the start.

## 5. To be completed by the participant

Not pre-filled on purpose. These are the questions the program's self-assessment form is actually
asking, and answers written by someone else are worthless to a final technical evaluation.

### 5.1 Confidence per topic

Rate honestly — 1 (could not do this unaided) to 5 (could build it from scratch and explain every
decision). The distinction that matters: *could I write this again on my own*, not *do I follow it when
I read it*.

| Topic | Rating | Note |
|---|---|---|
| NestJS project structure & modules | | |
| NestJS controllers, services & DI | | |
| Nest pipes, filters & global configuration | | |
| Prisma — schema, migrations, client | | |
| `class-validator` DTOs | | |
| Django project & app layout | | |
| Django models & migrations | | |
| DRF serializers & validation | | |
| DRF generic views | | |
| Django/DRF exception handling | | |
| REST status-code design | | |
| SQL & schema basics | | |
| Transactions & isolation | | |
| API testing | | |

Item 13 is worth rating carefully. It is the one this week produced a real bug in.

### 5.2 Strengths

What went most easily, and what that suggests about where you are already effective.

### 5.3 Gaps

Where you were reliant on AI or documentation to proceed. [ai-usage-log.md](ai-usage-log.md) names five
areas as most worth genuinely owning before the final evaluation — the atomic block, database-level
uniqueness, `price` as a JSON number, `404`-not-`400` for a bad id, and the `problem+json` layer in
both stacks. Whether each is a gap or already understood is yours to judge.

### 5.4 Next steps

Concrete and small enough to actually do. Candidates from what section 3 lists as uncovered:

- **Build the same contract in .NET / ASP.NET Core with EF Core.** The largest named gap, and the stack
  the program emphasises most. The contract already exists, so the work is purely the stack.
- **Add `PUT` and `DELETE`** — which also unblocks the edit and delete screens missing from Week 3.
- **Run either stack against PostgreSQL** and see whether the `DECIMAL(10,2)` behaviour and the `price`
  assertions still hold.
- **Add a second table with a relation**, which is the only way this exercise reaches where the two ORMs
  actually differ.
- **Write a concurrency test** that fires two identical `POST`s simultaneously, and confirm the
  database-level uniqueness claim that is currently reasoning rather than evidence.

### 5.5 Readiness for full-stack assignments

The program's stated purpose is identifying current level, strengths, gaps and next development path.
With Week 2's backend work and Week 3's frontend work both delivered — and Week 3 consuming this
repository's API directly — what does the combination say about readiness to deliver a full-stack
feature end to end, and which single area would most improve it?
