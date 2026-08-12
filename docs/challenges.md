# Main challenges faced — Week 2

**Weekly output for Week 2.** The problems that actually cost time, what the cause turned out to be,
and what would prevent a repeat. Ordered by how much was learned rather than by how long they took.

Nothing here is hypothetical — each one broke something in this repository, and most are recorded in a
code comment at the point where they bite.

## 1. Catching `IntegrityError` outside an atomic block

**Symptom.** One Django test failed with `AssertionError: 5 != 1`, alongside
`TransactionManagementError: An error occurred in the current transaction. You can't execute queries
until the end of the 'atomic' block.`

The `5` was the giveaway once decoded: a `GET /items` had returned an RFC 9457 problem document
instead of a list, and `len()` of that dictionary is its five members.

**Cause.** `perform_create` caught `IntegrityError` to translate a duplicate SKU into the contract's
`409`, without wrapping the insert in `transaction.atomic()`. Django marks a transaction as unusable
the moment a database error occurs inside it, so the *next* query in the same transaction raises
`TransactionManagementError`.

**Why it was invisible.** Under Django's default autocommit-per-request, the failed statement is
rolled back on its own and the next request gets a clean connection — so manual testing, `curl`, and
the `http/` files all showed a perfect `409`. It only surfaces when an outer transaction exists:
`ATOMIC_REQUESTS = True`, a service method wrapping several writes, or a `TestCase`.

**Severity.** This is the one genuine bug in Week 2. With `ATOMIC_REQUESTS` switched on — a common
production setting — a duplicate SKU would poison the rest of the request and turn a clean `409` into
a `500`.

**Fix.** `with transaction.atomic():` around the save, creating a savepoint so the rollback is scoped
to the insert. This is Django's documented rule: do not catch `IntegrityError` outside an atomic
block.

**The real lesson.** It was found by a test, on the first run of that test, and it had already
survived manual verification. Not knowing a framework's transaction semantics is normal; shipping
error-handling code whose failure mode only appears under an outer transaction, having never run it
under one, is the actual mistake.

## 2. Prisma 7 broke the build twice before an endpoint existed

Two separate failures, neither about databases, both with misleading symptoms.

**The generated client had to live inside `src/`.** With the client generated at `../generated`,
`npm run start:prod` failed to find `dist/main.js`. Cause: `tsc` infers its root directory from the
common ancestor of every compiled file, so a file outside `src/` silently moved the whole build output
down to `dist/src/main.js`. Nothing about the error mentions the Prisma client.

**The client had to be told to emit CommonJS.** Prisma 7 emits ESM by default, and that client uses
`import.meta.url`. Nest compiles to CommonJS, and Node refuses to load ESM-only syntax as CommonJS.
The app died during module resolution with **"Cannot find module ./internal/class.js"** — a file that
exists, is spelled correctly, and is not the problem. `moduleFormat = "cjs"` in the generator block
fixes it.

**The real lesson.** Both cost far more time than the fixes suggest, because in each case the error
message pointed somewhere other than the cause. Prisma 7 removed the Rust query engine in favour of
driver adapters and a WASM compiler, which is a large change, and the ecosystem's answers for version
6 do not apply. Checking the major version's own migration notes first would have been faster than
reasoning from the symptom.

## 3. Two framework defaults were wrong for the contract, and both would have shipped silently

**DRF stringifies decimals.** `DecimalField` serialises as `"249.99"` by default — a deliberate choice
to protect precision through JavaScript's float. The contract says `price` is a JSON number.
`COERCE_DECIMAL_TO_STRING = False` fixes it.

**Prisma returns a `Decimal` object,** which serialises as a string for the same reason.
`toItemResponse` converts it explicitly.

Both are sensible defaults. Both are wrong here. And critically, **both fail quietly**: `"249.99"`
looks correct in a response body and stays correct right up until a client does arithmetic on it.

**Prevention.** Money was the one field given an explicit contract rule about JSON type, and it is the
one field where both stacks needed an override. There are now assertions on the JSON type of `price`
in both suites, which is the only reason a future refactor cannot quietly undo either fix.

## 4. Getting a `409` out of a framework that wanted to give a `400`

**Cause.** DRF's `ModelSerializer` generates a `UniqueValidator` from the model's `unique=True`. It
issues its own `SELECT` and answers `400` — the contract says a duplicate SKU is `409`.

**Fix.** Declare `sku` explicitly on the serializer, which removes the generated validator, and let
the database's unique index decide. The `IntegrityError` is then translated to `409` in the view.

**Why that is the better answer anyway.** A pre-flight `SELECT` can still lose the race against a
concurrent insert. The database is the only place uniqueness can actually be decided, so checking
after the fact is more correct as well as more contract-compliant. Nest arrives at the same design
from the other direction, catching Prisma's `P2002`.

**Honest caveat.** No concurrent load was ever applied to demonstrate it. The reasoning is sound; the
evidence is absent, and that is recorded in the evidence document rather than glossed over.

## 5. Nest's `ValidationPipe` needed configuring before it was usable

**Symptom.** An omitted `price` answered with `"This field is required."` **and** `"Must not exceed
99999999.99."` — every range check firing against `undefined` and burying the message the user needs.

**Fix.** `stopAtFirstError: true`, plus a custom `exceptionFactory` to collapse class-validator's
nested error tree into the contract's flat `{field: [message]}` map, plus `whitelist: true` to
implement the "unknown fields are ignored" rule.

**The real lesson.** The pipe is powerful and its defaults are tuned for a different problem than
"return a clean field-keyed error map". Getting two very different validation pipelines to agree on one
error envelope was the single most instructive part of Week 2 — and it is what made the Week 3
frontend's per-field messages possible, since both stacks key errors by camelCase field name.

## 6. An API whose error shape depended on a debug flag

**Cause.** Django bypasses `handler404` while `DEBUG = True`. Relying on it would have meant
`problem+json` in production and a Django HTML debug page in development — one API with two contracts,
and the wrong one visible during every local test.

**Fix.** A terminal catch-all URL pattern, `re_path(r'^.*$', not_found_view)`, so an unmatched route
leaves as `problem+json` regardless of the flag.

**The real lesson.** Worth generalising: any behaviour that differs between `DEBUG` on and off is
behaviour that manual local testing cannot verify. The catch-all is not a workaround for a Django
quirk so much as a refusal to let the contract depend on an environment setting.

## 7. Test isolation was free on one side and three files on the other

**Cause.** The Jest e2e suite truncates the items table between tests. Pointed at `dev.db`, the first
run would have destroyed the seed data — and this was caught by thinking about it rather than by doing
it, which is the only reason it belongs in this list rather than in the previous one.

**Fix.** `test-database.ts` naming a separate `test.db`, `global-setup.ts` deleting it and running the
real migrations against it, and `setup-env.ts` setting `DATABASE_URL` inside each worker. Plus two
Jest workarounds for Prisma 7 (see item 2). Afterwards, `dev.db` was checked and still held all five
of its rows — verified, not assumed.

Django needed none of this. Its test runner creates and destroys a dedicated database automatically.

**The real lesson.** The most concrete "batteries included" difference in the whole exercise, and not
one I would have predicted: it is not the ORM or the serializers, it is the test harness.

## 8. A divergence that neither test suite could see

**Cause.** `DELETE /items/1` answers `404` from Nest and `405` from Django. Each stack's suite asserted
its own behaviour and passed. Nothing compared the two, so nothing noticed.

**Found by** sending the same request to both stacks by hand, while producing the manual test
evidence.

**Resolution.** Not a bug — `DELETE` is out of scope and the contract specifies no response for it.
Unifying them would mean adding handlers for three verbs the API does not have. So it is now recorded
in the contract's divergences section, and both suites assert the *shape* of those responses and
deliberately not the status, with the reason written down.

**The real lesson.** A per-stack test suite is structurally incapable of catching a cross-stack
divergence. The whole premise of this repository is "one contract, two implementations", and verifying
that premise needs a check that spans both — which for now is a human sending the same request twice.

## What I would do differently

- **Write the tests during the second stack, not after both.** Every real bug and every silent
  divergence in this list was found by a test or by a side-by-side comparison. Both arrived last, so
  both bugs existed for longer than they needed to.
- **Read the major version's migration notes before debugging its symptoms.** Both Prisma 7 problems
  presented as errors that pointed away from the cause, and both are described in Prisma's own
  upgrade documentation.
- **Treat a framework default touching money, uniqueness or transactions as guilty until checked.**
  Three of the eight items here are exactly that, and all three would have shipped quietly.
