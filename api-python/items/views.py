from django.db import IntegrityError
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
