from django.db import IntegrityError, transaction
from rest_framework import generics
from rest_framework.exceptions import APIException, NotFound

from .models import Item
from .serializers import ItemSerializer


class DuplicateSku(APIException):
    """Raised when the database rejects an insert because the SKU is already taken."""

    status_code = 409


class ItemListCreateView(generics.ListCreateAPIView):
    """`GET /items` and `POST /items`."""

    queryset = Item.objects.all()
    serializer_class = ItemSerializer

    def perform_create(self, serializer):
        try:
            # The atomic block is not decoration, and leaving it out is a bug the test suite
            # caught. Django marks a transaction as unusable as soon as a database error occurs
            # inside it, so catching IntegrityError without a savepoint to roll back to leaves
            # every subsequent query in the same transaction raising TransactionManagementError.
            #
            # Under the default autocommit-per-request that is invisible: the failed statement is
            # rolled back on its own and the next request gets a clean connection. It becomes
            # fatal the moment an outer transaction exists — ATOMIC_REQUESTS = True, a service
            # method wrapping several writes, or a TestCase, which is where it surfaced. A
            # duplicate SKU would poison the rest of the request and turn a clean 409 into a 500.
            #
            # `with transaction.atomic()` creates a savepoint, so the rollback is scoped to this
            # insert and the surrounding transaction stays healthy. This is Django's documented
            # rule: do not catch IntegrityError outside an atomic block.
            with transaction.atomic():
                serializer.save()
        except IntegrityError as error:
            # The serializer's UniqueValidator was removed on purpose, so uniqueness is
            # decided by the database and reported here as the contract's 409.
            raise DuplicateSku(
                f"An item with sku '{serializer.validated_data['sku']}' already exists."
            ) from error

    def get_success_headers(self, data):
        return {'Location': f'/items/{data["id"]}'}


class ItemDetailView(generics.RetrieveAPIView):
    """`GET /items/{id}`."""

    queryset = Item.objects.all()
    serializer_class = ItemSerializer

    def get_object(self):
        # DRF's default would answer "No Item matches the given query." Overriding it costs
        # four lines and makes both stacks say the same thing for the same failure.
        try:
            return self.get_queryset().get(pk=self.kwargs['pk'])
        except Item.DoesNotExist as error:
            raise NotFound(f'No item exists with id {self.kwargs["pk"]}.') from error
