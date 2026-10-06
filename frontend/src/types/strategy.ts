export interface StrategyPlanItem {
  id: string
  name: string
  direction: 'BUY' | 'SELL' | 'WAIT'
  trigger: string
  entry: number
  stop_loss: number
  take_profit_1: number
  take_profit_2?: number
  take_profit_3?: number
  rr_ratio?: string
  is_main?: boolean
  notes?: string
  price_path?: [number, number][]
  path_labels?: { step?: number; text: string; x_idx?: number; y?: number }[]
}

export interface ZoneOverlay {
  label: string
  high: number
  low: number
  start_idx?: number
  color: string
  opacity?: number
}

export interface HorizontalLevelOverlay {
  price: number
  label: string
  color: string
  style?: string
}

export interface PatternLabelOverlay {
  x_idx: number
  y: number
  text: string
  color: string
}

export interface VisualOverlayData {
  zones?: ZoneOverlay[]
  horizontal_levels?: HorizontalLevelOverlay[]
  pattern_labels?: PatternLabelOverlay[]
  candles_sample?: (string | number)[][]
}

export interface SeasonalityAndTiming {
  seasonality: string
  trading_hours_wib: string
  economic_calendar: string
}

export interface StrategyPlanPayload {
  title?: string
  symbol: string
  interval: string
  date_str?: string
  last_price: number
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'LONG' | 'SHORT' | 'WAIT'
  confidence?: number
  key_resistance?: string | number
  key_support?: string | number
  record_change?: string
  summary?: string
  conclusion: string
  fundamental: string[]
  technical: string[]
  volume: string
  seasonality_and_timing: SeasonalityAndTiming
  plans: StrategyPlanItem[]
  invalidation: string
  disclaimer?: string
  visual_data?: VisualOverlayData
}

export interface StrategyPlanRecord {
  id: string
  title: string
  symbol: string
  interval: string
  bias: string
  status: 'active' | 'draft' | 'archived'
  created_at?: string
  updated_at?: string
  payload: StrategyPlanPayload
}
