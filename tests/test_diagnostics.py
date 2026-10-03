import asyncio
import json
import unittest
from datetime import datetime
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app import diagnostics
from app.api import account, endpoints
from app.api.diagnostics import router
from app.main import diagnostic_http_error, diagnostic_validation_error


class DiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        with diagnostics._lock:
            diagnostics._events.clear()
            diagnostics._sequence = 0
        account.account_cache = None
        endpoints.market_cache.clear()
        self.env = patch.dict('os.environ', {'MT5_BRIDGE_URL': ''})
        self.env.start()
        self.app = FastAPI()
        self.app.add_middleware(diagnostics.DiagnosticMiddleware)
        self.app.include_router(account.router, prefix='/api')
        self.app.include_router(router, prefix='/api')
        self.app.add_exception_handler(HTTPException, diagnostic_http_error)
        self.app.add_exception_handler(RequestValidationError, diagnostic_validation_error)

        @self.app.get('/api/failure')
        def failure():
            raise RuntimeError('secret-account-token-never-log')

    def tearDown(self):
        self.env.stop()
        account.account_cache = None
        endpoints.market_cache.clear()

    async def request(self, path, method='GET', payload=None):
        messages = []
        scope = dict(type='http', asgi={'version': '3.0'}, http_version='1.1',
                     method=method, path=path, raw_path=path.encode(),
                     query_string=b'token=secret-query-never-log', root_path='',
                     headers=[(b'content-type', b'application/json'), (b'authorization', b'secret-header-never-log')],
                     scheme='http', server=('test', 80), client=('127.0.0.1', 1000))
        sent = False
        async def receive():
            nonlocal sent
            if not sent:
                sent = True
                return dict(type='http.request', body=json.dumps(payload).encode() if payload is not None else b'', more_body=False)
            await asyncio.Event().wait()
        async def send(message):
            messages.append(message)
        await asyncio.wait_for(self.app(scope, receive, send), timeout=5)
        status = next(m['status'] for m in messages if m['type'] == 'http.response.start')
        body = b''.join(m.get('body', b'') for m in messages)
        return status, json.loads(body)

    async def test_account_failure_has_reason_and_request_id(self):
        status, _ = await self.request('/api/account')
        self.assertEqual(status, 503)
        event = diagnostics.snapshot()['events'][0]
        self.assertEqual(event['details']['path'], '/api/account')
        self.assertIn('EA v1.3', event['details']['reason'])
        self.assertTrue(event['details']['request_id'])

    async def test_validation_logs_field_without_sensitive_input(self):
        status, _ = await self.request('/api/mt5/account', 'POST', {'name': 'private-test-person', 'balance': 'private-invalid-balance'})
        self.assertEqual(status, 422)
        serialized = json.dumps(diagnostics.snapshot())
        for secret in ['private-test-person', 'private-invalid-balance', 'secret-query', 'secret-header']:
            self.assertNotIn(secret, serialized)
        self.assertIn('balance', serialized)

    async def test_diagnostics_poll_does_not_log_itself(self):
        status, body = await self.request('/api/diagnostics')
        self.assertEqual(status, 200)
        self.assertEqual(body['events'], [])
        self.assertEqual(diagnostics.snapshot()['events'], [])
        self.assertEqual(body['connection']['mode'], 'EA_PUSH')

    async def test_old_candle_is_distinguished_from_live_connection(self):
        endpoints.market_cache[('TEST', '5m')] = {'timestamp_received': datetime.utcnow().timestamp()-120}
        _, body = await self.request('/api/diagnostics')
        self.assertFalse(body['connection']['markets'][0]['fresh'])
        self.assertIsNone(body['connection']['account_age_seconds'])

    async def test_internal_exception_keeps_location_not_message(self):
        with self.assertRaises(RuntimeError):
            await self.request('/api/failure')
        data = diagnostics.snapshot()
        self.assertNotIn('secret-account-token', json.dumps(data))
        self.assertEqual(data['events'][0]['details']['error']['type'], 'RuntimeError')
        self.assertTrue(data['events'][0]['details']['error']['frames'])

    async def test_retention_bounded_and_newest_first(self):
        for i in range(1005):
            diagnostics.record('INFO', 'system', 'Test event')
        data = diagnostics.snapshot()
        self.assertEqual(len(data['events']), 1000)
        self.assertEqual(data['dropped'], 5)
        self.assertEqual(data['events'][0]['id'], 1005)

    async def test_python_mode_does_not_expose_bridge_url(self):
        with patch.dict('os.environ', {'MT5_BRIDGE_URL': 'http://private-user:secret-pass@bridge'}):
            _, data = await self.request('/api/diagnostics')
        self.assertEqual(data['connection']['mode'], 'PYTHON_BRIDGE')
        self.assertNotIn('secret-pass', json.dumps(data))


if __name__ == '__main__':
    unittest.main()
