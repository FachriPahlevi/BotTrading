import type { StrategyPlanItem, VisualOverlayData, SeasonalityAndTiming } from './strategy'

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

export interface AgentInfo {
  id: string
  name: string
  description?: string
}

export interface AgentConsensus {
  bias: string
  agreement_ratio: string
  average_confidence: number
  votes: {
    LONG: number
    SHORT: number
    WAIT: number
    [key: string]: number
  }
  total_agents: number
  summary: string
}

export interface AiAnalysisResult {
  symbol: string
  interval: string
  generated_at?: string
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'LONG' | 'SHORT' | 'WAIT'
  confidence?: number
  confidence_percent?: number
  summary?: string
  provider?: string
  provider_id?: string
  provider_name?: string
  agent_id?: string
  status?: 'ok' | 'failed' | 'skipped' | 'insufficient_data' | 'success' | 'warning' | 'error'
  error_code?: string | null
  error_message?: string
  decision?: 'TRADE' | 'WAIT' | string
  tradable?: boolean
  primary_agent?: string
  date_str?: string
  last_price?: number
  key_resistance?: string | number
  key_support?: string | number
  record_change?: string
  conclusion?: string
  fundamental?: string[]
  technical?: string[]
  volume?: string
  seasonality_and_timing?: SeasonalityAndTiming
  plans?: StrategyPlanItem[]
  invalidation?: string
  visual_data?: VisualOverlayData
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

  // Multi-Agent Comparison Fields
  multi_agent?: boolean
  selected_agents?: string[]
  available_agents?: AgentInfo[]
  consensus?: AgentConsensus
  agent_results?: Record<string, AiAnalysisResult>
}
