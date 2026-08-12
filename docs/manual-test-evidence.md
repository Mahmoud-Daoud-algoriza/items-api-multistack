# Manual test evidence — Week 2

**Weekly output for Week 2.** Real transcripts, not descriptions of intent. Where a check has not
been run, it says so.

The point of running these by hand alongside the 72 automated tests is the one thing a test suite
cannot do: send the *same* request to both stacks and read the two responses side by side. A test
asserting that both return `400` proves less than seeing that both say the same thing.

Environment: Windows 11, Node 22.21.0, Python 3.12, both stacks running from
`feature/week-02-backend-multistack` against their own SQLite databases, seeded and then used
manually — so the two databases hold a different number of rows and assign different ids. Ids below
are therefore *not* expected to match; everything else is.

Requests correspond to [`http/items.http`](../http/items.http) and
[`http/errors.http`](../http/errors.http).

## 1 — `GET /items`

Both stacks, first two entries:

```json
// NestJS :3000                              // Django :8000
[                                            [
  {                                            {
    "id": 1,                                     "id": 1,
    "name": "Mechanical Keyboard",               "name": "Mechanical Keyboard",
    "sku": "KBD-87-BLK",                         "sku": "KBD-87-BLK",
    "quantity": 12,                              "quantity": 12,
    "price": 249.99,                             "price": 249.99,
    "createdAt": "2026-08-02T18:33:49.651Z"      "createdAt": "2026-08-02T19:08:56.548785Z"
  },                                           },
  ...                                          ...
]                                            ]
```

Field names, order, types and values all agree. A bare array in both — no envelope, no pagination.
Ordered by `id` ascending in both.

The one visible difference is fractional-second precision: Node emits milliseconds, Django
microseconds. The contract anticipated this and declines to pin it down further, because both are
valid ISO-8601 UTC instants and forcing agreement would buy nothing.

## 2 — `POST /items`

```
$ curl -i -X POST $BASE/items -H "Content-Type: application/json" \
    -d '{"name":"Standing Desk","sku":"DESK-STD-1","quantity":4,"price":649.00}'
```

**NestJS**

```
HTTP/1.1 201 Created
Location: /items/6
Content-Type: application/json; charset=utf-8

{"id":6,"name":"Standing Desk","sku":"DESK-STD-1","quantity":4,"price":649,"createdAt":"2026-08-12T17:39:47.041Z"}
```

**Django**

```
HTTP/1.1 201 Created
Location: /items/7
Content-Type: application/json

{"id":7,"name":"Standing Desk","sku":"DESK-STD-1","quantity":4,"price":649.0,"createdAt":"2026-08-12T17:39:47.881351Z"}
```

Same status, same `Location` shape, same body shape. `price` is a JSON **number** in both, which is
the contract's most easily broken rule — Prisma returns a `Decimal` object and DRF stringifies
decimals, so both stacks had to be told explicitly not to send `"649"`.

**And here is a difference worth having found: `649` versus `649.0`.** Both are the same JSON number
and parse identically, but the bytes differ, because JavaScript has one numeric type that prints
without a trailing `.0` while Python distinguishes `int` from `float`. Confirmed by parsing each
stack's whole list in Python: Node's prices come back as `['float', 'int']`, Django's as `['float']`.

Nothing can be done about it short of sending `price` as a string, which the contract rejects
outright. A client typing `price` as a number is unaffected; a client inspecting the runtime type
would see a difference. Now recorded in the contract's divergences section rather than left to
surprise someone.

### The other two create cases

| Request | NestJS | Django |
|---|---|---|
| `name` sent as `"   Laptop Stand   "` | `"name":"Laptop Stand"` | `"name":"Laptop Stand"` |
| Body includes `"id":99,"hacked":true` | `"id":8`, no `hacked` | `"id":9`, no `hacked` |

Trimming happens before validation and before storage in both. Unknown fields are ignored rather
than rejected in both, so a client-supplied `id` cannot override the server-assigned one — Nest via
`ValidationPipe({ whitelist: true })`, Django because that is DRF's default.

## 3 — `409` duplicate SKU

Re-sending the `DESK-STD-1` request:

**NestJS**

```
HTTP/1.1 409 Conflict
Content-Type: application/problem+json; charset=utf-8

{"type":"https://items-api.local/problems/duplicate-sku","title":"SKU already exists","status":409,
 "detail":"An item with sku 'DESK-STD-1' already exists.","instance":"/items"}
```

**Django**

```
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{"type": "https://items-api.local/problems/duplicate-sku", "title": "SKU already exists", "status": 409,
 "detail": "An item with sku 'DESK-STD-1' already exists.", "instance": "/items"}
```

Byte-for-byte identical apart from whitespace — Python's `json.dumps` puts a space after each colon,
`JSON.stringify` does not. Same `type`, same `title`, same `detail` wording.

Both decided this at the database rather than with a pre-flight `SELECT`, which is why the message
can name the SKU with confidence: a check-then-insert would still lose the race against a concurrent
insert.

## 4 — `400` validation

```
$ curl -X POST $BASE/items -H "Content-Type: application/json" -d '{}'
```

**Identical on both stacks**, including every message string:

```json
{
  "type": "https://items-api.local/problems/validation-error",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/items",
  "errors": {
    "name": ["This field is required."],
    "sku": ["This field is required."],
    "quantity": ["This field is required."],
    "price": ["This field is required."]
  }
}
```

This one is better than the contract promised. The contract guarantees only the `errors` *keys* and
warns that the message *strings* are each framework's own — but because both DTO layers were given
the same wording deliberately, the required-field case comes out identical. Getting
`class-validator` and a DRF serializer to agree on this envelope at all is the most instructive part
of Week 2.

## 5 — `404`, and where the two stacks reason differently

| Request | NestJS | Django |
|---|---|---|
| `GET /items/999999` | `404` — *"No item exists with id 999999."* | `404` — *"No item exists with id 999999."* |
| `GET /items/abc` | `404` — *"No item exists with id 'abc'."* | `404` — *"No route matches GET /items/abc."* |
| `GET /not-a-route` | `404` — *"Cannot GET /not-a-route"* | `404` — *"No route matches GET /not-a-route."* |

All six are `404` with `type: .../problems/not-found`, which is what the contract requires. The
`detail` strings differ, which it permits — `detail` is explicitly a human-readable explanation of
*this* occurrence.

The middle row is the interesting one, and it shows the two frameworks disagreeing about **where
routing ends and validation begins**. Django's `<int:pk>` converter simply does not match `abc`, so
the request falls through to the catch-all and is reported as an unmatched *route*. Nest's route
*does* match — `:id` matches anything — so the controller parses by hand and reports a missing
*item*. Same status, same problem type, two different explanations of why, both accurate from inside
their own framework.

Nest needs that hand-written parse precisely because `ParseIntPipe` would answer `400`, and the
contract says `404`.

## 6 — A method the contract does not define

```
$ curl -X DELETE $BASE/items/1
```

| | Status | Body |
|---|---|---|
| NestJS | `404` | `type: .../problems/not-found`, *"Cannot DELETE /items/1"* |
| Django | `405` | `type: about:blank`, *"Method \"DELETE\" not allowed."* |

**A genuine divergence, and this run is what found it.** Nest has no `DELETE` handler, so its router
never matches and answers not-found. Django's URL pattern *does* match and the view rejects the
method.

Both are `problem+json`; neither contradicts the contract, which lists `DELETE` as out of scope and
so specifies no response for it. Unifying them would mean adding handlers for three verbs the API
does not have, purely to make their rejection identical — more surface, not less. So it is now
documented in the contract's divergences section, and both suites assert the *shape* of these
responses rather than the status.

Worth stating plainly: this is a hole the automated suites did not catch, because each stack's suite
asserted its own behaviour and nothing compared the two. Sending the same request to both is exactly
the check that a per-stack test suite structurally cannot perform.

## 7 — Automated

```
api-node    $ npm test          →  7 passed   (unit: the response mapper)
api-node    $ npm run test:e2e  →  35 passed  (HTTP, against its own test.db)
api-python  $ python manage.py test → 30 passed
```

72 tests. The Django suite found a real bug during M4: `perform_create` caught `IntegrityError`
without wrapping the insert in an atomic block, which leaves the surrounding transaction unusable —
invisible under autocommit-per-request, fatal with `ATOMIC_REQUESTS = True`. Fixed with a savepoint;
see [challenges.md](challenges.md).

### Database isolation was verified, not assumed

The e2e suite truncates the items table between tests, so pointing it at `dev.db` would destroy the
seed data on the first run. After a full suite run:

```
dev.db:  5 items — KBD-87-BLK, DOCK-13P, HDST-PRO-2, MON-27-4K, CAM-1080
test.db: 0 items
```

`test.db` is a separate file, created by running the real migrations, and git-ignored.

## Not verified

- **Concurrency.** The duplicate-SKU handling is written to be correct under a race — uniqueness is
  decided by the database, not by a pre-flight `SELECT` — but no concurrent load was ever applied
  to demonstrate it. The reasoning is sound; the evidence is absent.
- **Anything beyond SQLite.** The contract's `DECIMAL(10,2)` behaves differently on other engines,
  and `price` precision is the rule most likely to move. Neither stack has run against PostgreSQL or
  SQL Server.
- **Performance.** No load testing, no query profiling, no `N+1` check — trivially absent on a
  single-table API with no relations, and therefore also untested.
- **`GET /items` with a large collection.** The largest list exercised here is eight rows. There is
  no pagination, which is fine at this size and would not be at ten thousand.
