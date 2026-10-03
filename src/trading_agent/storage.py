import sqlite3
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from trading_agent.models import OrderIntent, Signal, AccountSnapshot

class StorageManager:
    def __init__(self, db_path: str = "trading_agent.db"):
        self.db_path = db_path
        self._memory_conn = None
        if self.db_path == ":memory:":
            self._memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
            self._memory_conn.row_factory = sqlite3.Row
            self._memory_conn.execute("PRAGMA journal_mode=WAL;")
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        if self._memory_conn is not None:
            return self._memory_conn
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    mode TEXT NOT NULL,
                    account_login TEXT,
                    server TEXT,
                    started_at TEXT NOT NULL,
                    ended_at TEXT
                );

                CREATE TABLE IF NOT EXISTS configuration_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    version_hash TEXT NOT NULL,
                    config_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    bar_time TEXT NOT NULL,
                    strategy_version TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    ema_fast REAL,
                    ema_slow REAL,
                    ema_trend REAL,
                    atr REAL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS order_intents (
                    idempotency_key TEXT PRIMARY KEY,
                    account_login TEXT NOT NULL,
                    server TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    bar_time TEXT NOT NULL,
                    strategy_version TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    requested_volume REAL NOT NULL,
                    entry_price REAL NOT NULL,
                    stop_loss REAL NOT NULL,
                    take_profit REAL NOT NULL,
                    status TEXT NOT NULL,
                    reject_reason TEXT,
                    deal_ticket INTEGER,
                    order_ticket INTEGER,
                    filled_volume REAL DEFAULT 0.0,
                    filled_price REAL DEFAULT 0.0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS execution_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    idempotency_key TEXT NOT NULL,
                    from_status TEXT NOT NULL,
                    to_status TEXT NOT NULL,
                    event_data TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (idempotency_key) REFERENCES order_intents(idempotency_key)
                );

                CREATE TABLE IF NOT EXISTS broker_deals (
                    deal_ticket INTEGER PRIMARY KEY,
                    account_login TEXT NOT NULL,
                    server TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    volume REAL NOT NULL,
                    price REAL NOT NULL,
                    sl REAL,
                    tp REAL,
                    profit REAL,
                    comment TEXT,
                    time TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS equity_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_login TEXT NOT NULL,
                    server TEXT NOT NULL,
                    balance REAL NOT NULL,
                    equity REAL NOT NULL,
                    timestamp TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS risk_baselines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_login TEXT NOT NULL,
                    server TEXT NOT NULL,
                    date_utc TEXT NOT NULL,
                    e0_baseline REAL NOT NULL,
                    high_water_mark REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(account_login, server, date_utc)
                );

                CREATE TABLE IF NOT EXISTS risk_locks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_login TEXT NOT NULL,
                    server TEXT NOT NULL,
                    lock_type TEXT NOT NULL, -- DAILY_LOSS, DRAWDOWN
                    reason TEXT NOT NULL,
                    locked_at TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    UNIQUE(account_login, server, lock_type)
                );

                CREATE TABLE IF NOT EXISTS worker_commands (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    command TEXT NOT NULL, -- START, PAUSE, STOP, ARM_DEMO, RESET_LOCK
                    payload TEXT,
                    status TEXT DEFAULT 'PENDING',
                    created_at TEXT NOT NULL
                );
            """)

    def save_signal(self, signal: Signal) -> int:
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO signals (symbol, timeframe, bar_time, strategy_version, direction, reason, ema_fast, ema_slow, ema_trend, atr, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    signal.symbol,
                    signal.timeframe,
                    signal.bar_time.isoformat(),
                    signal.strategy_version,
                    signal.direction,
                    signal.reason,
                    signal.ema_fast,
                    signal.ema_slow,
                    signal.ema_trend,
                    signal.atr,
                    signal.created_at.isoformat()
                )
            )
            return cursor.lastrowid

    def save_order_intent(self, intent: OrderIntent) -> bool:
        """Insert or ignore duplicate order intent based on idempotency_key."""
        with self._get_connection() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO order_intents (
                        idempotency_key, account_login, server, symbol, timeframe, bar_time, strategy_version,
                        direction, requested_volume, entry_price, stop_loss, take_profit, status, reject_reason,
                        deal_ticket, order_ticket, filled_volume, filled_price, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        intent.idempotency_key,
                        intent.account_login,
                        intent.server,
                        intent.symbol,
                        intent.timeframe,
                        intent.bar_time.isoformat(),
                        intent.strategy_version,
                        intent.direction,
                        intent.requested_volume,
                        intent.entry_price,
                        intent.stop_loss,
                        intent.take_profit,
                        intent.status,
                        intent.reject_reason,
                        intent.deal_ticket,
                        intent.order_ticket,
                        intent.filled_volume,
                        intent.filled_price,
                        intent.created_at.isoformat(),
                        intent.updated_at.isoformat()
                    )
                )
                self.record_execution_event(conn, intent.idempotency_key, "NONE", intent.status, f"Created intent {intent.idempotency_key}")
                return True
            except sqlite3.IntegrityError:
                return False

    def update_order_intent_status(self, idempotency_key: str, to_status: str, reject_reason: Optional[str] = None, deal_ticket: Optional[int] = None, order_ticket: Optional[int] = None, filled_volume: float = 0.0, filled_price: float = 0.0):
        with self._get_connection() as conn:
            row = conn.execute("SELECT status FROM order_intents WHERE idempotency_key = ?", (idempotency_key,)).fetchone()
            from_status = row["status"] if row else "UNKNOWN"
            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                """
                UPDATE order_intents
                SET status = ?, reject_reason = COALESCE(?, reject_reason), deal_ticket = COALESCE(?, deal_ticket),
                    order_ticket = COALESCE(?, order_ticket), filled_volume = CASE WHEN ? > 0 THEN ? ELSE filled_volume END,
                    filled_price = CASE WHEN ? > 0 THEN ? ELSE filled_price END, updated_at = ?
                WHERE idempotency_key = ?
                """,
                (to_status, reject_reason, deal_ticket, order_ticket, filled_volume, filled_volume, filled_price, filled_price, now_iso, idempotency_key)
            )
            self.record_execution_event(conn, idempotency_key, from_status, to_status, reject_reason or f"Transitioned to {to_status}")

    def record_execution_event(self, conn: sqlite3.Connection, idempotency_key: str, from_status: str, to_status: str, event_data: str):
        conn.execute(
            "INSERT INTO execution_events (idempotency_key, from_status, to_status, event_data, created_at) VALUES (?, ?, ?, ?, ?)",
            (idempotency_key, from_status, to_status, event_data, datetime.now(timezone.utc).isoformat())
        )

    def get_order_intent(self, idempotency_key: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM order_intents WHERE idempotency_key = ?", (idempotency_key,)).fetchone()
            return dict(row) if row else None

    def get_active_risk_locks(self, account_login: str, server: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM risk_locks WHERE account_login = ? AND server = ? AND active = 1", (account_login, server)).fetchall()
            return [dict(r) for r in rows]

    def set_risk_lock(self, account_login: str, server: str, lock_type: str, reason: str):
        with self._get_connection() as conn:
            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                """
                INSERT INTO risk_locks (account_login, server, lock_type, reason, locked_at, active)
                VALUES (?, ?, ?, ?, ?, 1)
                ON CONFLICT(account_login, server, lock_type) DO UPDATE SET
                    reason = excluded.reason, locked_at = excluded.locked_at, active = 1
                """,
                (account_login, server, lock_type, reason, now_iso)
            )

    def release_risk_locks(self, account_login: str, server: str, lock_type: Optional[str] = None):
        with self._get_connection() as conn:
            if lock_type:
                conn.execute("UPDATE risk_locks SET active = 0 WHERE account_login = ? AND server = ? AND lock_type = ?", (account_login, server, lock_type))
            else:
                conn.execute("UPDATE risk_locks SET active = 0 WHERE account_login = ? AND server = ?", (account_login, server))

    def get_or_create_risk_baseline(self, account_login: str, server: str, current_equity: float, date_utc: str) -> Dict[str, float]:
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT e0_baseline, high_water_mark FROM risk_baselines WHERE account_login = ? AND server = ? AND date_utc = ?",
                (account_login, server, date_utc)
            ).fetchone()
            if row:
                hwm = max(row["high_water_mark"], current_equity)
                if hwm > row["high_water_mark"]:
                    conn.execute(
                        "UPDATE risk_baselines SET high_water_mark = ? WHERE account_login = ? AND server = ? AND date_utc = ?",
                        (hwm, account_login, server, date_utc)
                    )
                return {"e0_baseline": row["e0_baseline"], "high_water_mark": hwm}

            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                """
                INSERT INTO risk_baselines (account_login, server, date_utc, e0_baseline, high_water_mark, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (account_login, server, date_utc, current_equity, current_equity, now_iso)
            )
            return {"e0_baseline": current_equity, "high_water_mark": current_equity}

    def record_equity_snapshot(self, snapshot: AccountSnapshot):
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO equity_snapshots (account_login, server, balance, equity, timestamp) VALUES (?, ?, ?, ?, ?)",
                (snapshot.account_id, snapshot.server, snapshot.balance, snapshot.equity, snapshot.timestamp.isoformat())
            )
