from typing import List, Dict, Any
from trading_agent.storage import StorageManager
from trading_agent.adapters.base import BaseAdapter

class ReconciliationEngine:
    """Reconciles in-flight order intents with actual terminal deals and positions."""

    def __init__(self, storage: StorageManager):
        self.storage = storage

    def reconcile_unknown_intents(self, adapter: BaseAdapter, symbol: str) -> Dict[str, Any]:
        """Match UNKNOWN intents against broker deal history and positions."""
        deals = adapter.deal_history(symbol=symbol, count=50)
        positions = adapter.open_positions(symbol=symbol)

        reconciled_count = 0
        unresolved_count = 0

        # Query all UNKNOWN or SUBMITTING intents in storage
        with self.storage._get_connection() as conn:
            rows = conn.execute("SELECT * FROM order_intents WHERE status IN ('SUBMITTING', 'UNKNOWN')").fetchall()
            intents = [dict(r) for r in rows]

        for intent in intents:
            key = intent["idempotency_key"]
            sub_key = key[:8]
            matched_deal = None

            # Match against deal comment or position magic/comment
            for d in deals:
                comment = str(d.get("comment", ""))
                if sub_key in comment:
                    matched_deal = d
                    break

            if not matched_deal:
                for p in positions:
                    comment = str(p.get("comment", ""))
                    if sub_key in comment:
                        matched_deal = p
                        break

            if matched_deal:
                ticket = matched_deal.get("deal_ticket") or matched_deal.get("ticket") or matched_deal.get("order")
                price = float(matched_deal.get("price") or matched_deal.get("price_open") or 0.0)
                vol = float(matched_deal.get("volume") or 0.0)
                status = "FILLED" if vol >= intent["requested_volume"] else "PARTIAL"

                self.storage.update_order_intent_status(
                    key,
                    status,
                    deal_ticket=ticket,
                    filled_volume=vol,
                    filled_price=price,
                    reject_reason="Reconciled successfully from terminal deal history"
                )
                reconciled_count += 1
            else:
                # Still ambiguous -> keep UNKNOWN (AC11)
                self.storage.update_order_intent_status(key, "UNKNOWN", reject_reason="Unresolved during startup reconciliation")
                unresolved_count += 1

        return {
            "reconciled": reconciled_count,
            "unresolved": unresolved_count,
            "requires_pause": unresolved_count > 0
        }
