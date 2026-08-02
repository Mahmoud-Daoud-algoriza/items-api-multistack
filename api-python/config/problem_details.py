"""
RFC 9457 "Problem Details for HTTP APIs" — the single error shape this API returns, defined
once in docs/api-contract.md and implemented identically by both stacks.

Error responses are built as plain `JsonResponse`s rather than DRF `Response`s on purpose.
A problem document is not a negotiable representation of the requested resource, so it should
not travel through content negotiation and pick up whatever renderer the client asked for;
building it directly is both simpler and impossible to get wrong.
"""

import logging

from django.http import JsonResponse
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)

PROBLEM_CONTENT_TYPE = 'application/problem+json'

PROBLEM_TYPE_BASE = 'https://items-api.local/problems'

CATALOGUE = {
    'validation-error': (400, 'Validation failed'),
    'not-found': (404, 'Item not found'),
    'duplicate-sku': (409, 'SKU already exists'),
    'internal-error': (500, 'Internal server error'),
}

KIND_BY_STATUS = {status: kind for kind, (status, _) in CATALOGUE.items()}

GENERIC_INTERNAL_DETAIL = 'An unexpected error occurred while processing the request.'


def problem_response(kind, detail, instance, errors=None):
    """Build a problem+json response for one of the catalogued problem kinds."""
    status, title = CATALOGUE[kind]
    body = {
        'type': f'{PROBLEM_TYPE_BASE}/{kind}',
        'title': title,
        'status': status,
        'detail': detail,
        'instance': instance,
    }

    if errors is not None:
        body['errors'] = errors

    return JsonResponse(body, status=status, content_type=PROBLEM_CONTENT_TYPE)


def generic_problem_response(status, detail, instance):
    """
    Fallback for statuses outside the catalogue — an unsupported method, say. RFC 9457 allows
    `about:blank` when no specific problem type applies.
    """
    body = {
        'type': 'about:blank',
        'title': 'Request failed',
        'status': status,
        'detail': detail,
        'instance': instance,
    }

    return JsonResponse(body, status=status, content_type=PROBLEM_CONTENT_TYPE)


def problem_details_exception_handler(exc, context):
    """
    DRF's `EXCEPTION_HANDLER`. Delegates to the default handler to classify the exception,
    then re-renders the result as a problem document.

    Returning a response when the default handler returns `None` is what keeps unanticipated
    exceptions inside the contract: without it DRF re-raises and Django answers with an HTML
    error page.
    """
    request = context['request']
    instance = request.path

    response = drf_exception_handler(exc, context)

    if response is None:
        logger.exception('Unhandled error on %s %s', request.method, instance, exc_info=exc)
        return problem_response('internal-error', GENERIC_INTERNAL_DETAIL, instance)

    kind = KIND_BY_STATUS.get(response.status_code)

    if kind == 'validation-error':
        return problem_response(
            kind,
            'One or more fields are invalid.',
            instance,
            errors=to_error_map(response.data),
        )

    if kind == 'internal-error':
        return problem_response(kind, GENERIC_INTERNAL_DETAIL, instance)

    if kind is not None:
        return problem_response(kind, to_detail(response.data), instance)

    return generic_problem_response(response.status_code, to_detail(response.data), instance)


def to_error_map(data):
    """
    Flattens DRF's validation payload into the contract's `{field: [message, ...]}` map.

    DRF keys errors that belong to no single field under `non_field_errors`; the contract asks
    for camelCase keys, so that one is renamed.
    """
    if not isinstance(data, dict):
        return {'nonFieldErrors': [str(message) for message in as_list(data)]}

    return {
        ('nonFieldErrors' if field == 'non_field_errors' else field): [
            str(message) for message in as_list(messages)
        ]
        for field, messages in data.items()
    }


def to_detail(data):
    """Pulls a human-readable sentence out of whatever the default handler produced."""
    if isinstance(data, dict) and 'detail' in data:
        return str(data['detail'])

    return str(data)


def as_list(value):
    return value if isinstance(value, (list, tuple)) else [value]


def not_found_view(request, exception=None):
    """
    Terminal URL pattern, so a request that matches no route still leaves as problem+json.

    A catch-all pattern is used rather than Django's `handler404` because `handler404` is
    bypassed while `DEBUG = True`, and an API whose error shape depends on a debug flag is an
    API with two contracts.
    """
    return problem_response(
        'not-found',
        f'No route matches {request.method} {request.path}.',
        request.path,
    )


def server_error_view(request):
    """Django's `handler500`, for failures raised outside a DRF view."""
    return problem_response('internal-error', GENERIC_INTERNAL_DETAIL, request.path)
