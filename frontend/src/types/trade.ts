export interface OrderRequest {
  symbol: string
  action: 'BUY' | 'SELL'
  volume: number
  sl?: number
  tp?: number
  mode: 'paper' | 'demo'
  source: 'manual' | 'ai'
  comment?: string
}

export interface OrderResponse {
  success: boolean
  status: string
  ticket: number
  symbol: string
  action: string
  volume: number
  price: number
  sl?: number
  tp?: number
  mode: string
  source: string
  timestamp: string
  message: string
}

export interface TradePosition {
  ticket: number
  symbol: string
  action: 'BUY' | 'SELL'
  volume: number
  entry_price: number
  current_price?: number
  sl?: number
  tp?: number
  profit?: number
  magic?: number
  comment?: string
  source?: 'manual' | 'ai'
  mode: string
  open_time: string
}

export interface ClosePositionParams {
  ticket: number
  volume?: number
}

export interface ClosePositionResponse {
  success: boolean
  message: string
  is_partial?: boolean
  closed_volume?: number
}

export interface CloseAllResponse {
  success: boolean
  closed_count: number
  message: string
}
