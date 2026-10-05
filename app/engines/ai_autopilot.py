import os
import time
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

from app.diagnostics import record
from app.api.endpoints import market_cache
from app.engines.ai_analyst import analyze_market_chart


class AiAutopilotEngine:
    """Autonomous AI Trading Agent that trades toward a user-defined profit target."""

    def __init__(self):
        self._lock = threading.RLock()
        self.status = "IDLE"  # IDLE, RUNNING, PAUSED, TARGET_REACHED, STOPPED
        self.target_profit = 1000.0
        self.max_loss = 200.0
        self.volume = 0.01
        self.symbol = "XAUUSDm"
        self.interval = "1h"
        self.max_positions = 1

        self.session_id: Optional[str] = None
        self.start_time: Optional[str] = None
        self.start_balance: float = 0.0
        self.current_balance: float = 0.0
        self.current_equity: float = 0.0
        self.realized_profit: float = 0.0
        self.unrealized_profit: float = 0.0
        self.total_profit: float = 0.0
        self.progress_percent: float = 0.0
        self.trades_count: int = 0
        self.winning_trades: int = 0
        self.losing_trades: int = 0
        self.last_action: str = "Agent siap dimulai"
        self.last_action_time: Optional[str] = None
        self.logs: List[Dict[str, Any]] = []

        self._worker_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def _add_log(self, log_type: str, message: str, details: Optional[dict] = None):
        entry = {
            "id": int(time.time() * 1000),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": log_type,  # INFO, TRADE, TARGET, WARN, PROFIT
            "message": message,
            "details": details or {},
        }
        self.logs.insert(0, entry)
        if len(self.logs) > 100:
            self.logs.pop()
        record(log_type, "autopilot", message)

    def start(
        self,
        target_profit: float = 1000.0,
        max_loss: float = 200.0,
        volume: float = 0.01,
        symbol: str = "XAUUSDm",
        interval: str = "1h",
    ) -> Dict[str, Any]:
        with self._lock:
            self.target_profit = max(10.0, float(target_profit))
            self.max_loss = max(10.0, float(max_loss))
            self.volume = max(0.01, min(5.0, round(float(volume), 2)))
            self.symbol = symbol.strip()
            self.interval = interval.strip().lower()

            # Initialize balance from MT5
            initial_balance = 587.35  # default benchmark
            is_test = os.getenv("TRADING_TEST_MODE") == "1"
            if not is_test:
                try:
                    import MetaTrader5 as mt5
                    if not mt5.terminal_info():
                        mt5.initialize()
                    acc = mt5.account_info()
                    if acc:
                        if acc.trade_mode != mt5.ACCOUNT_TRADE_MODE_DEMO:
                            raise PermissionError("Hanya akun DEMO yang diizinkan untuk AI Autopilot.")
                        initial_balance = float(acc.balance)
                except Exception as exc:
                    self._add_log("WARN", f"Gagal membaca saldo awal MT5: {exc}")

            self.session_id = f"AP_{int(time.time())}"
            self.start_time = datetime.now(timezone.utc).isoformat()
            self.start_balance = initial_balance
            self.current_balance = initial_balance
            self.current_equity = initial_balance
            self.realized_profit = 0.0
            self.unrealized_profit = 0.0
            self.total_profit = 0.0
            self.progress_percent = 0.0
            self.trades_count = 0
            self.winning_trades = 0
            self.losing_trades = 0
            self.status = "RUNNING"
            self.last_action = f"Autopilot aktif menuju target ${self.target_profit:,.2f}"
            self.last_action_time = self.start_time

            self._add_log(
                "INFO",
                f"🚀 AI Trading Agent diaktifkan! Target Profit: ${self.target_profit:,.2f} | Saldo Awal: ${self.start_balance:,.2f} | Max Loss: ${self.max_loss:,.2f}",
                {"target": self.target_profit, "balance": self.start_balance},
            )

            # Start background thread if not already running (and not in unit test mode)
            if not is_test:
                self._stop_event.clear()
                if self._worker_thread is None or not self._worker_thread.is_alive():
                    self._worker_thread = threading.Thread(target=self._loop_runner, daemon=True)
                    self._worker_thread.start()

            return self.get_status()

    def pause(self) -> Dict[str, Any]:
        with self._lock:
            if self.status == "RUNNING":
                self.status = "PAUSED"
                self.last_action = "Autopilot dijeda oleh pengguna"
                self.last_action_time = datetime.now(timezone.utc).isoformat()
                self._add_log("INFO", "⏸️ AI Trading Agent dijeda. Posisi yang sedang berjalan tetap dipantau.")
            return self.get_status()

    def stop(self, close_positions: bool = True) -> Dict[str, Any]:
        with self._lock:
            self.status = "STOPPED"
            self._stop_event.set()
            self.last_action = "Autopilot dihentikan"
            self.last_action_time = datetime.now(timezone.utc).isoformat()
            self._add_log("INFO", f"🛑 AI Trading Agent dihentikan. Realized profit sesi: ${self.total_profit:.2f}")

        if close_positions:
            self._close_all_positions("Autopilot dihentikan oleh pengguna")

        return self.get_status()

    def _loop_runner(self):
        """Background worker thread that runs every 10-15 seconds."""
        while not self._stop_event.is_set():
            try:
                if self.status == "RUNNING":
                    self.evaluate_cycle()
            except Exception as e:
                self._add_log("WARN", f"Error pada siklus autopilot: {e}")

            # Sleep in small slices to respond promptly to stop events
            for _ in range(30):
                if self._stop_event.is_set():
                    break
                time.sleep(0.5)

    def evaluate_cycle(self) -> Dict[str, Any]:
        """Perform one complete evaluation cycle: check profits, target, positions, and AI decisions."""
        is_test = os.getenv("TRADING_TEST_MODE") == "1"

        open_positions = []
        equity = self.start_balance
        balance = self.start_balance

        if not is_test:
            try:
                import MetaTrader5 as mt5
                if not mt5.terminal_info():
                    mt5.initialize()
                term = mt5.terminal_info()
                if term and hasattr(term, "trade_allowed") and not term.trade_allowed:
                    self._add_log("WARN", "MT5 Algo Trading nonaktif (Ctrl+E). Autopilot menunggu hingga Algo Trading diaktifkan.")
                    return self.get_status()

                acc = mt5.account_info()
                if acc:
                    balance = float(acc.balance)
                    equity = float(acc.equity)

                positions = mt5.positions_get(symbol=self.symbol)
                if positions is not None:
                    open_positions = list(positions)
            except Exception as e:
                self._add_log("WARN", f"Gagal membaca status MT5: {e}")

        # Update metrics
        unrealized = sum(float(getattr(p, "profit", 0.0)) for p in open_positions)
        realized_diff = balance - self.start_balance
        total_pnl = realized_diff + unrealized

        with self._lock:
            self.current_balance = balance
            self.current_equity = equity
            self.realized_profit = round(realized_diff, 2)
            self.unrealized_profit = round(unrealized, 2)
            self.total_profit = round(total_pnl, 2)
            self.progress_percent = min(100.0, max(0.0, round((self.total_profit / self.target_profit) * 100, 1)))
            self.last_action_time = datetime.now(timezone.utc).isoformat()

            # CHECK 1: Target Profit Reached!
            if self.total_profit >= self.target_profit:
                self.status = "TARGET_REACHED"
                self.last_action = f"🎯 TARGET TERCAPAI: ${self.total_profit:,.2f}!"
                self._add_log(
                    "TARGET",
                    f"🎉 TARGET PROFIT TERCAPAI! Akumulasi profit: ${self.total_profit:,.2f} / ${self.target_profit:,.2f} (100%). Menutup semua posisi untuk mengamankan keuntungan.",
                    {"total_profit": self.total_profit, "target": self.target_profit},
                )
                self._close_all_positions("Target Profit Tercapai 🎯")
                self._stop_event.set()
                return self.get_status()

            # CHECK 2: Maximum Loss Safety Protection
            if self.total_profit <= -abs(self.max_loss):
                self.status = "STOPPED"
                self.last_action = f"⚠️ Max loss limit tercapai (-${abs(self.total_profit):,.2f})"
                self._add_log(
                    "WARN",
                    f"🛑 Batas kerugian maksimal (-${abs(self.max_loss):,.2f}) tersentuh. Seluruh posisi ditutup otomatis demi keselamatan modal.",
                    {"loss": self.total_profit},
                )
                self._close_all_positions("Safety Stop Out Triggered")
                self._stop_event.set()
                return self.get_status()

            # CHECK 3: Position Management
            if len(open_positions) >= self.max_positions:
                pos = open_positions[0]
                action_type = "BUY" if getattr(pos, "type", 0) == 0 else "SELL"
                profit = getattr(pos, "profit", 0.0)
                self.last_action = f"Memantau {action_type} #{pos.ticket} (Floating PnL: ${profit:+.2f})"
                return self.get_status()

        # CHECK 4: Open New Position based on AI Analysis
        if len(open_positions) < self.max_positions and self.status == "RUNNING":
            self._evaluate_market_and_open()

        return self.get_status()

    def _evaluate_market_and_open(self):
        """Ask Gemini AI for market analysis and open a new trade if signal is clear."""
        is_test = os.getenv("TRADING_TEST_MODE") == "1"
        if is_test:
            self._execute_mt5_order("BUY", self.volume, 2680.0, 2720.0, "AI_LONG_TEST")
            return

        # Get candles from cache
        candles = []
        sym_upper = self.symbol.upper()
        for (c_sym, c_inv), entry in market_cache.items():
            if c_sym.upper() == sym_upper or (sym_upper.startswith("XAUUSD") and c_sym.upper().startswith("XAUUSD")):
                candles = entry.get("payload", {}).get("candles", [])
                if candles:
                    break

        if not candles or len(candles) < 20:
            self._add_log("INFO", f"Menunggu feed data candle {self.symbol} untuk analisis AI...")
            return

        self._add_log("INFO", f"AI memindai pasar {self.symbol} ({self.interval}). Mengidentifikasi setup trading...")
        try:
            ai_res = analyze_market_chart(self.symbol, self.interval, candles)
        except Exception as e:
            self._add_log("WARN", f"Gagal menganalisis pasar dengan AI: {e}")
            return

        bias = ai_res.get("bias", "WAIT")
        confidence = ai_res.get("confidence", 0)
        scenarios = ai_res.get("scenarios", {}).get("main") or {}
        sl_val = scenarios.get("stop_loss")
        tp_val = scenarios.get("take_profit_1")

        if bias in {"LONG", "SHORT"} and confidence >= 60:
            action = "BUY" if bias == "LONG" else "SELL"
            self._execute_mt5_order(action, self.volume, sl_val, tp_val, f"AI_{bias}_{confidence}%")
        else:
            self._add_log("INFO", f"Status AI: {bias} (Confidence: {confidence}%). AI menunggu konfirmasi momentum lebih lanjut.")

    def _execute_mt5_order(self, action: str, volume: float, sl: Optional[float], tp: Optional[float], comment: str):
        is_test = os.getenv("TRADING_TEST_MODE") == "1"
        now_iso = datetime.now(timezone.utc).isoformat()

        if is_test:
            self.trades_count += 1
            self.last_action = f"Test Order {action} {volume} {self.symbol}"
            self._add_log("TRADE", f"Simulasi order {action} {volume} {self.symbol} dieksekusi.")
            return

        try:
            import MetaTrader5 as mt5
            if not mt5.terminal_info():
                mt5.initialize()

            term = mt5.terminal_info()
            if term and hasattr(term, "trade_allowed") and not term.trade_allowed:
                self._add_log("WARN", "Algo Trading MT5 belum diaktifkan (Ctrl+E). Eksekusi ditunda.")
                return

            tick = mt5.symbol_info_tick(self.symbol)
            sym_info = mt5.symbol_info(self.symbol)
            if not tick or not sym_info:
                self._add_log("WARN", f"Tidak ada kuotasi harga untuk simbol {self.symbol}")
                return

            price = tick.ask if action == "BUY" else tick.bid
            digits = getattr(sym_info, "digits", 2)

            # Filling mode
            fm = getattr(sym_info, "filling_mode", 0)
            if fm & 2:
                type_filling = mt5.ORDER_FILLING_IOC
            elif fm & 1:
                type_filling = mt5.ORDER_FILLING_FOK
            else:
                type_filling = mt5.ORDER_FILLING_RETURN

            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": self.symbol,
                "volume": volume,
                "type": mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL,
                "price": round(price, digits),
                "sl": round(sl, digits) if sl else 0.0,
                "tp": round(tp, digits) if tp else 0.0,
                "deviation": 25,
                "magic": 889900,
                "comment": comment[:31],
                "type_filling": type_filling,
            }

            res = mt5.order_send(req)
            if res is not None and res.retcode == mt5.TRADE_RETCODE_DONE:
                self.trades_count += 1
                ticket = res.order or res.deal
                self.last_action = f"Membuka {action} #{ticket} @ {price:.2f}"
                self._add_log(
                    "TRADE",
                    f"✅ AI membuka posisi {action} {volume} {self.symbol} pada harga {price:.2f} (Ticket #{ticket}) | Target Profit Sesi: ${self.target_profit:,.2f}",
                    {"ticket": ticket, "action": action, "price": price, "sl": sl, "tp": tp},
                )
            else:
                err_msg = res.comment if res else str(mt5.last_error())
                self._add_log("WARN", f"Order {action} ditolak MT5: {err_msg}")
        except Exception as e:
            self._add_log("WARN", f"Gagal mengeksekusi order: {e}")

    def _close_all_positions(self, reason: str):
        """Close any open positions for this symbol on MT5."""
        is_test = os.getenv("TRADING_TEST_MODE") == "1"
        if is_test:
            self._add_log("INFO", f"Posisi simulasi ditutup ({reason}).")
            return

        try:
            import MetaTrader5 as mt5
            if not mt5.terminal_info():
                mt5.initialize()

            positions = mt5.positions_get(symbol=self.symbol)
            if not positions:
                return

            for pos in positions:
                tick = mt5.symbol_info_tick(pos.symbol)
                if not tick:
                    continue
                sym_info = mt5.symbol_info(pos.symbol)
                fm = getattr(sym_info, "filling_mode", 0)
                type_filling = mt5.ORDER_FILLING_IOC if fm & 2 else (mt5.ORDER_FILLING_FOK if fm & 1 else mt5.ORDER_FILLING_RETURN)
                order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                price = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask

                close_req = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "position": pos.ticket,
                    "symbol": pos.symbol,
                    "volume": pos.volume,
                    "type": order_type,
                    "price": price,
                    "deviation": 25,
                    "magic": 889900,
                    "comment": f"AutoClose_{reason[:10]}",
                    "type_filling": type_filling,
                }
                res = mt5.order_send(close_req)
                if res and res.retcode == mt5.TRADE_RETCODE_DONE:
                    profit = getattr(pos, "profit", 0.0)
                    if profit >= 0:
                        self.winning_trades += 1
                    else:
                        self.losing_trades += 1
                    self._add_log(
                        "PROFIT",
                        f"🔒 Menutup posisi #{pos.ticket} ({pos.symbol}) dengan profit ${profit:+.2f} ({reason}).",
                    )
        except Exception as e:
            self._add_log("WARN", f"Gagal menutup posisi otomatis: {e}")

    def get_status(self) -> Dict[str, Any]:
        """Return snapshot of current autopilot state."""
        with self._lock:
            return {
                "status": self.status,
                "session_id": self.session_id,
                "start_time": self.start_time,
                "start_balance": round(self.start_balance, 2),
                "current_balance": round(self.current_balance, 2),
                "current_equity": round(self.current_equity, 2),
                "target_profit": round(self.target_profit, 2),
                "max_loss": round(self.max_loss, 2),
                "volume": self.volume,
                "symbol": self.symbol,
                "interval": self.interval,
                "realized_profit": self.realized_profit,
                "unrealized_profit": self.unrealized_profit,
                "total_profit": self.total_profit,
                "progress_percent": self.progress_percent,
                "trades_count": self.trades_count,
                "winning_trades": self.winning_trades,
                "losing_trades": self.losing_trades,
                "last_action": self.last_action,
                "last_action_time": self.last_action_time,
                "logs": list(self.logs[:30]),
            }


# Global singleton instance
autopilot_engine = AiAutopilotEngine()
