import os
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/finance", tags=["Finance & Performance"])


def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        # Handles YYYY-MM-DD or ISO strings
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _save_deals_to_sqlite(deals: List[dict]):
    """Persist deals to SQLite database table trade_records."""
    try:
        from app.db.session import SessionLocal
        from app.models.trading import TradeRecord

        db = SessionLocal()
        try:
            for item in deals:
                ticket_val = int(item["ticket"])
                existing = db.query(TradeRecord).filter(TradeRecord.ticket == ticket_val).first()
                if not existing:
                    dt = _parse_date(item.get("time"))
                    record = TradeRecord(
                        ticket=ticket_val,
                        order_id=item.get("order"),
                        symbol=item.get("symbol", "XAUUSDm"),
                        action=item.get("action", "BUY"),
                        volume=item.get("volume", 0.01),
                        price=item.get("price"),
                        profit=item.get("profit", 0.0),
                        source=item.get("source", "manual"),
                        magic=item.get("magic", 0),
                        comment=item.get("comment", ""),
                        status="CLOSED",
                        deal_time=dt,
                    )
                    db.add(record)
                else:
                    existing.profit = item.get("profit", existing.profit)
                    existing.source = item.get("source", existing.source)
                    existing.magic = item.get("magic", existing.magic)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
    except Exception:
        pass


@router.get("/overview")
def get_finance_overview(
    period: str = Query("daily", description="daily, weekly, monthly, yearly, custom"),
    start_date: Optional[str] = Query(None, description="Start date for custom filter (ISO or YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom filter (ISO or YYYY-MM-DD)"),
):
    """Retrieve financial performance metrics, closed deal history, and active/pending counts for the selected timeframe."""
    now = datetime.now(timezone.utc)
    period_lower = period.strip().lower()

    if period_lower == "daily":
        from_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        to_dt = now
        label = "Harian (Hari Ini)"
    elif period_lower == "weekly":
        from_dt = now - timedelta(days=7)
        to_dt = now
        label = "Mingguan (7 Hari Terakhir)"
    elif period_lower == "monthly":
        from_dt = now - timedelta(days=30)
        to_dt = now
        label = "Bulanan (30 Hari Terakhir)"
    elif period_lower == "yearly":
        from_dt = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        to_dt = now
        label = f"Tahunan ({now.year})"
    elif period_lower == "custom":
        parsed_start = _parse_date(start_date)
        parsed_end = _parse_date(end_date)
        from_dt = parsed_start if parsed_start else (now - timedelta(days=7))
        to_dt = parsed_end if parsed_end else now
        label = f"Kustom ({from_dt.strftime('%d %b %Y')} – {to_dt.strftime('%d %b %Y')})"
    else:
        from_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        to_dt = now
        label = "Harian (Hari Ini)"

    is_test = os.getenv("TRADING_TEST_MODE") == "1"

    deals_list: List[dict] = []
    active_positions_count = 0
    active_positions_volume = 0.0
    active_floating_pnl = 0.0
    active_ai_positions = 0
    active_manual_positions = 0
    pending_orders_count = 0
    currency = "USD"

    if not is_test:
        try:
            import MetaTrader5 as mt5
            if not mt5.terminal_info():
                mt5.initialize()

            # Account info
            acc = mt5.account_info()
            if acc:
                currency = acc.currency or "USD"

            # Open positions
            positions = mt5.positions_get()
            if positions is not None:
                active_positions_count = len(positions)
                active_positions_volume = round(sum(float(getattr(p, "volume", 0.0)) for p in positions), 2)
                active_floating_pnl = round(sum(float(getattr(p, "profit", 0.0)) for p in positions), 2)
                for p in positions:
                    magic_p = getattr(p, "magic", 0)
                    comment_p = getattr(p, "comment", "") or ""
                    if magic_p == 889900 or "AI" in comment_p.upper():
                        active_ai_positions += 1
                    else:
                        active_manual_positions += 1

            # Pending orders (limit / stop / stop-limit)
            pending_orders = mt5.orders_get()
            if pending_orders is not None:
                pending_orders_count = len(pending_orders)

            # History deals
            raw_deals = mt5.history_deals_get(from_dt, to_dt)
            if raw_deals:
                for d in raw_deals:
                    # Filter for closed deals (entry 1=OUT or 2=INOUT)
                    if getattr(d, "entry", 0) in (1, 2):
                        deal_pnl = float(d.profit) + float(d.swap) + float(d.commission)
                        action_str = "BUY" if d.type == 0 else "SELL"
                        deal_time_iso = datetime.fromtimestamp(d.time, timezone.utc).isoformat()
                        magic = int(getattr(d, "magic", 0))
                        comment = str(getattr(d, "comment", "") or "")
                        # Source classification: magic 889900 or comment has AI -> ai, else manual
                        is_ai = magic == 889900 or "AI" in comment.upper() or "AUTOPILOT" in comment.upper()
                        source_type = "ai" if is_ai else "manual"

                        deals_list.append({
                            "ticket": int(d.ticket),
                            "order": int(d.order),
                            "symbol": d.symbol or "XAUUSDm",
                            "action": action_str,
                            "volume": round(float(d.volume), 2),
                            "price": round(float(d.price), 3),
                            "profit": round(deal_pnl, 2),
                            "time": deal_time_iso,
                            "comment": comment,
                            "magic": magic,
                            "source": source_type,
                        })
        except Exception:
            pass

    # Fallback / mock data for test mode if empty
    if is_test and not deals_list:
        deals_list = [
            {"ticket": 101, "order": 1, "symbol": "XAUUSDm", "action": "BUY", "volume": 0.1, "price": 2705.5, "profit": 35.0, "time": now.isoformat(), "comment": "AI_Auto_BUY", "magic": 889900, "source": "ai"},
            {"ticket": 102, "order": 2, "symbol": "XAUUSDm", "action": "SELL", "volume": 0.1, "price": 2710.0, "profit": -15.0, "time": now.isoformat(), "comment": "Manual Close", "magic": 998877, "source": "manual"},
            {"ticket": 103, "order": 3, "symbol": "XAUUSDm", "action": "BUY", "volume": 0.05, "price": 2708.2, "profit": 20.0, "time": now.isoformat(), "comment": "AI_Auto_BUY", "magic": 889900, "source": "ai"},
        ]
        active_positions_count = 1
        active_positions_volume = 0.05
        active_floating_pnl = 8.50
        active_ai_positions = 1
        active_manual_positions = 0
        pending_orders_count = 0

    # Persist closed deals to local SQLite database asynchronously / safely
    if deals_list:
        _save_deals_to_sqlite(deals_list)

    # Calculate financial metrics
    total_trades = len(deals_list)
    net_profit = round(sum(d["profit"] for d in deals_list), 2)
    winning_deals = [d for d in deals_list if d["profit"] > 0]
    losing_deals = [d for d in deals_list if d["profit"] < 0]
    wins_count = len(winning_deals)
    losses_count = len(losing_deals)
    gross_profit = round(sum(d["profit"] for d in winning_deals), 2)
    gross_loss = round(sum(d["profit"] for d in losing_deals), 2)

    profit_factor = round(abs(gross_profit / gross_loss), 2) if gross_loss != 0 else (99.0 if gross_profit > 0 else 0.0)
    win_rate = round((wins_count / total_trades) * 100, 1) if total_trades > 0 else 0.0
    avg_trade_profit = round(net_profit / total_trades, 2) if total_trades > 0 else 0.0

    # AI vs Manual Breakdown
    ai_deals = [d for d in deals_list if d.get("source") == "ai"]
    manual_deals = [d for d in deals_list if d.get("source") == "manual"]
    ai_profit = round(sum(d["profit"] for d in ai_deals), 2)
    manual_profit = round(sum(d["profit"] for d in manual_deals), 2)
    ai_trades_count = len(ai_deals)
    manual_trades_count = len(manual_deals)

    # Daily breakdown
    daily_groups: Dict[str, Dict[str, Any]] = {}
    for d in deals_list:
        day_str = d["time"][:10]
        if day_str not in daily_groups:
            daily_groups[day_str] = {"date": day_str, "profit": 0.0, "trades": 0, "wins": 0, "losses": 0}
        daily_groups[day_str]["profit"] = round(daily_groups[day_str]["profit"] + d["profit"], 2)
        daily_groups[day_str]["trades"] += 1
        if d["profit"] > 0:
            daily_groups[day_str]["wins"] += 1
        elif d["profit"] < 0:
            daily_groups[day_str]["losses"] += 1

    daily_breakdown = sorted(daily_groups.values(), key=lambda x: x["date"], reverse=True)

    return {
        "period": period_lower,
        "period_label": label,
        "start_date": from_dt.isoformat(),
        "end_date": to_dt.isoformat(),
        "currency": currency,
        "net_profit": net_profit,
        "gross_profit": gross_profit,
        "gross_loss": gross_loss,
        "profit_factor": profit_factor,
        "trades_count": total_trades,
        "winning_trades": wins_count,
        "losing_trades": losses_count,
        "win_rate": win_rate,
        "avg_trade_profit": avg_trade_profit,
        "ai_profit": ai_profit,
        "manual_profit": manual_profit,
        "ai_trades_count": ai_trades_count,
        "manual_trades_count": manual_trades_count,
        "active_positions_count": active_positions_count,
        "active_positions_volume": active_positions_volume,
        "active_floating_pnl": active_floating_pnl,
        "active_ai_positions": active_ai_positions,
        "active_manual_positions": active_manual_positions,
        "pending_orders_count": pending_orders_count,
        "deals": deals_list[:50],  # Return up to 50 latest closed deals
        "daily_breakdown": daily_breakdown,
    }



@router.get("/pending-orders")
def get_pending_orders():
    """Retrieve active pending orders (Stop / Limit / Stop-Limit)."""
    is_test = os.getenv("TRADING_TEST_MODE") == "1"
    if is_test:
        return {"orders": []}

    pending_list = []
    try:
        import MetaTrader5 as mt5
        if not mt5.terminal_info():
            mt5.initialize()
        orders = mt5.orders_get()
        if orders:
            order_type_map = {
                2: "BUY_LIMIT",
                3: "SELL_LIMIT",
                4: "BUY_STOP",
                5: "SELL_STOP",
                6: "BUY_STOP_LIMIT",
                7: "SELL_STOP_LIMIT",
            }
            for o in orders:
                type_name = order_type_map.get(o.type, f"TYPE_{o.type}")
                setup_time_iso = datetime.fromtimestamp(o.time_setup, timezone.utc).isoformat()
                pending_list.append({
                    "ticket": int(o.ticket),
                    "symbol": o.symbol,
                    "type": type_name,
                    "volume": round(float(o.volume_initial), 2),
                    "price_open": round(float(o.price_open), 2),
                    "sl": round(float(o.sl), 2) if o.sl > 0 else None,
                    "tp": round(float(o.tp), 2) if o.tp > 0 else None,
                    "time_setup": setup_time_iso,
                    "comment": o.comment or "",
                })
    except Exception:
        pass

    return {"orders": pending_list}
