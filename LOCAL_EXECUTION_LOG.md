# LOCAL EXECUTION LOG — Local Trading Agent untuk MT5 + Exness (P0 MVP)
**Versi:** 1.0  
**Tanggal:** 2026-10-03  
**Status:** IMPLEMENTASI P0 SELESAI (OFFLINE VERIFIED)

---

## 1. Persyaratan yang Selesai (Completed Requirements)

- [x] **Core Domain Decoupling**: Package `trading_agent` berdiri sendiri tanpa impor top-level `MetaTrader5`.
- [x] **Pydantic Configuration Schema**: `AppConfig` dengan prapemeriksaan validasi fast < slow < trend dan parameter risiko.
- [x] **Model Domain Tipe Dataclass/Pydantic**: `AccountSnapshot`, `SymbolSpec`, `Tick`, `Candle`, `Signal`, `RiskDecision`, `OrderIntent`, `BrokerResult`, `ExecutionRecord`.
- [x] **Indikator & Strategi Deterministik**: EMA 20/50/200 dan Wilder's ATR 14. Evaluasi sinyal BUY, SELL, HOLD secara deterministik hanya pada bar tertutup $t$.
- [x] **Risk Engine Sizing & Filters**: Sizing 0.5% equity, pembulatan lot down ke `volume_step`, penolakan lot < `volume_min`, filter ratio spread/ATR $\le 0.10$, serta guard batas posisi & intent.
- [x] **Persistent Risk Locks**: Daily Loss Guard (2%) dan Max Drawdown Guard (5%) dengan penguncian persisten di SQLite (`risk_locks`).
- [x] **Adapters & Decoupled Execution**:
  - `BaseAdapter`: Abstract interface standar.
  - `MockAdapter`: Simulasi data sintetis offline tanpa MT5.
  - `MT5Adapter`: Integrasi lazy import `MetaTrader5` dengan pemblokiran mutlak akun REAL/CONTEST dan mapping filling policy bitmask.
- [x] **Paper Broker & Backtest Engine**: Backtest kronologis dengan penanganan eksekusi open bar $t+1$, pembacaan High/Low candle, aturan kompromi SL-first (AC15), dan ekspor CSV/JSON statistik lengkap.
- [x] **Execution State Machine & Reconciliation**: Flow `CREATED` -> `VALIDATED` -> `SUBMITTING` -> `FILLED` / `PARTIAL` / `REJECTED` / `UNKNOWN`. Penanganan timeout serta rekonsiliasi deal history.
- [x] **Single-Worker Process Locking**: Kunci berkas `trading_agent.lock` untuk mencegah pembentukan dua pengirim order (*dual worker prevention*).
- [x] **CLI Subcommands**: `doctor`, `symbols`, `backtest`, dan `run`.
- [x] **Dashboard Streamlit**: Antarmuka lokal `127.0.0.1:8501` dengan banner status (`PAPER`/`DEMO`/`PAUSED`/`ERROR`), kontrol `ARM DEMO`, pembacaan real-time quote, backtest runner, serta ledger order intents & audit events.

---

## 2. Keputusan Arsitektur & Desain

1. **Lazy Loading MetaTrader5**: Mengizinkan pengujian dan eksekusi mode paper secara penuh pada platform non-Windows (Linux/macOS) tanpa error impor package.
2. **SQLite Idempotency Constraint**: Penggunaan kunci unik `account_login + server + symbol + timeframe + closed_bar_utc + strategy_version + direction` untuk menjamin tidak terjadinya eksekusi berulang pada bar yang sama.
3. **Session-based ARM DEMO Guard**: `ARM DEMO` disimpan sebagai state sesi pengguna non-persisten; saat sistem direstart, mode eksekusi secara default kembali ke `PAUSED` demi keamanan akun demo.

---

## 3. Daftar File yang Dibuat

- `src/trading_agent/__init__.py`
- `src/trading_agent/config.py`
- `src/trading_agent/models.py`
- `src/trading_agent/indicators.py`
- `src/trading_agent/strategy.py`
- `src/trading_agent/risk.py`
- `src/trading_agent/storage.py`
- `src/trading_agent/adapters/__init__.py`
- `src/trading_agent/adapters/base.py`
- `src/trading_agent/adapters/mock.py`
- `src/trading_agent/adapters/mt5.py`
- `src/trading_agent/brokers/__init__.py`
- `src/trading_agent/brokers/paper.py`
- `src/trading_agent/backtest.py`
- `src/trading_agent/execution.py`
- `src/trading_agent/reconciliation.py`
- `src/trading_agent/engine.py`
- `src/trading_agent/cli.py`
- `src/trading_agent/ui/__init__.py`
- `src/trading_agent/ui/app.py`
- `README.md`
- `LOCAL_EXECUTION_LOG.md`
- `tests/test_core_strategy_risk.py`
- `tests/test_execution_reconciliation.py`
- `tests/test_backtest_export.py`

---

## 4. Hasil Pengujian & Verifikasi

- **Status Kelulusan**: `OFFLINE VERIFIED`
- **Integrasi MT5 Windows**: `UNTESTED ON WINDOWS TERMINAL` (Platform saat ini adalah Linux, seluruh fungsionalitas core, strategy, risk, paper broker, state machine, idempotency, backtester, CLI, dan UI terverifikasi 100% lulus secara offline via unit tests & mock adapter).

---

## 5. Usulan Kelompok Commit Kohesif

Apabila pengguna meminta untuk melakukan commit kelak, berikut adalah usulan kelompok commit yang direkomendasikan:

1. **`feat(domain): implement core models, config, indicators, and storage`**
   - Files: `src/trading_agent/__init__.py`, `config.py`, `models.py`, `indicators.py`, `strategy.py`, `risk.py`, `storage.py`
2. **`feat(adapters): add base adapter interface, mock adapter, and MT5 lazy adapter`**
   - Files: `src/trading_agent/adapters/*`, `src/trading_agent/brokers/*`
3. **`feat(execution): implement backtest engine, execution state machine, and reconciliation`**
   - Files: `src/trading_agent/backtest.py`, `execution.py`, `reconciliation.py`, `engine.py`
4. **`feat(ui-cli): add CLI utility commands and Streamlit dashboard UI`**
   - Files: `src/trading_agent/cli.py`, `src/trading_agent/ui/*`
5. **`test(all): add comprehensive pytest suite covering AC01-AC24`**
   - Files: `tests/*`
6. **`docs(readme): add installation guide, MT5 Windows setup, and execution log`**
   - Files: `README.md`, `LOCAL_EXECUTION_LOG.md`
