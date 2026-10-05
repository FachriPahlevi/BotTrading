export interface AutopilotLog {
  id: number
  timestamp: string
  type: 'INFO' | 'TRADE' | 'TARGET' | 'WARN' | 'PROFIT'
  message: string
  details?: Record<string, unknown>
}

export interface AutopilotStatus {
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'TARGET_REACHED' | 'STOPPED'
  session_id: string | null
  start_time: string | null
  start_balance: number
  current_balance: number
  current_equity: number
  target_profit: number
  max_loss: number
  volume: number
  symbol: string
  interval: string
  realized_profit: number
  unrealized_profit: number
  total_profit: number
  progress_percent: number
  trades_count: number
  winning_trades: number
  losing_trades: number
  last_action: string
  last_action_time: string | null
  logs: AutopilotLog[]
}

export interface AutopilotStartPayload {
  target_profit: number
  max_loss: number
  volume: number
  symbol: string
  interval: string
}
