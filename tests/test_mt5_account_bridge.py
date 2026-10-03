import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pandas  # Preload native dependencies before patch.dict restores sys.modules.
from fastapi import HTTPException


class BridgeAccountTests(unittest.TestCase):
    def setUp(self):
        self.mt5 = SimpleNamespace(**{f'TIMEFRAME_{tf}': i for i, tf in enumerate(['M1', 'M5', 'M15', 'H1', 'H4', 'D1'])},
                                   ACCOUNT_TRADE_MODE_DEMO=0, ACCOUNT_TRADE_MODE_CONTEST=1, ACCOUNT_TRADE_MODE_REAL=2)
        self.info = SimpleNamespace(login=123456, name='Test User', company='Test Broker', server='Test-Demo',
                                    currency='USC', trade_mode=0, leverage=100, balance=0, equity=0, profit=0,
                                    credit=0, margin=0, margin_free=0, margin_level=0)
        self.mt5.terminal_info = Mock(return_value=SimpleNamespace(connected=True))
        self.mt5.account_info = Mock(return_value=self.info)
        self.mt5.positions_get = Mock(return_value=())
        spec = importlib.util.spec_from_file_location('test_bridge_module', Path(__file__).resolve().parents[1] / 'mt5_bridge.py')
        self.bridge = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'MetaTrader5': self.mt5}):
            spec.loader.exec_module(self.bridge)

    def test_read_only_zero_account(self):
        result = self.bridge.account()
        self.assertEqual(result['balance'], 0)
        self.assertEqual(result['positions_count'], 0)
        self.assertIsNone(result['margin_level'])
        self.assertEqual(result['trade_mode'], 'DEMO')
        self.assertTrue(result['updated_at'].endswith('+00:00'))

    def test_missing_positions_cannot_be_treated_as_empty(self):
        self.mt5.positions_get.return_value = None
        with self.assertRaises(HTTPException):
            self.bridge.account()

    def test_disconnected_or_missing_account(self):
        self.mt5.terminal_info.return_value.connected = False
        with self.assertRaises(HTTPException):
            self.bridge.account()
        self.mt5.terminal_info.return_value.connected = True
        self.mt5.account_info.return_value = None
        with self.assertRaises(HTTPException):
            self.bridge.account()

    def test_switch_during_read_rejected(self):
        self.mt5.account_info.side_effect = [self.info, SimpleNamespace(login=654321, server='Other')]
        with self.assertRaises(HTTPException):
            self.bridge.account()


if __name__ == '__main__':
    unittest.main()
