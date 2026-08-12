# AI usage log — Week 2

**Weekly output for Week 2**, per the program's requirement to document how AI was used, and against
the AI usage rules in the program deck.

This log is deliberately blunt about the division of labour. A log that overstated how much was
hand-written would defeat the purpose of keeping one, and the final evaluation is a technical one — so
an inflated account here only sets up a worse conversation later.

## Tool

Claude (Opus 5) via Claude Code, working directly in the repository with terminal and file access — so
it did not only suggest code, it created files, ran migrations, started both servers, ran both test
suites, and sent real HTTP requests against them.

## What AI did

Substantially all of the implementation, working from the Week 2 brief:

- Wrote [api-contract.md](api-contract.md), the frozen contract, before either stack existed — and
  proposed the build-both-against-one-contract structure that makes the comparison note meaningful.
- Scaffolded and wrote both stacks: models, migrations, serializers/DTOs, views/controllers, services,
  the `problem+json` error layers, and the seed commands.
- Wrote all 72 tests (35 Jest e2e, 7 Jest unit, 30 Django).
- Wrote the `http/` request examples and the Week 2 written deliverables, including this file.
- Diagnosed and fixed every problem in [challenges.md](challenges.md).

## What the verification consisted of

The program's rules require that AI output be tested and understood rather than copied. Testing is the
part that can be evidenced, and it was done properly:

| Check | Result |
|---|---|
| `npm run build` (`api-node`, full TypeScript check) | clean |
| `npm test` + `npm run test:e2e` | 42 passing |
| `python manage.py test` | 30 passing |
| Both stacks exercised over real HTTP with `curl` | transcripts in [manual-test-evidence.md](manual-test-evidence.md) |
| Same request sent to both stacks and compared | 2 divergences found |
| `dev.db` still intact after a full e2e run | 5 rows, verified directly |

**Three defects were found by running things rather than by reading them**, and each one corrected
something AI had produced:

1. **A real bug in AI-written code.** `perform_create` caught `IntegrityError` outside an atomic
   block, leaving the surrounding transaction unusable. It had already passed manual `curl` testing,
   because the failure only appears under an outer transaction. Found by the first Django test that
   queried *after* a rejected duplicate.
2. **A divergence neither suite could see.** `DELETE /items/1` answers `404` from Nest and `405` from
   Django. Both suites passed, because each asserted only its own stack. Found by sending the same
   request to both by hand.
3. **An undocumented serialization difference.** A whole-number price comes back as `649` from Node and
   `649.0` from Django. Legal in both, unfixable in either, and previously unrecorded.

That is the pattern worth recording: the code was plausible, compiled, passed manual testing, and was
still wrong or incomplete in three places.

## Honest limits of this log

**"Understand it before submitting" is not something a log can discharge on someone's behalf.** The
code is commented throughout with the reasoning behind each decision, which makes it readable — but
reading an explanation is not the same as being able to defend the design cold. Ahead of the final
technical evaluation, the parts most worth genuinely owning are:

- **Why `perform_create` needs `transaction.atomic()`** — the single most likely question, and the one
  place this repository had a real bug.
- **Why duplicate-SKU detection belongs at the database** rather than in a pre-flight `SELECT`, and
  why that means removing DRF's generated `UniqueValidator`.
- **Why `price` is a JSON number and what each stack had to be told** to make that happen.
- **Why a non-numeric id returns `404` rather than `400`**, and why Nest needs a hand-written parse to
  achieve what Django's `<int:pk>` converter does for free.
- **The `problem+json` layer in both stacks** — specifically why Nest uses a bare `@Catch()` and why
  Django needs both an `EXCEPTION_HANDLER` and a catch-all URL pattern.

**Neither stack is a from-scratch demonstration of NestJS or Django proficiency.** The comparison
note's conclusions are grounded in measurements of real code and are sound as findings. They are not
evidence of fluency in either framework, and this log should not be read as claiming otherwise.

## Compliance with the program's AI usage rules

| Rule | How it was handled |
|---|---|
| Do not share secrets, credentials, tokens or production data | None exist in this work. SQLite files are local and git-ignored; the Django `SECRET_KEY` is a generated development value with an environment override, and is committed knowingly on that basis. |
| Do not use AI code in security, authentication or payment logic without review | Not applicable — the contract has no authentication and no payment logic. The nearest items are the unique-constraint handling and the rule that a `500` never leaks an exception message into the response body; both were reviewed deliberately and both are asserted by tests. |
| Always review and understand output before submitting | Partially. Everything was reviewed and mechanically verified; the depth-of-understanding half is flagged as outstanding above rather than claimed. |
| Do not copy AI-generated code without understanding it | See above — recorded honestly rather than asserted. |
| Always test the generated code | Done. 72 tests, a clean build, both stacks exercised over real HTTP, and the two stacks compared against each other. |
| Document how AI was used | This file. |

## A note on how AI was actually most useful

Worth separating from the compliance table, because it is the answer to what the AI session was
teaching.

The highest-value use was not code generation. It was **writing the contract first** — pinning down
`price` as a JSON number, the `404`-not-`400` rule for a bad id, and the `problem+json` envelope
*before* either stack existed. Every framework default that later turned out to be wrong
(DRF stringifying decimals, `ParseIntPipe` answering `400`, `UniqueValidator` answering `400`) was
caught because there was already a written statement to compare it against.

The lowest-value use was the debugging in [challenges.md](challenges.md) items 2 and 6, where AI
produced confident and initially wrong explanations of misleading error messages. Both were resolved by
reading the framework's own documentation.
