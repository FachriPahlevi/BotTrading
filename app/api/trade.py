import os
import time
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException

from app.api.endpoints import market_cache
from app.diagnostics import record

router = APIRouter(tags=["Trade"])

# In-memory history buffer (200 latest executions)
_orders_history: List[dict] = []
_active_positions: List[dict] = []


class OrderSubmitRequest(BaseModel):
    symbol: str = Field(default="XAUUSDm", min_length=2, max_length=20)
    action: str = Field(..., description="BUY or SELL")
    volume: float = Field(default=0.01, gt=0, le=50.0)
    sl: Optional[float] = Field(default=None, description="Stop Loss price level")
    tp: Optional[float] = Field(default=None, description="Take Profit price level")
    mode: str = Field(default="demo", description="Execution mode: demo (direct MT5) or test (unit testing)")
    source: str = Field(default="manual", description="manual or ai")
    comment: Optional[str] = Field(default=None, max_length=50)


class OrderResponse(BaseModel):
    success: bool
    status: str
    ticket: int
    symbol: str
    action: str
    volume: float
    price: float
    sl: Optional[float] = None
    tp: Optional[float] = None
    mode: str
    source: str
    timestamp: str
    message: str


def _get_current_price(symbol: str) -> float:
    """Extract latest quote from MT5 or market_cache."""
    if os.getenv("TRADING_TEST_MODE") == "1":
        return 2700.00

    try:
        import MetaTrader5 as mt5
        if not mt5.terminal_info():
            mt5.initialize()
        if mt5.terminal_info():
            tick = mt5.symbol_info_tick(symbol)
            if tick and tick.ask > 0:
                return float(tick.ask)
    except Exception:
        pass


    sym_upper = symbol.strip().upper()
    for (cached_symbol, _interval), entry in market_cache.items():
        if (
            cached_symbol.upper() == sym_upper
            or (sym_upper.startswith("XAUUSD") and cached_symbol.upper().startswith("XAUUSD"))
        ):
            candles = entry.get("payload", {}).get("candles", [])
            if candles:
                last_candle = candles[-1]
                close_val = last_candle.get("close")
                if close_val and close_val > 0:
                    return float(close_val)

    return 2700.00


def _translate_mt5_error(retcode: int, comment: str, volume: float, symbol: str) -> str:
    """Translate MT5 error codes into clear actionable Indonesian instructions."""
    if retcode == 10027 or "AutoTrading disabled" in comment or "AutoTrading" in comment:
        return (
            "Algo Trading di MetaTrader 5 sedang NONAKTIF (AutoTrading disabled by client). "
            "Silakan aktifkan dengan cara:\n"
            "1. Klik tombol 'Algo Trading' pada toolbar atas MetaTrader 5 (atau tekan shortcut keyboard Ctrl + E) hingga icon berubah HIJAU dengan tanda play.\n"
            "2. Buka menu Tools -> Options -> tab 'Expert Advisors' -> pastikan centang 'Allow Algo Trading'."
        )
    if retcode == 10004:
        return "Requote: Harga pasar bergerak cepat saat order dikirim. Silakan coba kembali."
    if retcode == 10014:
        return f"Volume lot ({volume}) tidak valid untuk broker ini (cek minimum lot atau step lot untuk {symbol})."
    if retcode == 10015:
        return "Harga order tidak valid atau kuotasi kedaluwarsa. Periksa koneksi chart MT5."
    if retcode == 10016:
        return "Stop Loss (SL) atau Take Profit (TP) tidak valid / terlalu dekat dengan harga saat ini (melanggar Stops Level broker)."
    if retcode == 10018:
        return f"Pasar sedang tutup (Market is closed) untuk simbol {symbol}. Transaksi belum dapat diproses."
    if retcode == 10019:
        return "Margin atau saldo akun tidak mencukupi untuk membuka volume ini."
    if retcode == 10021:
        return "Tidak ada kuotasi harga aktif dari broker untuk mengeksekusi order."
    if retcode == 10030:
        return "Mode filling order tidak didukung oleh broker."
    return f"Eksekusi MT5 ditolak broker [kode {retcode}]: {comment}"


@router.post("/trade/order", response_model=OrderResponse)
def submit_trade_order(payload: OrderSubmitRequest):
    """Execute trade order directly to MetaTrader 5 (MT5)."""
    action = payload.action.strip().upper()
    if action not in {"BUY", "SELL"}:
        raise HTTPException(status_code=400, detail="Action must be BUY or SELL")

    mode = payload.mode.strip().lower()
    # Normalize 'paper' to 'demo' since paper mode is removed per user request
    if mode == "paper":
        mode = "demo"

    symbol = payload.symbol.strip()
    volume = round(float(payload.volume), 2)
    if volume <= 0:
        raise HTTPException(status_code=400, detail="Volume must be positive")

    is_test_mode = mode == "test" or os.getenv("TRADING_TEST_MODE") == "1"

    now_iso = datetime.now(timezone.utc).isoformat()
    ticket = int(time.time() * 1000) % 1_000_000_000

    if not is_test_mode:
        # DIRECT MT5 EXECUTION
        try:
            import MetaTrader5 as mt5
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="Package MetaTrader5 tidak terpasang di environment sistem."
            )

        if not mt5.terminal_info():
            if not mt5.initialize():
                err_code, err_msg = mt5.last_error()
                raise HTTPException(
                    status_code=503,
                    detail=f"Koneksi ke terminal MetaTrader 5 gagal: {err_msg} (kode {err_code}). Pastikan aplikasi MT5 sedang terbuka."
                )

        # 1. Check account safety (DEMO ONLY, block REAL/CONTEST)
        acc = mt5.account_info()
        if acc is None:
            raise HTTPException(status_code=503, detail="Tidak dapat membaca informasi akun dari MetaTrader 5.")

        if acc.trade_mode != mt5.ACCOUNT_TRADE_MODE_DEMO:
            record("WARN", "trade", f"Order ditolak: Akun #{acc.login} berstatus non-DEMO ({acc.trade_mode}).")
            raise HTTPException(
                status_code=403,
                detail="AKSI DITOLAK: Sistem hanya mengizinkan eksekusi pada akun DEMO. Akun REAL / CONTEST diblokir mutlak demi keselamatan modal."
            )

        # 2. Check AlgoTrading toggle in terminal
        term = mt5.terminal_info()
        if term is not None and hasattr(term, "trade_allowed") and not term.trade_allowed:
            record("WARN", "trade", "Order ditolak: Algo Trading disabled in MT5 terminal.")
            raise HTTPException(
                status_code=400,
                detail=(
                    "Algo Trading di MetaTrader 5 sedang NONAKTIF (AutoTrading disabled by client).\n\n"
                    "Cara mengaktifkan:\n"
                    "1. Klik tombol 'Algo Trading' di toolbar atas MT5 (atau tekan Ctrl + E) hingga icon berwarna HIJAU.\n"
                    "2. Buka Tools -> Options -> Expert Advisors -> pastikan centang 'Allow Algo Trading'."
                )
            )

        # 3. Verify symbol and market quote
        mt5.symbol_select(symbol, True)
        sym_info = mt5.symbol_info(symbol)
        if sym_info is None:
            raise HTTPException(
                status_code=400,
                detail=f"Simbol '{symbol}' tidak ditemukan pada broker MetaTrader 5 Anda. Periksa Market Watch."
            )

        tick = mt5.symbol_info_tick(symbol)
        if tick is None or (action == "BUY" and tick.ask <= 0) or (action == "SELL" and tick.bid <= 0):
            raise HTTPException(
                status_code=503,
                detail=f"Tidak ada kuotasi harga aktif (tick) untuk simbol {symbol}. Pastikan chart berjalan."
            )

        digits = getattr(sym_info, "digits", 2)
        fill_price = tick.ask if action == "BUY" else tick.bid

        # Validate SL and TP against live market price
        sl = float(payload.sl) if payload.sl is not None and payload.sl > 0 else None
        tp = float(payload.tp) if payload.tp is not None and payload.tp > 0 else None

        if sl is not None:
            if action == "BUY" and sl >= fill_price:
                raise HTTPException(
                    status_code=400,
                    detail=f"Untuk BUY, Stop Loss ({sl}) harus berada di bawah harga entri pasar ({fill_price:.{digits}f})"
                )
            if action == "SELL" and sl <= fill_price:
                raise HTTPException(
                    status_code=400,
                    detail=f"Untuk SELL, Stop Loss ({sl}) harus berada di atas harga entri pasar ({fill_price:.{digits}f})"
                )

        if tp is not None:
            if action == "BUY" and tp <= fill_price:
                raise HTTPException(
                    status_code=400,
                    detail=f"Untuk BUY, Take Profit ({tp}) harus berada di atas harga entri pasar ({fill_price:.{digits}f})"
                )
            if action == "SELL" and tp >= fill_price:
                raise HTTPException(
                    status_code=400,
                    detail=f"Untuk SELL, Take Profit ({tp}) harus berada di bawah harga entri pasar ({fill_price:.{digits}f})"
                )

        # 4. Resolve dynamic filling mode
        fm = getattr(sym_info, "filling_mode", 0)
        if fm & 2:
            type_filling = mt5.ORDER_FILLING_IOC
        elif fm & 1:
            type_filling = mt5.ORDER_FILLING_FOK
        else:
            type_filling = mt5.ORDER_FILLING_RETURN

        order_type = mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL
        comment_str = payload.comment or f"Aurum_{payload.source[:2]}_{int(time.time()) % 10000}"

        request_dict = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": round(fill_price, digits),
            "sl": round(sl, digits) if sl else 0.0,
            "tp": round(tp, digits) if tp else 0.0,
            "deviation": 25,
            "magic": 998877,
            "comment": comment_str[:31],
            "type_filling": type_filling,
        }

        res = mt5.order_send(request_dict)
        if res is None:
            err_code, err_msg = mt5.last_error()
            raise HTTPException(
                status_code=502,
                detail=f"Eksekusi MT5 gagal: {err_msg} (kode {err_code})"
            )

        if res.retcode != mt5.TRADE_RETCODE_DONE:
            error_explanation = _translate_mt5_error(res.retcode, res.comment or "", volume, symbol)
            record("ERROR", "trade", f"MT5 order_send rejected: retcode={res.retcode}, comment={res.comment}")
            raise HTTPException(status_code=400, detail=error_explanation)

        ticket = res.order or res.deal or ticket
        fill_price = res.price if res.price > 0 else fill_price

    else:
        # TEST/SIMULATION PATH (used exclusively by unit tests)
        current_price = _get_current_price(symbol)
        spread = 0.20 if "XAU" in symbol.upper() or "GOLD" in symbol.upper() else 0.0002
        fill_price = current_price + (spread if action == "BUY" else 0.0)

        sl = float(payload.sl) if payload.sl is not None and payload.sl > 0 else None
        tp = float(payload.tp) if payload.tp is not None and payload.tp > 0 else None

        if sl is not None:
            if action == "BUY" and sl >= fill_price:
                raise HTTPException(status_code=400, detail=f"Untuk order BUY, Stop Loss ({sl}) harus berada di bawah harga entri ({fill_price:.2f})")
            if action == "SELL" and sl <= fill_price:
                raise HTTPException(status_code=400, detail=f"Untuk order SELL, Stop Loss ({sl}) harus berada di atas harga entri ({fill_price:.2f})")

        _active_positions.insert(0, {
            "ticket": ticket,
            "symbol": symbol,
            "action": action,
            "volume": volume,
            "entry_price": round(fill_price, 2),
            "sl": round(sl, 2) if sl else None,
            "tp": round(tp, 2) if tp else None,
            "mode": mode,
            "open_time": now_iso,
        })

    # Record order details in history
    order_record = {
        "ticket": ticket,
        "symbol": symbol,
        "action": action,
        "volume": volume,
        "price": round(fill_price, 2),
        "sl": round(sl, 2) if sl else None,
        "tp": round(tp, 2) if tp else None,
        "mode": "MT5 DEMO" if not is_test_mode else "TEST",
        "source": payload.source,
        "status": "FILLED",
        "timestamp": now_iso,
        "message": f"Order {action} {volume} {symbol} sukses dieksekusi di MT5.",
    }

    _orders_history.insert(0, order_record)
    if len(_orders_history) > 200:
        _orders_history.pop()

    # Persist to local SQLite trade_records
    try:
        from app.db.session import SessionLocal
        from app.models.trading import TradeRecord
        db_session = SessionLocal()
        try:
            magic_num = 889900 if payload.source.lower() == "ai" else 998877
            rec = TradeRecord(
                ticket=ticket,
                order_id=ticket,
                symbol=symbol,
                action=action,
                volume=volume,
                price=fill_price,
                sl=sl,
                tp=tp,
                profit=0.0,
                source=payload.source.lower(),
                magic=magic_num,
                comment=comment_str if 'comment_str' in locals() else f"Aurum_{payload.source}",
                status="OPEN",
            )
            db_session.add(rec)
            db_session.commit()
        except Exception:
            db_session.rollback()
        finally:
            db_session.close()
    except Exception:
        pass

    record("INFO", "trade", f"Order {action} {volume} {symbol} @ {fill_price:.2f} (MT5 DEMO) oleh {payload.source} - Ticket #{ticket}")


    return OrderResponse(
        success=True,
        status="FILLED",
        ticket=ticket,
        symbol=symbol,
        action=action,
        volume=volume,
        price=round(fill_price, 2),
        sl=round(sl, 2) if sl else None,
        tp=round(tp, 2) if tp else None,
        mode="MT5 DEMO" if not is_test_mode else "TEST",
        source=payload.source,
        timestamp=now_iso,
        message=f"Order {action} {volume} {symbol} berhasil dieksekusi langsung ke MetaTrader 5 pada harga {fill_price:.2f} (Ticket #{ticket})",
    )


@router.get("/trade/orders")
def get_orders_history():
    """Retrieve history of executed orders."""
    return {"orders": _orders_history}


@router.get("/trade/positions")
def get_active_positions():
    """Retrieve live active open positions directly from MetaTrader 5."""
    if os.getenv("TRADING_TEST_MODE") != "1":
        try:
            import MetaTrader5 as mt5
            if not mt5.terminal_info():
                mt5.initialize()
            if mt5.terminal_info():
                mt5_positions = mt5.positions_get()
                if mt5_positions is not None:
                    live_positions = []
                    for p in mt5_positions:
                        action_str = "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL"
                        open_time_iso = datetime.fromtimestamp(p.time, timezone.utc).isoformat()
                        magic = int(getattr(p, "magic", 0))
                        comment = str(getattr(p, "comment", "") or "")
                        source_type = "ai" if (magic == 889900 or "AI" in comment.upper()) else "manual"
                        live_positions.append({
                            "ticket": p.ticket,
                            "symbol": p.symbol,
                            "action": action_str,
                            "volume": round(float(p.volume), 2),
                            "entry_price": round(float(p.price_open), 2),
                            "current_price": round(float(p.price_current), 2) if hasattr(p, "price_current") else None,
                            "sl": round(float(p.sl), 2) if p.sl > 0 else None,
                            "tp": round(float(p.tp), 2) if p.tp > 0 else None,
                            "profit": round(float(p.profit), 2) if hasattr(p, "profit") else 0.0,
                            "magic": magic,
                            "comment": comment,
                            "source": source_type,
                            "mode": "MT5 DEMO",
                            "open_time": open_time_iso,
                        })
                    return {"positions": live_positions}
        except Exception:
            pass

    # Fallback for test mode: ensure profit & current_price exist
    for p in _active_positions:
        if "profit" not in p or p["profit"] is None:
            cur_p = _get_current_price(p["symbol"])
            p["current_price"] = cur_p
            p["profit"] = 0.0

    return {"positions": _active_positions}


class ClosePositionPayload(BaseModel):
    volume: Optional[float] = Field(default=None, description="Volume parsial yang ingin ditutup. Jika kosong, menutup seluruh posisi.")


@router.post("/trade/positions/{ticket}/close")
def close_position(ticket: int, payload: Optional[ClosePositionPayload] = None):
    """Close an active position (full or partial) directly in MetaTrader 5."""
    global _active_positions
    req_vol = float(payload.volume) if payload and payload.volume is not None and payload.volume > 0 else None

    # 1. Try closing via MT5 directly if not in test mode
    if os.getenv("TRADING_TEST_MODE") != "1":
        try:
            import MetaTrader5 as mt5
            if not mt5.terminal_info():
                mt5.initialize()
            if mt5.terminal_info():
                positions = mt5.positions_get(ticket=ticket)
                if positions:
                    pos = positions[0]
                    tick = mt5.symbol_info_tick(pos.symbol)
                    if not tick:
                        raise HTTPException(status_code=502, detail=f"Tidak ada kuotasi harga untuk {pos.symbol}")

                    order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                    close_price = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask

                    sym_info = mt5.symbol_info(pos.symbol)
                    fm = getattr(sym_info, "filling_mode", 0)
                    if fm & 2:
                        type_filling = mt5.ORDER_FILLING_IOC
                    elif fm & 1:
                        type_filling = mt5.ORDER_FILLING_FOK
                    else:
                        type_filling = mt5.ORDER_FILLING_RETURN

                    # Check partial volume
                    is_partial = req_vol is not None and req_vol < float(pos.volume)
                    close_vol = round(req_vol, 2) if is_partial else float(pos.volume)

                    close_req = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "position": pos.ticket,
                        "symbol": pos.symbol,
                        "volume": close_vol,
                        "type": order_type,
                        "price": close_price,
                        "deviation": 25,
                        "magic": 998877,
                        "comment": f"Close_{ticket}" if not is_partial else f"PartClose_{ticket}",
                        "type_filling": type_filling,
                    }
                    res = mt5.order_send(close_req)
                    if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
                        err_msg = res.comment if res else str(mt5.last_error())
                        if res and res.retcode == 10027:
                            err_msg = "Algo Trading di MT5 sedang nonaktif. Aktifkan tombol 'Algo Trading' di toolbar MT5 (Ctrl+E)."
                        raise HTTPException(status_code=502, detail=f"Gagal menutup posisi #{ticket} di MT5: {err_msg}")

                    action_msg = f"Posisi #{ticket} ({pos.symbol}) berhasil ditutup parsial ({close_vol} Lot) pada harga {close_price:.2f}." if is_partial else f"Posisi #{ticket} ({pos.symbol}) berhasil ditutup penuh pada harga {close_price:.2f}."
                    record("INFO", "trade", action_msg)
                    return {"success": True, "message": action_msg, "is_partial": is_partial, "closed_volume": close_vol}
        except HTTPException:
            raise
        except Exception as exc:
            record("WARN", "trade", f"MT5 close error: {exc}")

    # Fallback for test mode
    matched = [p for p in _active_positions if p["ticket"] == ticket]
    if not matched:
        raise HTTPException(status_code=404, detail="Posisi tidak ditemukan")

    pos = matched[0]
    is_partial = req_vol is not None and req_vol < pos["volume"]
    close_vol = round(req_vol, 2) if is_partial else pos["volume"]

    if is_partial:
        pos["volume"] = round(pos["volume"] - close_vol, 2)
        msg = f"Posisi #{ticket} berhasil ditutup parsial ({close_vol} Lot). Sisa {pos['volume']} Lot."
    else:
        _active_positions = [p for p in _active_positions if p["ticket"] != ticket]
        msg = f"Posisi #{ticket} berhasil ditutup penuh."

    record("INFO", "trade", msg)
    return {"success": True, "message": msg, "is_partial": is_partial, "closed_volume": close_vol}


@router.post("/trade/positions/close-all")
def close_all_positions():
    """Emergency close all active open positions in one execution."""
    global _active_positions
    is_test = os.getenv("TRADING_TEST_MODE") == "1"

    if not is_test:
        try:
            import MetaTrader5 as mt5
            if not mt5.terminal_info():
                mt5.initialize()
            if mt5.terminal_info():
                positions = mt5.positions_get()
                if not positions:
                    return {"success": True, "closed_count": 0, "message": "Tidak ada posisi terbuka yang perlu ditutup."}

                closed_count = 0
                errors = []
                for pos in positions:
                    tick = mt5.symbol_info_tick(pos.symbol)
                    if not tick:
                        errors.append(f"#{pos.ticket}: no tick")
                        continue
                    order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                    close_price = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask

                    sym_info = mt5.symbol_info(pos.symbol)
                    fm = getattr(sym_info, "filling_mode", 0)
                    type_filling = mt5.ORDER_FILLING_IOC if fm & 2 else (mt5.ORDER_FILLING_FOK if fm & 1 else mt5.ORDER_FILLING_RETURN)

                    close_req = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "position": pos.ticket,
                        "symbol": pos.symbol,
                        "volume": pos.volume,
                        "type": order_type,
                        "price": close_price,
                        "deviation": 25,
                        "magic": 998877,
                        "comment": f"CloseAll_{pos.ticket}",
                        "type_filling": type_filling,
                    }
                    res = mt5.order_send(close_req)
                    if res and res.retcode == mt5.TRADE_RETCODE_DONE:
                        closed_count += 1
                    else:
                        err_str = res.comment if res else str(mt5.last_error())
                        errors.append(f"#{pos.ticket}: {err_str}")

                msg = f"Berhasil menutup {closed_count} dari {len(positions)} posisi terbuka."
                if errors:
                    msg += f" (Sebagian gagal: {', '.join(errors[:2])})"
                record("INFO", "trade", f"Close All: {msg}")
                return {"success": closed_count > 0 or not errors, "closed_count": closed_count, "message": msg}
        except Exception as exc:
            record("WARN", "trade", f"Close All MT5 error: {exc}")

    # Fallback for test mode
    count = len(_active_positions)
    _active_positions.clear()
    record("INFO", "trade", f"Close All (Test Mode): {count} posisi ditutup.")
    return {"success": True, "closed_count": count, "message": f"Berhasil menutup seluruh {count} posisi terbuka."}
