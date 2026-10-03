import streamlit as st
import pandas as pd
import json
from datetime import datetime, timezone
from trading_agent.config import load_config
from trading_agent.adapters.mock import MockAdapter
from trading_agent.adapters.mt5 import MT5Adapter
from trading_agent.storage import StorageManager
from trading_agent.backtest import BacktestEngine
from trading_agent.engine import TradingEngineWorker

st.set_page_config(page_title="Local Trading Agent - MT5 + Exness", layout="wide")

@st.cache_resource
def get_config():
    return load_config()

@st.cache_resource
def get_storage():
    cfg = get_config()
    return StorageManager(db_path=cfg.db_path)

def main():
    config = get_config()
    storage = get_storage()

    st.title("Local Trading Agent - MT5 + Exness (MVP v1.0)")

    # Status Banner
    if "mode_state" not in st.session_state:
        st.session_state.mode_state = config.mode.upper()
    if "armed_demo" not in st.session_state:
        st.session_state.armed_demo = False

    mode = st.session_state.mode_state
    if mode == "DEMO" and not st.session_state.armed_demo:
        banner_color = "orange"
        banner_text = "PAUSED (DEMO Not Armed)"
    elif mode == "DEMO" and st.session_state.armed_demo:
        banner_color = "red"
        banner_text = "DEMO EXECUTION ACTIVE"
    elif mode == "PAPER":
        banner_color = "green"
        banner_text = "PAPER TRADING (Simulated Mock)"
    else:
        banner_color = "gray"
        banner_text = "PAUSED"

    st.markdown(f"### STATUS: :{banner_color}[**{banner_text}**]")

    # Sidebar Controls
    st.sidebar.header("Kontrol Agent & Konfigurasi")
    st.sidebar.write(f"**Data Source:** `{config.data_source.upper()}`")
    st.sidebar.write(f"**Symbol:** `{config.symbol or config.reference_symbol}`")
    st.sidebar.write(f"**Timeframe:** `{config.timeframe}`")
    st.sidebar.write(f"**Strategy:** `{config.strategy_version}`")

    st.sidebar.markdown("---")
    st.sidebar.subheader("Mode & Security Control")

    if st.sidebar.button("Start Paper Trading Mode"):
        st.session_state.mode_state = "PAPER"
        st.session_state.armed_demo = False
        st.rerun()

    if st.sidebar.button("ARM DEMO EXECUTION", type="primary"):
        st.session_state.mode_state = "DEMO"
        st.session_state.armed_demo = True
        st.success("DEMO Execution Armed for current session!")
        st.rerun()

    if st.sidebar.button("Pause Agent"):
        st.session_state.mode_state = "PAUSED"
        st.session_state.armed_demo = False
        st.rerun()

    if st.sidebar.button("Reset Risk Locks"):
        storage.release_risk_locks("12345678_MOCK", "Exness-Trial-Mock")
        st.success("Risk locks released!")

    # Tabs
    tab_dashboard, tab_backtest, tab_ledger, tab_logs = st.tabs(["Dashboard", "Backtest Engine", "Order Ledger", "Audit & Events"])

    # Tab 1: Dashboard
    with tab_dashboard:
        col1, col2, col3, col4 = st.columns(4)
        
        # Connect adapter for metrics
        try:
            adapter = MT5Adapter() if config.data_source == "mt5" else MockAdapter(symbol=config.symbol or config.reference_symbol)
            adapter.connect()
            acc = adapter.account_snapshot()
            tick = adapter.latest_tick(config.symbol or config.reference_symbol)
        except Exception as e:
            st.error(f"Adapter connection error: {e}")
            acc = None
            tick = None

        if acc:
            col1.metric("Balance", f"${acc.balance:,.2f}")
            col2.metric("Equity", f"${acc.equity:,.2f}")
            col3.metric("Trade Mode", acc.trade_mode)
            col4.metric("Server", acc.server)

        if tick:
            st.markdown("#### Real-time Quote")
            qcol1, qcol2, qcol3 = st.columns(3)
            qcol1.metric("Bid", f"{tick.bid:.2f}")
            qcol2.metric("Ask", f"{tick.ask:.2f}")
            qcol3.metric("Spread", f"{tick.spread:.2f}")

        st.markdown("---")
        st.subheader("Persistent Risk Locks & Baseline")
        locks = storage.get_active_risk_locks(acc.account_id if acc else "12345678_MOCK", acc.server if acc else "Exness-Trial-Mock")
        if locks:
            for l in locks:
                st.warning(f"**LOCK ACTIVE [{l['lock_type']}]:** {l['reason']} (Locked at {l['locked_at']})")
        else:
            st.success("No active risk locks. Account is clear for trading.")

    # Tab 2: Backtest
    with tab_backtest:
        st.subheader("Historical & Synthetic Backtest Engine")
        if st.button("Run Quick Backtest"):
            adapter = MockAdapter(symbol=config.symbol or config.reference_symbol)
            candles = adapter.closed_bars(config.symbol or config.reference_symbol, config.timeframe, count=800)
            bt_engine = BacktestEngine(config)
            res = bt_engine.run_backtest(candles)

            st.success(f"Backtest Completed! Net Return: ${res['net_return']:.2f} ({res['net_return_pct']:.2f}%)")
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Total Trades", res["total_trades"])
            m2.metric("Win Rate", f"{res['win_rate_pct']:.2f}%")
            m3.metric("Profit Factor", res["profit_factor"])
            m4.metric("Max Drawdown", f"{res['max_drawdown_pct']:.2f}%")

            df_eq = pd.DataFrame(res["equity_curve"])
            if not df_eq.empty:
                st.line_chart(df_eq.set_index("time")[["equity", "balance"]])

            df_trades = pd.DataFrame(res["trades"])
            if not df_trades.empty:
                st.dataframe(df_trades)

    # Tab 3: Order Ledger
    with tab_ledger:
        st.subheader("Order Intents & Execution State Ledger")
        with storage._get_connection() as conn:
            rows = conn.execute("SELECT * FROM order_intents ORDER BY created_at DESC LIMIT 50").fetchall()
            intents = [dict(r) for r in rows]
        if intents:
            st.dataframe(pd.DataFrame(intents))
        else:
            st.info("No order intents recorded yet in database.")

    # Tab 4: Audit Logs
    with tab_logs:
        st.subheader("Append-Only State Machine Execution Events")
        with storage._get_connection() as conn:
            rows = conn.execute("SELECT * FROM execution_events ORDER BY created_at DESC LIMIT 100").fetchall()
            events = [dict(r) for r in rows]
        if events:
            st.dataframe(pd.DataFrame(events))
        else:
            st.info("No execution events recorded yet.")

if __name__ == "__main__":
    main()
