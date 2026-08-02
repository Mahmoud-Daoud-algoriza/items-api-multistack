from decimal import Decimal

from django.core.management.base import BaseCommand

from items.models import Item

# The same three items the Node stack seeds, so both databases start identical.
SEED_ITEMS = [
    {'name': 'Mechanical Keyboard', 'sku': 'KBD-87-BLK', 'quantity': 12, 'price': Decimal('249.99')},
    {'name': 'USB-C Docking Station', 'sku': 'DOCK-13P', 'quantity': 5, 'price': Decimal('189.50')},
    {'name': 'Noise Cancelling Headset', 'sku': 'HDST-PRO-2', 'quantity': 0, 'price': Decimal('320.00')},
]


class Command(BaseCommand):
    help = 'Insert or update the sample items.'

    def handle(self, *args, **options):
        # update_or_create keyed on sku, so re-running the seed is a no-op rather than a
        # unique-constraint error. A fixture with hard-coded primary keys would fight the
        # auto-increment sequence instead.
        for item in SEED_ITEMS:
            Item.objects.update_or_create(
                sku=item['sku'],
                defaults={k: v for k, v in item.items() if k != 'sku'},
            )

        self.stdout.write(self.style.SUCCESS(f'Seeded {len(SEED_ITEMS)} items.'))
