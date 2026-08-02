from decimal import Decimal

from rest_framework import serializers

from .models import Item

SKU_PATTERN = r'^[A-Z0-9-]{3,20}$'


class ItemSerializer(serializers.ModelSerializer):
    """
    The write rules and the wire shape of an item.

    Every client-supplied field is declared explicitly rather than inferred from the model.
    That is more typing than `fields = '__all__'`, but it puts the API's rules where they can
    be read, and it stops a future model change from silently altering the contract.
    """

    # The model column is `created_at`; the contract says `createdAt`.
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    # CharField trims surrounding whitespace before validating, which is exactly the
    # "trimmed, then length-checked" rule in the contract.
    name = serializers.CharField(min_length=2, max_length=100)

    # Declaring `sku` here also removes the UniqueValidator that ModelSerializer would have
    # generated from the model's `unique=True`. That validator issues its own SELECT and
    # answers 400; the contract says a duplicate SKU is a 409, and letting the database decide
    # is the only check that cannot lose a race against a concurrent insert.
    sku = serializers.RegexField(
        SKU_PATTERN,
        error_messages={
            'invalid': 'Must be 3 to 20 characters using only A-Z, 0-9 and hyphens.',
        },
    )

    quantity = serializers.IntegerField(min_value=0)

    price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('0.01'),
    )

    class Meta:
        model = Item
        fields = ['id', 'name', 'sku', 'quantity', 'price', 'createdAt']
        read_only_fields = ['id']
