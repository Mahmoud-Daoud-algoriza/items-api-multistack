from django.contrib import admin

from .models import Item


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    """
    Not part of the contract — three lines that turn the app Django already installed into a
    working data browser. There is no equivalent in the Node stack without adding a tool.
    """

    list_display = ['id', 'sku', 'name', 'quantity', 'price', 'created_at']
    search_fields = ['sku', 'name']
