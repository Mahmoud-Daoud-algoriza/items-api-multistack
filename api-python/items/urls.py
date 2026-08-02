from django.urls import path

from .views import ItemDetailView, ItemListCreateView

# Declared without trailing slashes. Django's convention is `items/`, but the contract's paths
# are `/items` and `/items/{id}`, and the contract wins over the framework's habits.
urlpatterns = [
    path('items', ItemListCreateView.as_view(), name='item-list'),
    path('items/<int:pk>', ItemDetailView.as_view(), name='item-detail'),
]
