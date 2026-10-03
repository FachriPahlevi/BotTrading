CREATE TABLE IF NOT EXISTS regime_history (
    id              BIGSERIAL PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    regime          VARCHAR(30) NOT NULL,
    regime_score    NUMERIC(5,4),
    volatility_state VARCHAR(30),
    adx_h4          NUMERIC(6,2),
    adx_h1          NUMERIC(6,2),
    bb_width_pct    NUMERIC(5,2),
    confidence_regime NUMERIC(5,4),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_regime_symbol_time ON regime_history (symbol, timestamp DESC);

CREATE TABLE IF NOT EXISTS signals (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20),
    direction VARCHAR(10),
    entry NUMERIC,
    sl NUMERIC,
    status VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS trading_accounts (
    id BIGSERIAL PRIMARY KEY,
    account_name VARCHAR(50),
    balance NUMERIC
);

CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,
    signal_id BIGINT REFERENCES signals(id),
    status VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS strategy_versions (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50),
    version VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS confluence_scores (
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
    confluence_flag     VARCHAR(20),
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_calibration_reports (
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
    is_valid_sample     BOOLEAN,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_events (
    id              BIGSERIAL PRIMARY KEY,
    trading_account_id BIGINT REFERENCES trading_accounts(id),
    event_type      VARCHAR(50),
    trigger_value   NUMERIC(10,4),
    threshold_value NUMERIC(10,4),
    action_taken    TEXT,
    resolved        BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

ALTER TABLE trades ADD COLUMN IF NOT EXISTS regime_at_entry VARCHAR(30);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS confluence_score_id BIGINT REFERENCES confluence_scores(id);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS trade_grade CHAR(1);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS risk_percent_used NUMERIC(5,2);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS walk_forward_validated BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS backtest_runs (
    id                  BIGSERIAL PRIMARY KEY,
    strategy_version_id BIGINT REFERENCES strategy_versions(id),
    run_type            VARCHAR(30),
    start_date          DATE,
    end_date            DATE,
    net_profit          NUMERIC(12,2),
    win_rate            NUMERIC(5,2),
    profit_factor       NUMERIC(6,2),
    expectancy          NUMERIC(10,4),
    max_drawdown_pct    NUMERIC(5,2),
    sharpe_ratio        NUMERIC(6,3),
    risk_of_ruin_pct    NUMERIC(5,4),
    total_trades        INT,
    passed_validation   BOOLEAN,
    created_at          TIMESTAMPTZ DEFAULT now()
);
