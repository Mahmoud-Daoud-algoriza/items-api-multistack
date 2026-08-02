# Items API — Multi-Stack

The same small REST API, built twice: once with **NestJS** and once with **Django REST
Framework**. Practical deliverable for **Week 2 — Backend Multi-Stack Self-Study** of the
Enterprise Full-Stack Development Program.

The Week 2 brief asks for the same six requirements — `GET /items`, `POST /items`,
validation, error handling, database interaction, a README — in at least two backend stacks.
This repository takes that literally: one contract, frozen up front in
[docs/api-contract.md](docs/api-contract.md), implemented independently in each stack with
**no shared code**. Anything that differs between the two implementations is therefore a
property of the framework, which is exactly what the weekly comparison note is meant to
capture.

NestJS and DRF sit at opposite ends of the design spectrum — Nest is explicitly assembled
(DI container, DTO classes, pipes, filters, a separately chosen ORM), Django is
convention-driven and batteries-included (ORM, migrations, serializers, admin in the box).
That gap is the point.

## Stacks

| | `api-node/` | `api-python/` |
|---|---|---|
| Framework | NestJS 11 (Express) | Django 5 + Django REST Framework |
| Language | TypeScript | Python 3.12 |
| ORM | Prisma | Django ORM |
| Database | SQLite | SQLite |
| Validation | `class-validator` DTOs + `ValidationPipe` | DRF serializer fields |
| Error handling | Global exception filter | Custom `EXCEPTION_HANDLER` |
| Tests | Jest (e2e) | DRF `APITestCase` |
| Port | `3000` | `8000` |

SQLite on both sides: it satisfies the brief's "database interaction" option (rather than the
weaker "mock data" option) with no Docker, no server, and no connection strings — while still
exercising each stack's real ORM and migration workflow, which is the part worth comparing.

Both APIs can run simultaneously; the requests in `http/` work against either.

## Getting started

Each stack is self-contained and has its own README with exact steps:

- [api-node/README.md](api-node/README.md)
- [api-python/README.md](api-python/README.md)

## Repository layout

```
api-node/       NestJS + Prisma implementation
api-python/     Django + DRF implementation
docs/           shared contract and Week 2 written deliverables
http/           request examples that run against either stack
```

## Documentation

| Document | Purpose |
|---|---|
| [docs/api-contract.md](docs/api-contract.md) | The frozen contract both stacks implement |
| [docs/stack-comparison.md](docs/stack-comparison.md) | Weekly output — NestJS vs DRF |
| [docs/challenges.md](docs/challenges.md) | Weekly output — main challenges faced |
| [docs/self-assessment.md](docs/self-assessment.md) | Weekly output — Week 2 self-assessment |
| [docs/ai-usage-log.md](docs/ai-usage-log.md) | How AI was used, per the program's AI usage rules |

## Conventions

- **Commits** — [Conventional Commits](https://www.conventionalcommits.org/), scoped by stack
  where it helps: `feat(node)`, `feat(python)`, `docs`, `test`, `chore`
- **Branch** — work lands on `feature/week-02-backend-multistack`, merged to `main` via PR
- **Line endings** — LF everywhere except Windows script files, enforced by `.editorconfig`

## Milestone status

| | Milestone | Status |
|---|---|---|
| M0 | Repository bootstrap & frozen API contract | ✅ |
| M1 | `api-node` — NestJS + Prisma | ✅ |
| M2 | `api-python` — Django + DRF | ⬜ |
| M3 | Shared request examples & manual test evidence | ⬜ |
| M4 | Smoke tests in both stacks | ⬜ |
| M5 | Week 2 written deliverables | ⬜ |
| M6 | Git wrap-up & pull request | ⬜ |
