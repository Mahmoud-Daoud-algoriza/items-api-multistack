"""
Contract tests for the Items API.

These assert the contract, not the implementation. Every assertion traces to a line in
docs/api-contract.md, and the NestJS e2e suite asserts the same things — which is the payoff for
having frozen the contract before either stack was written. If one suite passes and the other
fails, the contract has been broken rather than a refactor merely having gone wrong.

Django creates and destroys a dedicated test database automatically, so unlike the Node suite there
is no setup here to keep the tests away from `db.sqlite3`.
"""

from django.test import TestCase
from rest_framework.test import APITestCase

from config.problem_details import to_error_map

PROBLEM_CONTENT_TYPE = 'application/problem+json'
PROBLEM_BASE = 'https://items-api.local/problems'

VALID_ITEM = {
    'name': 'Mechanical Keyboard',
    'sku': 'KBD-87-BLK',
    'quantity': 12,
    'price': 249.99,
}


class ItemsApiTestCase(APITestCase):
    """Shared helpers. Holds no tests of its own."""

    def post_item(self, **overrides):
        return self.client.post('/items', {**VALID_ITEM, **overrides}, format='json')

    def assertProblem(self, response, status, kind, instance):
        """Assert the RFC 9457 envelope every error in this API shares."""
        self.assertEqual(response.status_code, status)
        self.assertIn(PROBLEM_CONTENT_TYPE, response['Content-Type'])

        body = response.json()
        self.assertEqual(body['type'], f'{PROBLEM_BASE}/{kind}')
        self.assertEqual(body['status'], status)
        self.assertEqual(body['instance'], instance)
        self.assertIn('title', body)
        self.assertIn('detail', body)
        return body


class ListItemsTests(ItemsApiTestCase):
    def test_empty_collection_is_200_with_an_empty_array(self):
        response = self.client.get('/items')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_returns_items_ordered_by_id_ascending(self):
        for sku in ('AAA-1', 'BBB-2', 'CCC-3'):
            self.post_item(sku=sku)

        body = self.client.get('/items').json()

        self.assertEqual([item['sku'] for item in body], ['AAA-1', 'BBB-2', 'CCC-3'])
        ids = [item['id'] for item in body]
        self.assertEqual(ids, sorted(ids))

    def test_returns_a_bare_array_with_no_envelope(self):
        self.post_item()

        self.assertIsInstance(self.client.get('/items').json(), list)


class ItemShapeTests(ItemsApiTestCase):
    def test_price_is_a_json_number_not_a_string(self):
        # DRF serialises DecimalField as a *string* by default, to protect precision through
        # JavaScript's float. The contract says JSON number, so COERCE_DECIMAL_TO_STRING is
        # switched off deliberately — and this is the assertion that keeps it deliberate.
        body = self.post_item(price=189.50).json()

        self.assertIsInstance(body['price'], float)
        self.assertEqual(body['price'], 189.50)

    def test_preserves_two_decimal_places_of_precision(self):
        self.assertEqual(self.post_item(price=1234.56).json()['price'], 1234.56)

    def test_created_at_is_an_iso_8601_utc_instant_ending_in_z(self):
        created_at = self.post_item().json()['createdAt']

        self.assertRegex(created_at, r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$')

    def test_id_and_created_at_are_assigned_by_the_server(self):
        body = self.post_item().json()

        self.assertIsInstance(body['id'], int)
        self.assertGreater(body['id'], 0)
        self.assertIsNotNone(body['createdAt'])

    def test_response_carries_exactly_the_contract_fields(self):
        body = self.post_item().json()

        self.assertEqual(
            sorted(body.keys()),
            ['createdAt', 'id', 'name', 'price', 'quantity', 'sku'],
        )


class RetrieveItemTests(ItemsApiTestCase):
    def test_returns_the_item(self):
        created = self.post_item().json()

        response = self.client.get(f'/items/{created["id"]}')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), created)

    def test_missing_id_is_404_problem_json(self):
        body = self.assertProblem(
            self.client.get('/items/999999'),
            status=404,
            kind='not-found',
            instance='/items/999999',
        )

        self.assertEqual(body['title'], 'Item not found')

    def test_non_numeric_id_is_404_not_400(self):
        # The contract's reasoning: from the client's point of view `/items/abc` simply identifies
        # nothing. Django gets this free from its <int:pk> URL converter — the path matches no
        # route and falls through to the catch-all. Nest needs an explicit parse-and-throw, since
        # its ParseIntPipe would answer 400.
        self.assertProblem(
            self.client.get('/items/abc'),
            status=404,
            kind='not-found',
            instance='/items/abc',
        )

    def test_negative_id_is_404(self):
        self.assertProblem(
            self.client.get('/items/-1'),
            status=404,
            kind='not-found',
            instance='/items/-1',
        )

    def test_a_non_400_problem_has_no_errors_member(self):
        # The contract says `errors` is present on 400 only.
        self.assertNotIn('errors', self.client.get('/items/999999').json())


class CreateItemTests(ItemsApiTestCase):
    def test_returns_201_with_a_location_header_and_the_created_item(self):
        response = self.post_item()
        body = response.json()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response['Location'], f'/items/{body["id"]}')
        self.assertEqual(body['name'], VALID_ITEM['name'])
        self.assertEqual(body['sku'], VALID_ITEM['sku'])
        self.assertEqual(body['quantity'], VALID_ITEM['quantity'])

    def test_persists_the_item(self):
        created = self.post_item().json()

        body = self.client.get('/items').json()

        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]['id'], created['id'])

    def test_trims_name_before_validating_and_storing_it(self):
        # DRF's CharField trims whitespace by default, which happens to be exactly the contract's
        # "trimmed, then length-checked" rule.
        body = self.post_item(name='  Mechanical Keyboard  ').json()

        self.assertEqual(body['name'], 'Mechanical Keyboard')

    def test_unknown_fields_are_ignored_not_rejected(self):
        # The contract's explicit choice, and the reason a client-supplied id cannot override the
        # server-assigned one. `id` is read-only on the serializer; `hacked` matches no field.
        response = self.client.post(
            '/items',
            {**VALID_ITEM, 'id': 99, 'hacked': True},
            format='json',
        )
        body = response.json()

        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(body['id'], 99)
        self.assertNotIn('hacked', body)

    def test_accepts_a_quantity_of_zero(self):
        # The contract allows 0, and it is the value most likely to be lost to a falsy check.
        response = self.post_item(quantity=0)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['quantity'], 0)


class CreateItemValidationTests(ItemsApiTestCase):
    def test_missing_body_reports_every_field(self):
        response = self.client.post('/items', {}, format='json')
        body = self.assertProblem(
            response, status=400, kind='validation-error', instance='/items'
        )

        self.assertEqual(body['title'], 'Validation failed')
        # The keys are contractual; the message strings are each framework's own.
        self.assertEqual(sorted(body['errors'].keys()), ['name', 'price', 'quantity', 'sku'])

    def test_errors_map_values_are_lists_of_strings(self):
        errors = self.post_item(sku='lower-case').json()['errors']

        self.assertIn('sku', errors)
        self.assertIsInstance(errors['sku'], list)
        self.assertTrue(all(isinstance(message, str) for message in errors['sku']))

    def test_rejects_invalid_field_values(self):
        cases = {
            'name shorter than 2 characters after trimming': {'name': '  a  '},
            'name longer than 100 characters': {'name': 'x' * 101},
            'lowercase sku': {'sku': 'kbd-87-blk'},
            'sku shorter than 3 characters': {'sku': 'AB'},
            'sku longer than 20 characters': {'sku': 'A' * 21},
            'sku with disallowed characters': {'sku': 'KBD_87'},
            'fractional quantity': {'quantity': 1.5},
            'negative quantity': {'quantity': -1},
            'zero price': {'price': 0},
            'negative price': {'price': -1},
            'price with three decimal places': {'price': 1.005},
            'price beyond DECIMAL(10,2)': {'price': 100000000},
        }

        for description, override in cases.items():
            with self.subTest(case=description):
                response = self.post_item(**override)

                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.json()['type'], f'{PROBLEM_BASE}/validation-error'
                )


class DuplicateSkuTests(ItemsApiTestCase):
    def test_duplicate_sku_is_409_problem_json(self):
        self.post_item()

        body = self.assertProblem(
            self.post_item(name='A Different Name'),
            status=409,
            kind='duplicate-sku',
            instance='/items',
        )

        self.assertEqual(body['title'], 'SKU already exists')
        self.assertIn(VALID_ITEM['sku'], body['detail'])

    def test_duplicate_sku_does_not_create_a_second_row(self):
        # This is also the regression guard for the savepoint in `perform_create`.
        #
        # Before that fix, the rejected insert left the surrounding transaction unusable, and this
        # GET — the next query in the same transaction — failed with TransactionManagementError and
        # came back as a 500 problem document instead of the list. The assertion caught it as
        # `5 != 1`, five being the number of members in an RFC 9457 body.
        #
        # So a query *after* the duplicate is the whole point of this test, not incidental setup.
        self.post_item()
        self.post_item()

        self.assertEqual(len(self.client.get('/items').json()), 1)


class OutsideTheContractTests(ItemsApiTestCase):
    def test_unmatched_path_is_problem_json(self):
        # The catch-all URL pattern, which exists because Django bypasses `handler404` while
        # DEBUG is on — and an API whose error shape depends on a debug flag has two contracts.
        self.assertProblem(
            self.client.get('/not-a-route'),
            status=404,
            kind='not-found',
            instance='/not-a-route',
        )

    def test_unsupported_method_is_problem_json(self):
        # DELETE is deliberately out of scope. What matters is that it fails inside the contract's
        # error shape rather than as a framework default. 405 is outside the problem catalogue, so
        # RFC 9457 allows the `about:blank` type.
        response = self.client.delete('/items/1')

        self.assertIn(PROBLEM_CONTENT_TYPE, response['Content-Type'])
        body = response.json()
        self.assertEqual(body['type'], 'about:blank')
        for member in ('title', 'status', 'detail', 'instance'):
            self.assertIn(member, body)


class ErrorMapTests(TestCase):
    """
    Unit tests for the one piece of error translation that the HTTP tests cannot reach.

    DRF keys errors belonging to no single field under `non_field_errors`. The contract asks for
    camelCase keys, so that one is renamed — and nothing in this API's validation currently
    produces a non-field error, which is exactly why it needs a direct test.
    """

    def test_renames_non_field_errors_to_camel_case(self):
        self.assertEqual(
            to_error_map({'non_field_errors': ['That combination is not allowed.']}),
            {'nonFieldErrors': ['That combination is not allowed.']},
        )

    def test_leaves_field_keys_untouched(self):
        self.assertEqual(
            to_error_map({'sku': ['Must be 3 to 20 characters.']}),
            {'sku': ['Must be 3 to 20 characters.']},
        )

    def test_wraps_a_bare_message_in_a_list(self):
        self.assertEqual(to_error_map({'sku': 'Single message.'}), {'sku': ['Single message.']})

    def test_wraps_a_non_dict_payload_under_non_field_errors(self):
        self.assertEqual(
            to_error_map(['Something was wrong.']),
            {'nonFieldErrors': ['Something was wrong.']},
        )

    def test_coerces_messages_to_strings(self):
        # DRF wraps messages in ErrorDetail, a str subclass. Anything else must still serialise.
        self.assertEqual(to_error_map({'quantity': [42]}), {'quantity': ['42']})
