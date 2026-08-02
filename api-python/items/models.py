from django.db import models


class Item(models.Model):
    """
    A single inventory item.

    The constraints here are the ones the *database* enforces: column types, the primary key,
    and the unique index on `sku` that the API surfaces as a 409. Request-level rules (the SKU
    pattern, the minimum name length, the price floor) live in the serializer — see
    docs/api-contract.md.
    """

    name = models.CharField(max_length=100)
    sku = models.CharField(max_length=20, unique=True)
    quantity = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Same table name as the Prisma model, so both stacks can be inspected the same way.
        db_table = 'items'
        # The contract's deterministic ordering, applied once at the model rather than
        # repeated in every queryset.
        ordering = ['id']

    def __str__(self):
        return f'{self.sku} — {self.name}'
