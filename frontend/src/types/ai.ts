export interface ChartOverlayItem {
  type: string
  label: string
  price: number
  color: string
  style: string
}

export interface AiMainScenario {
  direction?: string
  entry_min?: number
  entry_max?: number
  stop_loss?: number
  take_profit_1?: number
  take_profit_2?: number
  rr_ratio?: number
}

export interface AiScenario {
  type?: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence_percent?: number
  trigger_condition?: string
  entry_zone?: [number, number]
  stop_loss?: number
  take_profit?: [number, number]
  invalidation?: string
  rationale?: string
}

export interface AiAnalysisResult {
  symbol: string
  interval: string
  generated_at?: string
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'LONG' | 'SHORT'
  confidence?: number
  confidence_percent?: number
  summary?: string
  provider?: string
  key_levels?: {
    support: number[]
    resistance: number[]
    pivot: number
    ema_14: number
  }
  scenarios?: {
    main?: AiMainScenario
  }
  chart_overlays?: ChartOverlayItem[]
  rationale?: string[]
  disclaimer?: string
}
