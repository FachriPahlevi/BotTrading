export interface Signal {
  id: number
  symbol: string
  timeframe?: string
  action?: 'BUY' | 'SELL'
  direction?: 'BUY' | 'SELL'
  entry: number
  stop_loss: number
  take_profit: number
  confluence_score?: number
  status: string
  created_at: string
}

export interface RiskEvent {
  id: number
  event_type: string
  action_taken?: string
  created_at: string
  resolved?: boolean
}

export interface RegimeFeed {
  symbol: string
  regime: string
  volatility_state?: string | null
  timestamp?: string | null
}

export interface Overview {
  latest_regime?: string
  open_signals?: number
}

export interface Summary {
  account_connected?: boolean
  signals_total?: number
  signals_open?: number
  active_risk_events?: number
  average_confluence?: number | null
  signals?: Signal[]
  open_signal_feed?: Signal[]
  risk_feed?: RiskEvent[]
  latest_regimes?: RegimeFeed[]
  overview?: Overview
  news_feed?: {
    title: string
    impact: 'HIGH' | 'MEDIUM' | 'LOW'
    timestamp: string
    currency: string
  }[]
  regime_feed?: RegimeFeed[]
  confluence_feed?: {
    signal_id: number
    total: number
    flag: string | null
    trend_score: number
    momentum_score: number
  }[]
}
