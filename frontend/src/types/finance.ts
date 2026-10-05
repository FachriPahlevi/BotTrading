export type FinancePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'

export interface ClosedDeal {
  ticket: number
  order: number
  symbol: string
  action: 'BUY' | 'SELL'
  volume: number
  price: number
  profit: number
  time: string
  comment: string
  magic?: number
  source?: 'manual' | 'ai'
}

export interface DailyBreakdown {
  date: string
  profit: number
  trades: number
  wins: number
  losses: number
}

export interface FinanceOverview {
  period: FinancePeriod
  period_label: string
  start_date: string
  end_date: string
  currency: string
  net_profit: number
  gross_profit: number
  gross_loss: number
  profit_factor: number
  trades_count: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  avg_trade_profit: number
  ai_profit?: number
  manual_profit?: number
  ai_trades_count?: number
  manual_trades_count?: number
  active_positions_count: number
  active_positions_volume: number
  active_floating_pnl: number
  active_ai_positions?: number
  active_manual_positions?: number
  pending_orders_count: number
  deals: ClosedDeal[]
  daily_breakdown: DailyBreakdown[]
}


export interface PendingOrder {
  ticket: number
  symbol: string
  type: string
  volume: number
  price_open: number
  sl?: number
  tp?: number
  time_setup: string
  comment: string
}
