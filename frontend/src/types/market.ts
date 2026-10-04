export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  rsi_14?: number | null
  macd?: number | null
  macd_signal?: number | null
}

export interface Market {
  symbol: string
  interval: string
  provider: string
  updated_at: string
  candles: Candle[]
}
