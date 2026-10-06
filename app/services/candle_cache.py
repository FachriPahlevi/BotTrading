import copy
import logging
import math
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
import pandas as pd

logger = logging.getLogger(__name__)

MAX_CANDLE_HISTORY = 800
DEFAULT_CHART_LIMIT = 500


def _series_value(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return None
    return float(value)


def _add_trade_markers(payload: dict[str, Any]) -> dict[str, Any]:
    candles = payload.get("candles", [])
    for index, candle in enumerate(candles):
        candle["trade_signal"] = None
        if index == 0:
            continue
        previous = candles[index - 1]
        values = (
            previous.get("macd"),
            previous.get("macd_signal"),
            candle.get("macd"),
            candle.get("macd_signal"),
        )
        if not all(value is not None for value in values):
            continue
        previous_macd, previous_signal, macd, macd_signal = values
        if previous_macd <= previous_signal and macd > macd_signal:
            candle["trade_signal"] = "BUY"
        elif previous_macd >= previous_signal and macd < macd_signal:
            candle["trade_signal"] = "SELL"
    return payload


def compute_market_payload(symbol: str, interval: str, candles: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculates technical indicators (SMA-20, EMA-50, BB, RSI-14, MACD) on candles."""
    if not candles:
        return {
            "symbol": symbol,
            "interval": interval,
            "provider": "HFM MetaTrader 5",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "candles": [],
        }

    frame = pd.DataFrame(candles)
    required = {"time", "open", "high", "low", "close"}
    if not required.issubset(frame.columns):
        raise HTTPException(
            status_code=422,
            detail="Candles must include time, open, high, low, and close",
        )

    # Sort chronologically and drop duplicate timestamps
    frame = frame.sort_values("time").drop_duplicates(subset=["time"]).reset_index(drop=True)

    for column in ("open", "high", "low", "close", "volume"):
        if column not in frame:
            frame[column] = 0
        frame[column] = pd.to_numeric(frame[column])

    frame["sma_20"] = frame.close.rolling(20, min_periods=1).mean()
    frame["ema_50"] = frame.close.ewm(span=50, adjust=False).mean()
    standard_deviation = frame.close.rolling(20, min_periods=1).std(ddof=0).fillna(0)
    frame["bb_upper"] = frame.sma_20 + (standard_deviation * 2)
    frame["bb_lower"] = frame.sma_20 - (standard_deviation * 2)
    delta = frame.close.diff()
    gains = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    losses = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    rs = gains / losses.replace(0, float("nan"))
    frame["rsi_14"] = 100 - (100 / (1 + rs))
    frame.loc[(losses == 0) & (gains > 0), "rsi_14"] = 100
    frame.loc[(losses == 0) & (gains == 0), "rsi_14"] = 50
    frame["rsi_14"] = frame["rsi_14"].fillna(50)
    frame["macd"] = frame.close.ewm(span=12, adjust=False).mean() - frame.close.ewm(span=26, adjust=False).mean()
    frame["macd_signal"] = frame.macd.ewm(span=9, adjust=False).mean()

    fields = (
        "time",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "sma_20",
        "ema_50",
        "bb_upper",
        "bb_lower",
        "rsi_14",
        "macd",
        "macd_signal",
    )
    normalized = []
    for item in frame.to_dict("records"):
        normalized.append(
            {key: int(item[key]) if key == "time" else _series_value(item[key]) for key in fields}
        )

    return _add_trade_markers(
        {
            "symbol": symbol,
            "interval": interval,
            "provider": "HFM MetaTrader 5",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "candles": normalized,
        }
    )


class CandleCacheService:
    """Thread-safe, high-performance in-memory candle repository and cache.

    Structure:
    {
        "XAUUSDM": {
            "1m": {
                "timestamp_received": float,
                "raw_candles": list[dict],
                "payload": dict,
            },
            ...
        }
    }
    """

    def __init__(self, max_history: int = MAX_CANDLE_HISTORY) -> None:
        self.max_history = max_history
        self._lock = threading.RLock()
        self._store: dict[str, dict[str, dict[str, Any]]] = {}

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    @staticmethod
    def _symbols_match(sym_a: str, sym_b: str) -> bool:
        a = sym_a.upper()
        b = sym_b.upper()
        if a == b:
            return True
        gold_group = {"XAUUSD", "XAUUSDM", "GOLD"}
        if a in gold_group and b in gold_group:
            return True
        if a.rstrip("M") == b.rstrip("M"):
            return True
        if "XAU" in a and "XAU" in b:
            return True
        if "GOLD" in a and "GOLD" in b:
            return True
        return False

    def upsert_candles(
        self,
        symbol: str,
        interval: str,
        incoming_candles: list[dict[str, Any]],
    ) -> tuple[int, int]:
        """Upserts incoming candles based on timestamp with O(n) complexity.

        Replaces existing candle if timestamp matches, appends if new.
        Retains at most self.max_history candles sorted ascending by time.
        Returns:
            (received_count, stored_count)
        """
        sym_clean = symbol.strip().upper()
        interval_clean = interval.strip().lower()

        if not incoming_candles:
            raise HTTPException(status_code=422, detail="Candles list cannot be empty")

        with self._lock:
            if sym_clean not in self._store:
                self._store[sym_clean] = {}

            existing_entry = self._store[sym_clean].get(interval_clean)
            existing_candles = existing_entry.get("raw_candles", []) if existing_entry else []

            # 1. Map existing candles by timestamp
            merged_map: dict[int, dict[str, Any]] = {}
            for candle in existing_candles:
                c_time = int(candle.get("time", 0))
                merged_map[c_time] = candle

            # 2. Upsert incoming candles
            for candle in incoming_candles:
                c_time = int(candle.get("time", 0))
                merged_map[c_time] = {
                    "time": c_time,
                    "open": float(candle.get("open", 0.0)),
                    "high": float(candle.get("high", 0.0)),
                    "low": float(candle.get("low", 0.0)),
                    "close": float(candle.get("close", 0.0)),
                    "volume": int(candle.get("volume", 0)),
                }

            # 3. Sort ascending by timestamp
            sorted_candles = sorted(merged_map.values(), key=lambda c: c["time"])

            # 4. Trim to max history retention
            trimmed_candles = sorted_candles[-self.max_history:]

            # 5. Compute indicators & payload
            payload = compute_market_payload(sym_clean, interval_clean, trimmed_candles)

            now_ts = datetime.now(timezone.utc).timestamp()
            self._store[sym_clean][interval_clean] = {
                "timestamp_received": now_ts,
                "raw_candles": trimmed_candles,
                "payload": payload,
            }

            logger.info(
                "Upserted candles for %s %s: received %d, total stored %d (max %d)",
                sym_clean,
                interval_clean,
                len(incoming_candles),
                len(trimmed_candles),
                self.max_history,
            )
            return len(incoming_candles), len(trimmed_candles)

    def find_entry(self, symbol: str, interval: str) -> tuple[str, str, dict[str, Any]] | None:
        """Finds entry by exact match or symbol alias matching."""
        sym_clean = symbol.strip().upper()
        interval_clean = interval.strip().lower()

        with self._lock:
            # 1. Exact match
            exact = self._store.get(sym_clean, {}).get(interval_clean)
            if exact is not None:
                return sym_clean, interval_clean, exact

            # 2. Alias match
            for cached_sym, intervals in self._store.items():
                if self._symbols_match(sym_clean, cached_sym) and interval_clean in intervals:
                    return cached_sym, interval_clean, intervals[interval_clean]

            return None

    def get_chart(self, symbol: str, interval: str, limit: int = DEFAULT_CHART_LIMIT) -> dict[str, Any]:
        """Retrieves latest candles with technical indicators for chart display."""
        sym_clean = symbol.strip()
        interval_clean = interval.strip().lower()
        limit = max(1, min(limit, 1000))

        match = self.find_entry(sym_clean, interval_clean)
        if match is not None:
            _, _, entry = match
            now_ts = datetime.now(timezone.utc).timestamp()
            age = now_ts - entry.get("timestamp_received", 0)

            if age > 60:
                logger.warning(
                    "Cached candles for %s (%s) is stale: %.1f seconds old",
                    sym_clean,
                    interval_clean,
                    age,
                )
                raise HTTPException(
                    status_code=503,
                    detail=f"Cached data for {sym_clean} ({interval_clean}) is stale ({int(age)}s old).",
                )

            # Return sliced payload
            full_payload = entry.get("payload", {})
            candles = full_payload.get("candles", [])
            sliced_candles = candles[-limit:] if len(candles) > limit else candles

            result = copy.copy(full_payload)
            result["symbol"] = sym_clean
            result["interval"] = interval_clean
            result["candles"] = sliced_candles
            return result

        # Not found - provide explicit diagnosis
        summary = self.get_summary()
        if summary:
            summary_parts = [
                f"{s} ({inv}, {max(0, int(a))}s old)" for s, inv, a in summary
            ]
            has_fresh = any(0 <= a <= 60 for _, _, a in summary)
            detail = (
                f"MT5 cache has {'fresh' if has_fresh else 'stale'} candles for {', '.join(summary_parts)}, "
                f"but not {sym_clean} ({interval_clean}). "
                "Compile and attach AurumMarketBridge.mq5 v1.3/v2.0, then check Experts/Log sistem for every timeframe."
            )
        else:
            detail = f"No MT5 candle data available for {sym_clean} {interval_clean}"

        logger.info("Chart request 503 for %s %s: %s", sym_clean, interval_clean, detail)
        raise HTTPException(status_code=503, detail=detail)

    def get_summary(self) -> list[tuple[str, str, float]]:
        """Returns list of (symbol, interval, age_seconds) sorted."""
        now_ts = datetime.now(timezone.utc).timestamp()
        result = []
        with self._lock:
            for sym, intervals in self._store.items():
                for inv, entry in intervals.items():
                    age = now_ts - entry.get("timestamp_received", 0)
                    result.append((sym, inv, age))
        return sorted(result)

    def to_legacy_dict(self) -> dict[tuple[str, str], dict[str, Any]]:
        """Exports entries into {(symbol, interval): entry} format for backward compatibility."""
        with self._lock:
            flat: dict[tuple[str, str], dict[str, Any]] = {}
            for sym, intervals in self._store.items():
                for inv, entry in intervals.items():
                    flat[(sym, inv)] = entry
            return flat

    def set_legacy_entry(self, key: tuple[str, str], entry: dict[str, Any]) -> None:
        """Sets entry from legacy dict assignment."""
        sym, inv = key
        sym_clean = sym.strip().upper()
        inv_clean = inv.strip().lower()
        with self._lock:
            if sym_clean not in self._store:
                self._store[sym_clean] = {}
            self._store[sym_clean][inv_clean] = entry


class LegacyMarketCacheDict(dict):
    """Dictionary proxy that delegates to CandleCacheService.

    Allows existing code accessing `endpoints.market_cache` to work seamlessly.
    """

    def __init__(self, service: CandleCacheService) -> None:
        super().__init__()
        self._service = service

    def clear(self) -> None:
        self._service.clear()

    def __setitem__(self, key: tuple[str, str], value: dict[str, Any]) -> None:
        self._service.set_legacy_entry(key, value)

    def __getitem__(self, key: tuple[str, str]) -> dict[str, Any]:
        val = self.get(key)
        if val is None:
            raise KeyError(key)
        return val

    def get(self, key: tuple[str, str], default: Any = None) -> Any:  # type: ignore[override]
        sym, inv = key
        match = self._service.find_entry(sym, inv)
        if match is not None:
            return match[2]
        return default

    def __contains__(self, key: object) -> bool:
        if isinstance(key, tuple) and len(key) == 2:
            return self._service.find_entry(key[0], key[1]) is not None
        return False

    def items(self) -> Any:  # type: ignore[override]
        return self._service.to_legacy_dict().items()

    def values(self) -> Any:  # type: ignore[override]
        return self._service.to_legacy_dict().values()

    def keys(self) -> Any:  # type: ignore[override]
        return self._service.to_legacy_dict().keys()

    def __len__(self) -> int:
        return len(self._service.to_legacy_dict())

    def __iter__(self) -> Any:
        return iter(self._service.to_legacy_dict())


# Singleton instance
candle_cache_service = CandleCacheService(max_history=MAX_CANDLE_HISTORY)
market_cache_adapter = LegacyMarketCacheDict(candle_cache_service)
