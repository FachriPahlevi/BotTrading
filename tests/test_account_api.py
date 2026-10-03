import io
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException, Response
from pydantic import ValidationError

from app.api import account


def sample(**changes):
    # Synthetic identity only; never copy terminal account data into fixtures.
    payload = dict(login="123456", name="Test User", company="Test Broker",
                   server="Test-Demo", currency="USC", trade_mode="DEMO",
                   leverage=100, balance=200.0, equity=190.0, profit=-10.0,
                   credit=0.0, margin=20.0, margin_free=170.0, margin_level=950.0,
                   positions_count=1, connected=True,
                   updated_at=datetime.now(timezone.utc))
    payload.update(changes)
    return account.TerminalAccount(**payload)


class AccountTests(unittest.TestCase):
    def setUp(self):
        account.account_cache = None
        self.env = patch.dict('os.environ', {'MT5_BRIDGE_URL': ''})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        account.account_cache = None

    def test_no_data_is_unavailable_not_zero(self):
        with self.assertRaises(HTTPException) as exc:
            account.get_account(Response())
        self.assertEqual(exc.exception.status_code, 503)

    def test_zero_balance_and_negative_profit_are_preserved(self):
        account.receive_account(sample(balance=0))
        response = Response()
        result = account.get_account(response)
        self.assertEqual(result.balance, 0)
        self.assertEqual(result.profit, -10)
        self.assertEqual(result.currency, 'USC')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_ingest_acknowledges_current_api_instance(self):
        result = account.receive_account(sample())
        self.assertEqual(result['status'], 'accepted')
        self.assertEqual(result['instance_id'], account.SESSION_ID)

    def test_stale_future_disconnected_invalidate_previous(self):
        for changes in [dict(updated_at=datetime.now(timezone.utc)-timedelta(seconds=61)),
                        dict(updated_at=datetime.now(timezone.utc)+timedelta(seconds=30)),
                        dict(connected=False)]:
            account.receive_account(sample())
            with self.assertRaises(HTTPException):
                account.receive_account(sample(**changes))
            self.assertIsNone(account.account_cache)

    def test_cache_expires_without_new_push(self):
        account.account_cache = sample(updated_at=datetime.now(timezone.utc)-timedelta(seconds=61))
        with self.assertRaises(HTTPException):
            account.get_account(Response())

    def test_invalid_values_and_naive_timestamp_rejected(self):
        for changes in [dict(balance=float('nan')), dict(equity=float('inf')),
                        dict(updated_at=datetime.now()), dict(positions_count=-1),
                        dict(trade_mode='PAPER'), dict(connected='true')]:
            with self.assertRaises(ValidationError):
                sample(**changes)

    def test_account_switch_replaces_whole_snapshot(self):
        account.receive_account(sample())
        account.receive_account(sample(login='654321', server='Test-Real', trade_mode='REAL', balance=42))
        result = account.get_account(Response())
        self.assertEqual((result.login, result.trade_mode, result.balance), ('654321', 'REAL', 42))

    def test_bridge_payload_validated_no_fallback_to_cache(self):
        account.receive_account(sample())
        with patch.dict('os.environ', {'MT5_BRIDGE_URL': 'http://bridge'}):
            with patch.object(account, 'urlopen', return_value=io.StringIO(sample().model_dump_json())):
                self.assertEqual(account.get_account(Response()).equity, 190)
            for content in ['{}', '{broken']:
                with patch.object(account, 'urlopen', return_value=io.StringIO(content)):
                    with self.assertRaises(HTTPException):
                        account.get_account(Response())
            with patch.object(account, 'urlopen', side_effect=TimeoutError):
                with self.assertRaises(HTTPException):
                    account.get_account(Response())


if __name__ == '__main__':
    unittest.main()
