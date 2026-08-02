# Items API — Django REST Framework

The Python implementation of [the shared contract](../docs/api-contract.md). Django 6 with
Django REST Framework over SQLite.

## Prerequisites

- Python 3.12+ (developed on 3.12.10)

## Run it

```bash
cd api-python
python -m venv .venv
.venv\Scripts\activate            # Windows;  source .venv/bin/activate elsewhere
pip install -r requirements.txt
python manage.py migrate          # creates db.sqlite3 and applies migrations
python manage.py seed_items       # optional — three sample items
python manage.py runserver 8000   # http://127.0.0.1:8000
```

On Windows, prefer `127.0.0.1` over `localhost`: `runserver` binds IPv4 only, and some clients
resolve `localhost` to `::1` first and report a connection refusal.

Quick check:

```bash
curl http://127.0.0.1:8000/items

curl -X POST http://127.0.0.1:8000/items \
  -H "Content-Type: application/json" \
  -d '{"name":"4K Monitor","sku":"MON-27-4K","quantity":3,"price":499.95}'
```

Ready-made requests covering every case in the contract live in [../http/](../http/).

## Commands

| Command | Purpose |
|---|---|
| `python manage.py runserver 8000` | Development server (auto-reloads) |
| `python manage.py makemigrations` | Generate a migration from model changes |
| `python manage.py migrate` | Apply migrations |
| `python manage.py seed_items` | Upsert the sample items by SKU (safe to re-run) |
| `python manage.py test` | Run the test suite |
| `python manage.py createsuperuser` | Optional — unlocks the admin at `/admin/` |

## Layout

```
config/
  settings.py            Django defaults + INSTALLED_APPS, secret/debug, REST_FRAMEWORK
  urls.py                routes, plus the catch-all that keeps 404s in problem+json
  problem_details.py     RFC 9457 shape, the DRF exception handler, the error views
items/
  models.py              the Item model
  serializers.py         validation rules and the wire shape
  views.py               ListCreate and Retrieve generics
  urls.py                /items and /items/<int:pk>
  admin.py               registers Item in the Django admin
  migrations/            checked in; the database is rebuilt from these
  management/commands/   seed_items
```

The request path is the ordinary DRF one: a generic view resolves the queryset, the serializer
validates and renders, and anything raised on the way out reaches
`problem_details_exception_handler`, which re-renders it as `application/problem+json`.

## Decisions worth knowing

- **The serializer's `UniqueValidator` is deliberately removed.** `ModelSerializer` generates
  one from the model's `unique=True`, and it answers **400** — but the contract says a
  duplicate SKU is a **409**. Declaring `sku` explicitly on the serializer suppresses it, so
  the database decides uniqueness and `perform_create` translates the `IntegrityError`. It is
  also the only check that cannot lose a race against a concurrent insert.
- **`COERCE_DECIMAL_TO_STRING = False`.** DRF serialises `DecimalField` as a *string* by
  default, to protect precision through JavaScript's float. The contract says `price` is a
  JSON number, so the default is turned off on purpose rather than by oversight.
- **Errors are plain `JsonResponse`s, not DRF `Response`s.** A problem document is not a
  negotiable representation of the requested resource, so it should not travel through content
  negotiation and inherit whatever renderer the client asked for.
- **404s use a catch-all URL pattern, not `handler404`.** Django bypasses `handler404` while
  `DEBUG = True`, and an API whose error shape depends on a debug flag has two contracts.
- **Routes are declared without trailing slashes.** Django's convention is `items/`; the
  contract says `/items`, and the contract wins.
- **`get_object` is overridden** only so a missing item reads "No item exists with id 9999."
  instead of DRF's "No Item matches the given query.", matching the Node stack word for word.

## What `startproject` brought along

`migrate` applies 19 migrations and creates roughly a dozen tables — admin log, auth users,
groups, permissions, content types, sessions — for an API with exactly one model. None of it
is removed here: the session/auth/admin stack is what Django actually gives you, and pruning
it is a deployment decision rather than part of this exercise. It is, however, the single most
visible difference against the Node stack, where the same feature set produced one table.

The trade is not one-sided. `admin.py` is three lines and yields a working data browser with
search, which the Node stack cannot match without adding a tool.
