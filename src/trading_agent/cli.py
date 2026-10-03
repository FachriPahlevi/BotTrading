import sys
import argparse
import yaml
import json
import pandas as pd
from trading_agent.config import load_config
from trading_agent.models import Candle
from trading_agent.adapters.mock import MockAdapter
from trading_agent.adapters.mt5 import MT5Adapter
from trading_agent.engine import TradingEngineWorker
from trading_agent.backtest import BacktestEngine

def run_doctor(config_path: str = None):
    print("=== TRADING AGENT DOCTOR REPORT ===")
    config = load_config(config_path)
    print(f"Config loaded: Mode={config.mode}, Source={config.data_source}, Symbol={config.symbol or config.reference_symbol}")
    print(f"Strategy: {config.strategy_version} (EMA {config.ema_fast}/{config.ema_slow}/{config.ema_trend}, ATR {config.atr_period})")

    # Python version
    print(f"Python Version: {sys.version.split()[0]}")

    # MetaTrader5 package check
    try:
        import MetaTrader5 as mt5
        print(f"MetaTrader5 package: Installed (v{getattr(mt5, '__version__', 'unknown')})")
        mt5_available = True
    except ImportError:
        print("MetaTrader5 package: NOT INSTALLED (Offline mock adapter will be used)")
        mt5_available = False

    # Adapter capability check
    if config.data_source == "mt5":
        if not mt5_available:
            print("[FAIL] data_source=mt5 configured but MetaTrader5 package is missing!")
            return
        adapter = MT5Adapter()
        if adapter.connect():
            acc = adapter.account_snapshot()
            print(f"[OK] MT5 Terminal Connected: Login={acc.account_id}, Server={acc.server}, Mode={acc.trade_mode}, Balance=${acc.balance:.2f}")
            if not acc.is_demo():
                print("[WARNING] REAL/CONTEST account detected! Agent will reject order execution in demo mode.")
            adapter.disconnect()
        else:
            print("[FAIL] MT5 Terminal connection failed. Is MT5 desktop running and logged in?")
    else:
        adapter = MockAdapter(symbol=config.symbol or config.reference_symbol)
        acc = adapter.account_snapshot()
        print(f"[OK] Mock Adapter Ready: Account={acc.account_id}, Server={acc.server}, Mode={acc.trade_mode}, Balance=${acc.balance:.2f}")

    print("=== DOCTOR CHECK COMPLETED ===")

def run_symbols(config_path: str = None):
    config = load_config(config_path)
    adapter = MT5Adapter() if config.data_source == "mt5" else MockAdapter(symbol=config.symbol or config.reference_symbol)
    if not adapter.connect():
        print("Failed to connect adapter")
        return
    sym = config.symbol or config.reference_symbol
    spec = adapter.symbol_info(sym)
    print(f"Symbol Specification for {spec.symbol}:")
    print(f"  Digits: {spec.digits}")
    print(f"  Contract Size: {spec.contract_size}")
    print(f"  Min Volume: {spec.volume_min}")
    print(f"  Volume Step: {spec.volume_step}")
    print(f"  Stops Level: {spec.stops_level}")
    adapter.disconnect()

def run_backtest(config_path: str = None, csv_path: str = None, export_path: str = None):
    config = load_config(config_path)
    sym = config.symbol or config.reference_symbol

    if csv_path:
        print(f"Loading candles from CSV: {csv_path}")
        df = pd.read_csv(csv_path)
        candles = []
        for idx, row in df.iterrows():
            candles.append(Candle(
                time=pd.to_datetime(row["time"]).to_pydatetime(),
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row.get("volume", 100))
            ))
    else:
        print("Generating synthetic candle data for backtest...")
        adapter = MockAdapter(symbol=sym)
        candles = adapter.closed_bars(sym, config.timeframe, count=1000)

    engine = BacktestEngine(config)
    res = engine.run_backtest(candles)

    print("\n=== BACKTEST RESULTS ===")
    print(f"Initial Balance  : ${res['initial_balance']:.2f}")
    print(f"Final Balance    : ${res['final_balance']:.2f}")
    print(f"Net Return       : ${res['net_return']:.2f} ({res['net_return_pct']:.2f}%)")
    print(f"Total Trades     : {res['total_trades']}")
    print(f"Win Rate         : {res['win_rate_pct']:.2f}%")
    print(f"Profit Factor    : {res['profit_factor']}")
    print(f"Max Drawdown     : {res['max_drawdown_pct']:.2f}%")
    print(f"Expectancy/Trade : ${res['expectancy_per_trade']:.2f}")
    print(f"Total Commission : ${res['total_commission']:.2f}")

    if export_path:
        engine.export_csv(res, export_path)
        print(f"Results exported to {export_path}")

def run_worker(mode: str = "paper", config_path: str = None):
    config = load_config(config_path)
    config.mode = mode
    worker = TradingEngineWorker(config)

    try:
        worker.acquire_process_lock()
        print(f"Starting Trading Worker [Mode={config.mode}, Symbol={config.symbol or config.reference_symbol}]...")
        worker.initialize()

        while True:
            res = worker.step()
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Step result: {res['status']} - {res.get('reason', '')}")
            time.sleep(config.polling_seconds)
    except KeyboardInterrupt:
        print("Stopping worker gracefully...")
    finally:
        worker.shutdown()

def main():
    parser = argparse.ArgumentParser(description="Local Trading Agent CLI")
    subparsers = parser.add_subparsers(dest="command")

    # doctor
    doc_p = subparsers.add_parser("doctor", help="Check runtime environment and MT5 capabilities")
    doc_p.add_argument("--config", help="Path to config.yaml")

    # symbols
    sym_p = subparsers.add_parser("symbols", help="Show symbol specs")
    sym_p.add_argument("--config", help="Path to config.yaml")

    # backtest
    bt_p = subparsers.add_parser("backtest", help="Run backtest")
    bt_p.add_argument("--config", help="Path to config.yaml")
    bt_p.add_argument("--csv", help="Path to candle CSV file")
    bt_p.add_argument("--export", help="Path to export CSV trades")

    # run
    run_p = subparsers.add_parser("run", help="Run worker process")
    run_p.add_argument("--mode", choices=["paper", "demo"], default="paper")
    run_p.add_argument("--config", help="Path to config.yaml")

    args = parser.parse_args()

    if args.command == "doctor":
        run_doctor(args.config)
    elif args.command == "symbols":
        run_symbols(args.config)
    elif args.command == "backtest":
        run_backtest(args.config, args.csv, args.export)
    elif args.command == "run":
        run_worker(args.mode, args.config)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
