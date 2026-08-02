from django.contrib import admin
from django.urls import include, path, re_path

from .problem_details import not_found_view, server_error_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('items.urls')),
    # Terminal catch-all: anything that matched nothing above still leaves as problem+json.
    # `handler404` would be the conventional place for this, but Django bypasses it while
    # DEBUG is on, and an API whose error shape depends on a debug flag has two contracts.
    re_path(r'^.*$', not_found_view),
]

handler404 = not_found_view
handler500 = server_error_view
