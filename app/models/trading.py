from sqlalchemy import Column, BigInteger, String, Numeric, Boolean, Date, Integer, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.db.session import Base

class RegimeHistory(Base):
    __tablename__ = "regime_history"

    id = Column(BigInteger, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    regime = Column(String(30), nullable=False)
    regime_score = Column(Numeric(5, 4))
    volatility_state = Column(String(30))
    adx_h4 = Column(Numeric(6, 2))
    adx_h1 = Column(Numeric(6, 2))
    bb_width_pct = Column(Numeric(5, 2))
    confidence_regime = Column(Numeric(5, 4))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Signal(Base):
    __tablename__ = "signals"

    id = Column(BigInteger, primary_key=True, index=True)
    symbol = Column(String(20))
    direction = Column(String(10))
    entry = Column(Numeric)
    sl = Column(Numeric)
    status = Column(String(20))

class ConfluenceScore(Base):
    __tablename__ = "confluence_scores"

    id = Column(BigInteger, primary_key=True, index=True)
    signal_id = Column(BigInteger, ForeignKey("signals.id"))
    gate_trend_alignment = Column(Boolean)
    gate_regime_match = Column(Boolean)
    gate_news_blackout = Column(Boolean)
    gate_spread_ok = Column(Boolean)
    structure_score = Column(Numeric(5, 2))
    momentum_score = Column(Numeric(5, 2))
    trend_score = Column(Numeric(5, 2))
    fundamental_score = Column(Numeric(5, 2))
    sentiment_score = Column(Numeric(5, 2))
    confluence_total = Column(Numeric(5, 2))
    confluence_flag = Column(String(20))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class RiskEvent(Base):
    __tablename__ = "risk_events"

    id = Column(BigInteger, primary_key=True, index=True)
    trading_account_id = Column(BigInteger)
    event_type = Column(String(50))
    trigger_value = Column(Numeric(10, 4))
    threshold_value = Column(Numeric(10, 4))
    action_taken = Column(String)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True))


class TradeRecord(Base):
    __tablename__ = "trade_records"

    id = Column(BigInteger, primary_key=True, index=True)
    ticket = Column(BigInteger, unique=True, index=True, nullable=False)
    order_id = Column(BigInteger, index=True, nullable=True)
    symbol = Column(String(20), nullable=False)
    action = Column(String(10), nullable=False)  # BUY or SELL
    volume = Column(Numeric(10, 2), nullable=False)
    price = Column(Numeric(12, 4), nullable=True)
    sl = Column(Numeric(12, 4), nullable=True)
    tp = Column(Numeric(12, 4), nullable=True)
    profit = Column(Numeric(12, 2), default=0.0)
    source = Column(String(20), nullable=False, default="manual")  # 'manual' or 'ai'
    magic = Column(BigInteger, default=0)
    comment = Column(String(100), nullable=True)
    status = Column(String(20), default="CLOSED")  # 'OPEN', 'CLOSED', 'PENDING'
    deal_time = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

