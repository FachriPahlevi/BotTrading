# TECHNICAL DESIGN SPECIFICATION (TDS) v1.0

## AI Trading System – HFM & MetaTrader 5

**Turunan dari:** FDS v0.1 + Addendum v0.2
**Scope:** Formula kuantitatif, database schema, pseudocode logic flow per engine
**Status:** Draft for Development

---

# DAFTAR ISI

```text
1. Market Regime Detection Engine — Formula & Algoritma
2. Confluence Scoring Engine — Formula & Weighting
3. Position Sizing / Lot Calculation — Formula
4. AI Confidence Calibration — Metode Statistik
5. Database Schema — Detail Kolom & Relasi
6. Pseudocode — AI Decision Engine
7. Pseudocode — Risk Engine
8. Pseudocode — Signal & Execution Engine
9. API Endpoint Tambahan
10. Konfigurasi Default (config.yaml)
```

---

# 1. MARKET REGIME DETECTION ENGINE

## 1.1 Input Data

```text
Symbol            : XAUUSD
Timeframes        : H4, H1 (weighted vote)
Lookback period   : 100 candle per timeframe
Indicators dipakai: ADX(14), ATR(14), Bollinger Bands(20,2)
```

## 1.2 Formula

### 1.2.1 Trend Strength (ADX-based)

```text
ADX(14) dihitung standar Wilder.

Klasifikasi trend strength:
  ADX < 20                → NO_TREND
  20 <= ADX < 25          → WEAK_TREND
  25 <= ADX < 40          → STRONG_TREND
  ADX >= 40               → VERY_STRONG_TREND (waspada eksosan, potensi reversal)

Arah trend:
  +DI > -DI  → arah UP
  -DI > +DI  → arah DOWN
```

### 1.2.2 Volatility State (ATR Percentile)

```text
ATR_percentile = percentile_rank(ATR(14)_current, ATR(14)_lookback_100)

  ATR_percentile < 20%   → LOW_VOLATILITY_COMPRESSION
  20% <= ATR_percentile < 80%  → NORMAL_VOLATILITY
  ATR_percentile >= 80%  → HIGH_VOLATILITY_EXPANSION
```

### 1.2.3 Range/Trend Discriminator (Bollinger Bandwidth)

```text
BB_Width = (Upper_Band - Lower_Band) / Middle_Band

BB_Width_percentile = percentile_rank(BB_Width_current, BB_Width_lookback_100)

  BB_Width_percentile < 25%  → RANGING (band menyempit)
  BB_Width_percentile >= 25% → cenderung TRENDING/EXPANDING
```

## 1.3 Kombinasi Multi-Timeframe (Weighted Vote)

```text
Regime_Score = (0.6 * Regime_H4) + (0.4 * Regime_H1)

Mapping numerik untuk voting:
  TRENDING_UP    = +1
  TRENDING_DOWN  = -1
  RANGING        =  0

Hasil akhir:
  Regime_Score >= 0.5   → TRENDING_UP
  Regime_Score <= -0.5  → TRENDING_DOWN
  -0.5 < Regime_Score < 0.5 → RANGING
```

Volatility state (HIGH/NORMAL/LOW) disimpan sebagai atribut terpisah, tidak digabung ke voting arah — dipakai belakangan sebagai risk multiplier (lihat §3).

## 1.4 Output Struktur Data

```json
{
  "symbol": "XAUUSD",
  "timestamp": "2026-08-29T10:00:00Z",
  "regime": "TRENDING_UP",
  "regime_score": 0.72,
  "volatility_state": "NORMAL_VOLATILITY",
  "adx_h4": 31.2,
  "adx_h1": 27.8,
  "bb_width_percentile": 61.0,
  "confidence_regime": 0.81
}
```

`confidence_regime` dihitung sebagai `1 - |Regime_Score - round(Regime_Score)|` dinormalisasi ke 0–1, merepresentasikan seberapa "jelas" klasifikasi regime tersebut (bukan ambigu di boundary).

## 1.5 Rekalkulasi

Regime dihitung ulang setiap candle H1 close (bukan setiap tick) untuk menghindari flip-flop noise dan overhead komputasi.

---

# 2. CONFLUENCE SCORING ENGINE

## 2.1 Struktur: Hard Gate + Weighted Score

Dua lapis evaluasi — **hard gate wajib lolos semua**, baru dihitung weighted score untuk confidence tambahan.

### 2.1.1 Hard Gate (Boolean, AND logic)

```text
gate_trend_alignment      : D1, H4, H1 searah arah trade         → true/false
gate_regime_match         : regime sesuai tipe strategy           → true/false
gate_no_news_blackout     : di luar window 30 menit sebelum/sesudah high-impact news → true/false
gate_spread_acceptable    : spread saat ini <= max_allowed_spread → true/false

IF any gate == false:
    RESULT = WAIT
    STOP (tidak lanjut ke weighted scoring)
```

### 2.1.2 Weighted Score (jika semua hard gate lolos)

```text
Confluence_Score = 
      (0.30 * Structure_Score)
    + (0.25 * Momentum_Score)
    + (0.20 * Trend_Score)
    + (0.15 * Fundamental_Score)
    + (0.10 * Sentiment_Score)

Setiap sub-score dinormalisasi ke rentang 0–100 sebelum dikalikan bobot.
```

## 2.2 Formula Sub-Score

### Structure_Score (0–100)

```text
Base = 50

+ 20  jika BOS searah arah trade dalam 10 candle terakhir
+ 15  jika ada Order Block valid yang belum mitigated searah trade
+ 15  jika price berada di zona Discount (untuk BUY) / Premium (untuk SELL)
- 20  jika ada Equal High/Low unmitigated melawan arah trade (potensi liquidity sweep balik)

Clamp hasil ke [0, 100]
```

### Momentum_Score (0–100)

```text
Base = 50

+ 15  jika RSI(14) berada di 40–60 (ruang gerak) untuk continuation,
      atau keluar dari oversold/overbought searah reversal untuk reversal-type strategy
+ 20  jika MACD histogram searah arah trade dan meningkat 3 candle terakhir
- 25  jika terjadi bearish/bullish divergence melawan arah trade

Clamp hasil ke [0, 100]
```

### Trend_Score (0–100)

```text
Base = ADX_H1 dinormalisasi: 
  Trend_Score = min(100, (ADX_H1 / 40) * 100)

+ 10 bonus jika EMA50 > EMA200 (untuk BUY) atau sebaliknya (untuk SELL)
```

### Fundamental_Score (0–100)

```text
Base = 50

+/- 20  berdasarkan bias DXY (searah/melawan trade, dari fundamental engine §15)
+/- 15  berdasarkan yield differential trend
+/- 15  berdasarkan sentiment risk-on/risk-off yang relevan untuk XAUUSD (safe haven flow)

Clamp hasil ke [0, 100]
```

### Sentiment_Score (0–100)

```text
Dari data sentiment/COT/positioning (jika tersedia sebagai future development):
Base = 50, disesuaikan berdasarkan extreme positioning (contrarian) atau momentum crowd

Jika data sentiment belum tersedia di MVP → default 50 (netral, bobot tetap 0.10
tapi tidak mendistorsi hasil karena netral)
```

## 2.3 Threshold Keputusan Akhir

```text
Confluence_Score >= 75           → sinyal diteruskan ke AI Decision Engine dengan flag STRONG
60 <= Confluence_Score < 75      → diteruskan dengan flag MODERATE
Confluence_Score < 60            → RESULT = WAIT (meski hard gate lolos)
```

Confluence_Score **bukan** AI confidence — ini adalah input tambahan ke AI Decision Engine (§17 FDS v0.1), bukan pengganti. AI confidence tetap dihitung terpisah oleh model, tapi Confluence_Score menjadi salah satu fitur input dan juga hard-requirement minimum sebelum AI dipanggil sama sekali (menghemat compute + mencegah AI "dipaksa" memberi opini di kondisi yang secara struktural memang lemah).

---

# 3. POSITION SIZING / LOT CALCULATION

## 3.1 Formula Dasar

```text
Risk_Amount ($) = Account_Balance * Risk_Percent

Risk_Percent ditentukan dinamis (lihat 3.2), bukan flat.

SL_Distance (dalam price) = |Entry_Price - Stop_Loss_Price|

Value_per_Point = Tick_Value / Tick_Size
  (diambil realtime dari MT5 symbol_info, BUKAN hardcoded — karena
   tick value XAUUSD bisa berubah tergantung kontrak/broker)

Lot_Size = Risk_Amount / (SL_Distance * Value_per_Point)

Lot_Size dibulatkan DOWN ke lot_step terdekat (biasanya 0.01) — 
pembulatan ke bawah, tidak pernah ke atas, untuk mencegah risk melebihi target.
```

## 3.2 Dynamic Risk Percent (berdasarkan Confidence Band, dari Addendum v0.2 FR-RISK-010)

```text
FUNCTION get_risk_percent(ai_confidence, confluence_flag, consecutive_losses):

    base_risk = 
        IF ai_confidence < 60:       return 0        # tidak trade
        ELIF 60 <= ai_confidence < 70:  base_risk = 0.5
        ELIF 70 <= ai_confidence < 85:  base_risk = 1.0
        ELIF ai_confidence >= 85:       base_risk = 1.0   # cap, tidak naik lagi

    # Circuit breaker multiplier (FR-RISK-011)
    IF consecutive_losses >= 5:
        return 0   # auto-pause, lihat §7 Risk Engine pseudocode
    ELIF consecutive_losses >= 3:
        base_risk = base_risk * 0.5

    # Confluence flag multiplier
    IF confluence_flag == "MODERATE":
        base_risk = base_risk * 0.75

    RETURN base_risk
```

## 3.3 Validasi Akhir Sebelum Order

```text
IF Lot_Size < broker_min_lot:
    RESULT = REJECTED, reason = "calculated lot below broker minimum — 
              risk amount too small relative to SL distance"
    (JANGAN auto-round-up ke min_lot karena itu diam-diam menaikkan risk 
     melebihi Risk_Percent yang ditentukan)

IF Lot_Size > broker_max_lot:
    Lot_Size = broker_max_lot
    FLAG untuk review manual (kemungkinan SL terlalu dekat/error data)
```

---

# 4. AI CONFIDENCE CALIBRATION

## 4.1 Metode: Reliability Diagram + Brier Score

### 4.1.1 Brier Score

```text
Brier_Score = (1/N) * SUM( (predicted_probability_i - outcome_i)^2 )

outcome_i = 1 jika trade profitable, 0 jika loss
predicted_probability_i = AI confidence / 100

Brier_Score mendekati 0 = kalibrasi baik
Brier_Score mendekati 1 = kalibrasi buruk

Baseline referensi: Brier_Score naive (selalu prediksi 50%) = 0.25
Target: Brier_Score sistem < 0.22 (lebih baik dari tebakan random, 
        signifikansinya perlu diuji dengan sample >= 100 trade)
```

### 4.1.2 Reliability Bucket

```text
Bucket confidence ke dalam bin, hitung realized winrate tiap bin:

  Bin [60-70)  → realized_winrate vs expected_midpoint (65%)
  Bin [70-80)  → realized_winrate vs expected_midpoint (75%)
  Bin [80-90)  → realized_winrate vs expected_midpoint (85%)
  Bin [90-100] → realized_winrate vs expected_midpoint (95%)

Calibration_Error_per_bin = |realized_winrate - expected_midpoint|

IF Calibration_Error_per_bin > 15 (persen poin) DAN sample_size_bin >= 20:
    FLAG bin tersebut sebagai "miscalibrated"
    → Trigger review model / retraining candidate
```

### 4.1.3 Minimum Sample Size

Calibration report tidak boleh ditampilkan sebagai valid/final sebelum minimum **30 trade total** dan minimum **10 trade per bin** — di bawah itu, hasil ditandai `"insufficient_sample"` di UI, bukan ditampilkan sebagai angka pasti (mencegah kesimpulan prematur dari noise statistik kecil).

---

# 5. DATABASE SCHEMA — TABEL TAMBAHAN

## 5.1 `regime_history`

```sql
CREATE TABLE regime_history (
    id              BIGSERIAL PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    regime          VARCHAR(30) NOT NULL,   -- TRENDING_UP / TRENDING_DOWN / RANGING
    regime_score    NUMERIC(5,4),
    volatility_state VARCHAR(30),
    adx_h4          NUMERIC(6,2),
    adx_h1          NUMERIC(6,2),
    bb_width_pct    NUMERIC(5,2),
    confidence_regime NUMERIC(5,4),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_regime_symbol_time ON regime_history (symbol, timestamp DESC);
```

## 5.2 `confluence_scores`

```sql
CREATE TABLE confluence_scores (
    id                  BIGSERIAL PRIMARY KEY,
    signal_id           BIGINT REFERENCES signals(id),
    gate_trend_alignment BOOLEAN,
    gate_regime_match   BOOLEAN,
    gate_news_blackout  BOOLEAN,
    gate_spread_ok      BOOLEAN,
    structure_score     NUMERIC(5,2),
    momentum_score      NUMERIC(5,2),
    trend_score         NUMERIC(5,2),
    fundamental_score   NUMERIC(5,2),
    sentiment_score     NUMERIC(5,2),
    confluence_total    NUMERIC(5,2),
    confluence_flag     VARCHAR(20),   -- STRONG / MODERATE / WAIT
    created_at          TIMESTAMPTZ DEFAULT now()
);
```

## 5.3 `ai_calibration_reports`

```sql
CREATE TABLE ai_calibration_reports (
    id                  BIGSERIAL PRIMARY KEY,
    report_date         DATE NOT NULL,
    model_version       VARCHAR(50),
    brier_score         NUMERIC(6,4),
    bin_60_70_predicted NUMERIC(5,2),
    bin_60_70_realized  NUMERIC(5,2),
    bin_60_70_n         INT,
    bin_70_80_predicted NUMERIC(5,2),
    bin_70_80_realized  NUMERIC(5,2),
    bin_70_80_n         INT,
    bin_80_90_predicted NUMERIC(5,2),
    bin_80_90_realized  NUMERIC(5,2),
    bin_80_90_n         INT,
    bin_90_100_predicted NUMERIC(5,2),
    bin_90_100_realized NUMERIC(5,2),
    bin_90_100_n        INT,
    is_valid_sample     BOOLEAN,   -- false jika total sample < 30
    created_at          TIMESTAMPTZ DEFAULT now()
);
```

## 5.4 `risk_events`

```sql
CREATE TABLE risk_events (
    id              BIGSERIAL PRIMARY KEY,
    trading_account_id BIGINT REFERENCES trading_accounts(id),
    event_type      VARCHAR(50),  -- CONSECUTIVE_LOSS_50PCT / AUTO_PAUSE / 
                                    -- WEEKLY_DD_BREACH / KILL_SWITCH / MAX_DD_HIT
    trigger_value   NUMERIC(10,4),
    threshold_value NUMERIC(10,4),
    action_taken    TEXT,
    resolved        BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);
```

## 5.5 Tambahan Kolom di `trades` (existing table dari FDS v0.1 §41)

```sql
ALTER TABLE trades ADD COLUMN regime_at_entry VARCHAR(30);
ALTER TABLE trades ADD COLUMN confluence_score_id BIGINT REFERENCES confluence_scores(id);
ALTER TABLE trades ADD COLUMN trade_grade CHAR(1);   -- A / B / C / D (lihat Addendum v0.2 §F)
ALTER TABLE trades ADD COLUMN risk_percent_used NUMERIC(5,2);
ALTER TABLE trades ADD COLUMN walk_forward_validated BOOLEAN DEFAULT false;
```

## 5.6 Tambahan tabel `backtest_runs`

```sql
CREATE TABLE backtest_runs (
    id                  BIGSERIAL PRIMARY KEY,
    strategy_version_id BIGINT REFERENCES strategy_versions(id),
    run_type            VARCHAR(30),  -- IN_SAMPLE / OUT_OF_SAMPLE / HOLDOUT / MONTE_CARLO
    start_date          DATE,
    end_date            DATE,
    net_profit          NUMERIC(12,2),
    win_rate            NUMERIC(5,2),
    profit_factor       NUMERIC(6,2),
    expectancy          NUMERIC(10,4),
    max_drawdown_pct    NUMERIC(5,2),
    sharpe_ratio        NUMERIC(6,3),
    risk_of_ruin_pct    NUMERIC(5,4),   -- diisi hanya untuk run_type = MONTE_CARLO
    total_trades        INT,
    passed_validation   BOOLEAN,
    created_at          TIMESTAMPTZ DEFAULT now()
);
```

---

# 6. PSEUDOCODE — AI DECISION ENGINE

```python
def ai_decision_engine(symbol, timestamp):
    # 1. Ambil regime terbaru
    regime_data = regime_engine.get_latest(symbol)

    # 2. Ambil technical + structure + fundamental context
    technical_ctx = technical_engine.build_context(symbol)
    structure_ctx = structure_engine.build_context(symbol)
    fundamental_ctx = fundamental_engine.build_context(symbol)

    # 3. Hitung confluence score (hard gate + weighted)
    confluence = confluence_engine.evaluate(
        symbol, technical_ctx, structure_ctx, fundamental_ctx, regime_data
    )

    if confluence.result == "WAIT":
        log_decision(symbol, "WAIT", reason="confluence_gate_failed",
                     detail=confluence.failed_gates)
        return Decision(action="WAIT")

    if confluence.confluence_total < 60:
        log_decision(symbol, "WAIT", reason="confluence_score_too_low")
        return Decision(action="WAIT")

    # 4. Panggil AI model HANYA jika confluence sudah lolos minimum
    #    (menghemat cost + mencegah AI dipaksa beropini di setup lemah)
    ai_input = build_ai_payload(
        technical_ctx, structure_ctx, fundamental_ctx,
        regime_data, confluence
    )
    ai_output = ai_model.predict(ai_input)
    # ai_output = { direction, raw_confidence, entry, sl, tp1, tp2, reason, invalidation }

    # 5. Reject zone check (Addendum v0.2 FR-AI-002)
    if ai_output.raw_confidence < 60:
        log_decision(symbol, "WAIT", reason="ai_confidence_below_reject_zone")
        return Decision(action="WAIT")

    if ai_output.raw_confidence > 90:
        flag_for_manual_review(symbol, ai_output, reason="suspiciously_high_confidence")
        # tetap lanjut, tapi ditandai untuk audit

    # 6. Regime-strategy compatibility check
    strategy = strategy_engine.get_active_strategy(symbol)
    if not strategy.is_compatible_with_regime(regime_data.regime):
        log_decision(symbol, "WAIT", reason="regime_mismatch",
                     detail=f"strategy={strategy.name}, regime={regime_data.regime}")
        return Decision(action="WAIT")

    # 7. Bentuk final decision object
    decision = Decision(
        action=ai_output.direction,          # BUY / SELL
        confidence=ai_output.raw_confidence,
        confluence_flag=confluence.flag,      # STRONG / MODERATE
        entry=ai_output.entry,
        sl=ai_output.sl,
        tp=[ai_output.tp1, ai_output.tp2],
        reason=ai_output.reason,
        invalidation=ai_output.invalidation,
        regime_at_decision=regime_data.regime
    )

    save_ai_decision_log(decision)   # FDS v0.1 §30
    return decision
```

---

# 7. PSEUDOCODE — RISK ENGINE

```python
def risk_engine_validate(decision, account_state):
    checks = []

    # 1. Basic gates dari FDS v0.1 §21
    checks.append(check_max_risk_per_trade(decision, account_state))
    checks.append(check_max_daily_loss(account_state))
    checks.append(check_max_daily_trades(account_state))
    checks.append(check_max_concurrent_positions(account_state))
    checks.append(check_min_risk_reward(decision, min_rr=1.5))
    checks.append(check_max_spread(decision.symbol))
    checks.append(check_news_blackout_window(decision.symbol))

    # 2. Tambahan dari Addendum v0.2
    consecutive_losses = get_consecutive_losses(account_state)

    if consecutive_losses >= 5:
        trigger_risk_event(
            account_state.id, "AUTO_PAUSE",
            trigger_value=consecutive_losses, threshold_value=5
        )
        return RiskResult(approved=False, reason="auto_pause_5_consecutive_losses")

    risk_percent = get_risk_percent(
        decision.confidence, decision.confluence_flag, consecutive_losses
    )
    if risk_percent == 0:
        return RiskResult(approved=False, reason="risk_percent_calculated_zero")

    # 3. Weekly drawdown governor (FR-RISK-012)
    weekly_loss_pct = calculate_weekly_loss_pct(account_state)
    if weekly_loss_pct > 5.0:
        set_mode(account_state.id, "ANALYSIS_ONLY")
        trigger_risk_event(
            account_state.id, "WEEKLY_DD_BREACH",
            trigger_value=weekly_loss_pct, threshold_value=5.0
        )
        return RiskResult(approved=False, reason="weekly_drawdown_limit_breached")

    # 4. Max drawdown hard stop
    current_dd_pct = calculate_current_drawdown_pct(account_state)
    if current_dd_pct > 20.0:
        trigger_kill_switch(account_state.id, reason="max_drawdown_hard_stop")
        return RiskResult(approved=False, reason="max_drawdown_exceeded")

    # 5. Jika semua check lolos
    if all(c.passed for c in checks):
        lot_size = calculate_lot_size(
            account_state.balance, risk_percent,
            decision.entry, decision.sl,
            get_symbol_info(decision.symbol)
        )
        if lot_size < broker_min_lot(decision.symbol):
            return RiskResult(approved=False, reason="lot_below_broker_minimum")

        return RiskResult(
            approved=True,
            lot_size=lot_size,
            risk_percent_used=risk_percent
        )
    else:
        failed = [c for c in checks if not c.passed]
        return RiskResult(approved=False, reason=failed)
```

---

# 8. PSEUDOCODE — SIGNAL & EXECUTION ENGINE

```python
def signal_engine_process(decision):
    signal = create_signal(
        symbol=decision.symbol,
        direction=decision.action,
        entry=decision.entry,
        sl=decision.sl,
        tp=decision.tp,
        confidence=decision.confidence,
        status="NEW",
        valid_until=now() + timedelta(minutes=30)   # expiration, FDS v0.1 §19
    )

    risk_result = risk_engine_validate(decision, get_account_state())

    if not risk_result.approved:
        signal.status = "REJECTED"
        signal.reject_reason = risk_result.reason
        save_signal(signal)
        notify_user("signal_rejected", signal)
        return signal

    signal.status = "APPROVED"
    save_signal(signal)

    mode = get_trading_mode()  # ANALYSIS_ONLY / SEMI_AUTO / FULL_AUTO

    if mode == "ANALYSIS_ONLY":
        notify_user("new_signal_manual_action_required", signal)
        return signal

    if mode == "SEMI_AUTO":
        notify_user("new_signal_awaiting_confirmation", signal)
        signal.status = "WAITING"
        save_signal(signal)
        return signal   # menunggu user klik EXECUTE / REJECT di dashboard

    if mode == "FULL_AUTO":
        execution_result = execution_engine.send_order(
            symbol=signal.symbol,
            direction=signal.direction,
            lot=risk_result.lot_size,
            entry=signal.entry,
            sl=signal.sl,
            tp=signal.tp[0]
        )
        if execution_result.success:
            signal.status = "EXECUTED"
            log_trade_opened(signal, execution_result, risk_result)
        else:
            signal.status = "CANCELLED"
            notify_user("execution_failed", signal, execution_result.error)
        save_signal(signal)
        return signal
```

---

# 9. API ENDPOINT TAMBAHAN

```text
GET  /api/regime/{symbol}
     → return regime terbaru + history singkat

GET  /api/confluence/{signal_id}
     → return breakdown lengkap confluence score (untuk transparansi di AI Analysis Page)

GET  /api/calibration/report?model_version=&period=
     → return reliability diagram data + brier score

GET  /api/risk/events?account_id=&resolved=false
     → return daftar risk_events aktif (circuit breaker, kill switch, dsb)

POST /api/backtest/walk-forward
     Body: { strategy_version_id, symbol, start_date, end_date, split_ratio }
     → menjalankan walk-forward analysis (§D FDS Addendum v0.2)

POST /api/backtest/monte-carlo
     Body: { backtest_run_id, n_simulations }
     → menjalankan Monte Carlo risk-of-ruin simulation

GET  /api/trades/grading-summary?period=
     → distribusi trade_grade (A/B/C/D) untuk audit kualitas proses
```

---

# 10. KONFIGURASI DEFAULT (config.yaml)

```yaml
regime_engine:
  lookback_period: 100
  adx_period: 14
  atr_period: 14
  bb_period: 20
  bb_stddev: 2
  weight_h4: 0.6
  weight_h1: 0.4
  recalc_trigger: "H1_candle_close"

confluence_engine:
  weights:
    structure: 0.30
    momentum: 0.25
    trend: 0.20
    fundamental: 0.15
    sentiment: 0.10
  threshold_strong: 75
  threshold_moderate: 60

ai_decision_engine:
  confidence_reject_below: 60
  confidence_flag_review_above: 90
  max_confidence_cap_for_sizing: 85

risk_engine:
  max_risk_per_trade_pct: 1.0
  max_daily_loss_pct: 3.0
  max_weekly_loss_pct: 5.0
  max_drawdown_hard_stop_pct: 20.0
  min_risk_reward: 1.5
  consecutive_loss_reduce_at: 3
  consecutive_loss_reduce_factor: 0.5
  consecutive_loss_pause_at: 5
  pause_duration_hours: 24

backtest:
  in_sample_ratio: 0.6
  out_of_sample_ratio: 0.2
  holdout_ratio: 0.2
  monte_carlo_simulations: 1000
  max_acceptable_expectancy_deviation_pct: 30

calibration:
  min_total_sample: 30
  min_sample_per_bin: 10
  max_calibration_error_pct: 15
  target_brier_score: 0.22
```

---

**Catatan:** Semua nilai numerik di atas (threshold, bobot, periode) adalah **starting point yang wajar secara industri**, bukan angka final yang sudah teroptimasi untuk XAUUSD spesifik. Begitu Phase 7 (Backtesting, FDS v0.1 §46) berjalan dengan data historis nyata, nilai-nilai ini wajib divalidasi ulang lewat walk-forward analysis (§D Addendum v0.2) — bukan di-tweak manual berdasarkan "feeling bagus di chart".

**End of Technical Design Specification v1.0**
