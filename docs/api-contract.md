# Items API — shared contract

**Status: frozen.** Both stacks implement this document exactly. It is written once, before
either implementation starts, so that every difference that shows up later in
[stack-comparison.md](stack-comparison.md) is a *framework* difference rather than a design
difference. If a framework makes something here genuinely awkward, the contract changes and
**both** implementations follow — the contract is never forked.

## Base URLs

| Stack | Base URL | Chosen because |
|---|---|---|
| Node.js — NestJS | `http://localhost:3000` | Nest's default port |
| Python — Django REST Framework | `http://localhost:8000` | `runserver`'s default port |

Different defaults are deliberate: both APIs can run at the same time, so the same request
file can be pointed at either one.

Paths are rooted at `/items` — not `/api/items` — because the Week 2 brief names the
endpoints `GET /items` and `POST /items` literally.

## Media types

| Direction | Type |
|---|---|
| Request bodies | `application/json` |
| Success responses | `application/json` |
| Error responses | `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) |

## Resource — `Item`

```json
{
  "id": 1,
  "name": "Mechanical Keyboard",
  "sku": "KBD-87-BLK",
  "quantity": 12,
  "price": 249.99,
  "createdAt": "2026-08-02T18:30:00Z"
}
```

| Field | JSON type | Origin | Rules |
|---|---|---|---|
| `id` | integer | server-assigned | Auto-increment, starts at 1. Rejected if supplied by the client (silently ignored, see *Unknown fields*). |
| `name` | string | client | **Required.** Trimmed before validation. Length 2–100 after trimming. |
| `sku` | string | client | **Required.** Must match `^[A-Z0-9-]{3,20}$`. Unique across all items. |
| `quantity` | integer | client | **Required.** `>= 0`. Must be a whole number — `1.5` is invalid. |
| `price` | number | client | **Required.** `> 0`. At most 2 decimal places, at most 10 total digits. |
| `createdAt` | string | server-assigned | ISO-8601 UTC instant with a `Z` offset. |

Two notes that shape the implementations:

- **`price` is a JSON number, not a string.** It is stored as fixed-point decimal in both
  databases (`DECIMAL(10,2)`) and converted at the serialization boundary. Neither stack
  does this by default — Prisma hands back a `Decimal` object, and DRF stringifies decimals
  unless told otherwise — so both need an explicit, deliberate one-line decision. Money is
  the classic place where "the default was fine" turns out to be false.
- **Fractional-second precision on `createdAt` is stack-dependent** (Node emits
  milliseconds, Django emits microseconds when present). Both are valid ISO-8601 UTC
  instants. Pinning this down further would buy nothing.

### Unknown fields

Unknown properties in a request body are **ignored, not rejected**. Sending
`{"name": "...", "sku": "...", "quantity": 1, "price": 1.0, "id": 99, "hacked": true}`
succeeds; `id` and `hacked` are discarded and the server assigns its own `id`.

This is DRF's default behaviour and is reachable in Nest with `ValidationPipe({ whitelist: true })`,
so both stacks land here without fighting their framework. The stricter alternative
(`forbidNonWhitelisted` → `400`) is a defensible choice for a real API and is out of scope here.

## Endpoints

### `GET /items`

Returns every item as a bare JSON array — no envelope, no pagination, no filtering. Ordered
by `id` ascending so responses are deterministic across runs and stacks.

```
200 OK
[ { ...item }, { ...item } ]
```

An empty collection is `200` with `[]`, never `404`.

### `GET /items/{id}`

```
200 OK    { ...item }
404       problem+json — no item with that id
```

`{id}` is a positive integer. A non-numeric or negative `{id}` also returns **`404`**, not
`400`: from the client's point of view `/items/abc` simply identifies nothing. Django gets
this free from its `<int:pk>` URL converter; Nest needs an explicit parse-and-throw, since
its `ParseIntPipe` would otherwise answer `400`.

### `POST /items`

```
201 Created
Location: /items/{id}
{ ...item }

400   problem+json — one or more fields failed validation
409   problem+json — an item with that sku already exists
```

The `Location` header is a relative path. The response body is the full created item,
including the server-assigned `id` and `createdAt`.

## Error responses

Every error — in both stacks, at every status — is `application/problem+json` with this
shape:

```json
{
  "type": "https://items-api.local/problems/validation-error",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/items",
  "errors": {
    "name": ["This field is required."],
    "price": ["Ensure this value is greater than 0."]
  }
}
```

| Member | Notes |
|---|---|
| `type` | Stable URI identifying the problem *kind*. Not dereferenced; `items-api.local` is a documentation host, not a real one. |
| `title` | Short, human-readable, constant per `type`. |
| `status` | Matches the HTTP status code. |
| `detail` | Human-readable explanation of *this* occurrence. |
| `instance` | Request path that produced the error. |
| `errors` | **Only present on `400`.** Map of camelCase field name → array of messages. |

### Catalogue

| Status | `type` suffix | `title` |
|---|---|---|
| `400` | `/problems/validation-error` | `Validation failed` |
| `404` | `/problems/not-found` | `Item not found` |
| `409` | `/problems/duplicate-sku` | `SKU already exists` |
| `500` | `/problems/internal-error` | `Internal server error` |

`500` responses never leak an exception message or stack trace into `detail`; the real error
goes to the server log.

### On message wording

The `errors` **keys** are contractual — always the camelCase field name. The message
**strings** are not: each framework generates its own wording, and forcing them to match
character-for-character would mean discarding both frameworks' validators to hand-write
messages. That trade is not worth it for this exercise. Clients key off `type`, `status`,
and the `errors` keys; the strings are for humans.

Getting two very different validation pipelines to agree on this envelope at all is the most
instructive part of Week 2 — it forces you into Nest's `ValidationPipe` + exception filter
and DRF's `EXCEPTION_HANDLER`, which is where each framework's real error model lives.

## Deliberately out of scope

Authentication · pagination, filtering, sorting · `PUT`/`PATCH`/`DELETE` · caching, ETags,
optimistic concurrency · OpenAPI generation · rate limiting · CORS · containerisation.

None of it appears in the Week 2 brief, and every item on that list would make the two
implementations harder to compare rather than easier.

### Two divergences this leaves, both found by testing

Out of scope means unspecified, and unspecified means the two stacks are free to differ. They do,
in exactly two places. Recorded here rather than left to be discovered, because "one contract, two
implementations" is the claim this repository makes and an unstated hole weakens it.

**An out-of-scope method answers differently.** `DELETE /items/1` returns `404`
(`/problems/not-found`) from Nest and `405` (`about:blank`) from Django. Nest has no `DELETE`
handler at all, so its router never matches and answers not-found; Django's URL pattern matches and
the view rejects the method. Both are `problem+json`, both are defensible, and neither contradicts
anything written above. Unifying them would mean adding handlers for three verbs the API does not
have, purely to make their rejection identical — which is more surface, not less. The test suites
therefore assert the *shape* of these responses and deliberately not the status.

**A whole-number `price` serialises differently.** `649.00` comes back as `649` from Node and
`649.0` from Django. These are the same JSON number — JSON has one numeric type and both parse
identically — but the bytes differ, because JavaScript has a single `number` type that prints
without a trailing `.0` while Python distinguishes `int` from `float`. Nothing can be done about
this short of sending `price` as a string, which the contract explicitly rejects. A client typing
`price` as a number is unaffected; a client that inspects the *runtime type* would see `int` from
Node for whole prices and `float` from Django. Worth knowing before writing an assertion about it.
