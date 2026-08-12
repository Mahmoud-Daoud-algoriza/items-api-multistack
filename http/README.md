# Request examples

Hand-runnable requests for both stacks.

| File | Contains |
|---|---|
| [items.http](items.http) | The happy path — list, fetch, and the create cases worth seeing succeed |
| [errors.http](errors.http) | Every failure the contract defines, all `application/problem+json` |

## Running them

Both files work in **VS Code** with the
[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.REST-Client) extension, or in
any **JetBrains IDE**, which understands the same format natively. A *Send Request* link appears above
each request.

Start a backend first:

```bash
cd api-node   && npm run start:dev        # http://localhost:3000
cd api-python && python manage.py runserver # http://localhost:8000
```

Then pick which one the requests hit by moving the comment on the two lines at the top of each file:

```
@baseUrl = http://localhost:3000
# @baseUrl = http://localhost:8000
```

That is the only thing that changes. Both stacks implement the same frozen
[contract](../docs/api-contract.md), and being able to point one file at either of them — and get
matching responses — is the claim this exercise is built to demonstrate. These files are how you check
it by hand rather than taking the test suites' word for it.

## Why these exist alongside the test suites

The suites in `api-node/test/` and `api-python/items/tests.py` assert the same behaviour and assert it
more rigorously. These files are for the parts a test cannot judge:

- **Whether the two stacks feel like one API.** Sending the same request to both and reading the two
  responses side by side is a different check from asserting that both return `400`.
- **Whether the error messages are actually useful to a human.** The `errors` *keys* are contractual;
  the message *strings* are each framework's own wording. Whether class-validator's phrasing or DRF's
  is clearer is a judgement, and it needs to be read.
- **Reviewing without running a test runner.** A reviewer can send four requests and see the contract
  working.

Some requests deliberately have side effects — the create requests insert rows, and the duplicate-SKU
example is meant to be sent twice. They run against the development database, so re-running them may
answer `409` where they answered `201` the first time. That is the expected behaviour, not a broken
example. `npm run db:reset` in `api-node` and deleting `db.sqlite3` then re-migrating in `api-python`
return either stack to a clean state.
