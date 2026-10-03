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

export interface TerminalAccount {
  login: string
  name: string
  company: string
  server: string
  currency: string
  trade_mode: 'DEMO' | 'REAL' | 'CONTEST'
  leverage: number
  balance: number
  equity: number
  profit: number
  credit: number
  margin: number
  margin_free: number
  margin_level: number | null
  positions_count: number
  connected: boolean
  updated_at: string
}

export async function getAccount(signal: AbortSignal): Promise<TerminalAccount> {
  const data = await getJson<TerminalAccount>('/api/account', signal)
  if (!data || !['login', 'name', 'company', 'server', 'currency'].every(
    (key) => typeof data[key as keyof TerminalAccount] === 'string' && String(data[key as keyof TerminalAccount]).length > 0,
  ) || !['balance', 'equity', 'profit', 'credit', 'margin', 'margin_free', 'leverage', 'positions_count'].every(
    (key) => typeof data[key as keyof TerminalAccount] === 'number' && Number.isFinite(data[key as keyof TerminalAccount]),
  ) || !['DEMO', 'REAL', 'CONTEST'].includes(data.trade_mode)
    || !Number.isFinite(Date.parse(data.updated_at)) || data.connected !== true
    || (data.margin_level !== null && !Number.isFinite(data.margin_level))) {
    throw new Error('Data akun MT5 tidak valid atau terminal terputus.')
  }
  return data
}

export function accountMoney(value: number | undefined, currency?: string) {
  // Broker currencies can include cent denominations (USC), so preserve their code.
  return value == null ? '—' : `${number(value)} ${currency ?? ''}`.trim()
}

export interface Market {
  symbol: string
  interval: string
  provider: string
  updated_at: string
  candles: Candle[]
}

export interface Signal {
  id: number
  symbol: string
  direction: string
  entry: number
  stop_loss: number
  status: string
}

export interface ChartOverlayItem {
  type: 'resistance' | 'support' | 'stop_loss' | 'take_profit'
  label: string
  price: number
  style: 'solid' | 'dashed'
  color: string
}

export interface AiScenario {
  direction: 'LONG' | 'SHORT' | 'WAIT'
  entry_min: number
  entry_max: number
  stop_loss: number
  take_profit_1: number
  take_profit_2: number
  rr_ratio: number
}

export interface AiAnalysisResult {
  symbol: string
  interval: string
  bias: 'LONG' | 'SHORT' | 'WAIT'
  confidence: number
  rationale: string[]
  scenarios: {
    main: AiScenario
  } | null
  chart_overlays: ChartOverlayItem[]
  provider: string
}

export interface Summary {
  generated_at: string
  overview: {
    total_signals: number
    open_signals: number
    risk_alerts: number
    average_confluence: number
    high_confidence_signals: number
    latest_regime: string
  }
  open_signal_feed: Signal[]
  risk_feed: {
    id: number
    event_type: string
    action_taken: string | null
    resolved: boolean
    created_at: string | null
  }[]
  latest_regimes: {
    symbol: string
    regime: string
    volatility_state: string | null
    timestamp: string | null
  }[]
  confluence_feed: {
    signal_id: number
    total: number
    flag: string | null
    trend_score: number
    momentum_score: number
  }[]
}


export async function getJson<T>(
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `Layanan tidak tersedia (HTTP ${response.status}).`,
    )
  }
  return response.json() as Promise<T>
}

export async function getMarket(
  symbol: string,
  interval: string,
  signal: AbortSignal,
): Promise<Market> {
  const data = await getJson<Market>(
    `/api/market/chart?${new URLSearchParams({ symbol, interval, limit: '300' })}`,
    signal,
  )
  if (
    !Array.isArray(data.candles) ||
    typeof data.symbol !== 'string' ||
    !Number.isFinite(Date.parse(data.updated_at))
  ) {
    throw new Error('Format data chart tidak valid.')
  }
  const byTime = new Map<number, Candle>()
  for (const candle of data.candles) {
    if (
      ![candle.time, candle.open, candle.high, candle.low, candle.close].every(
        Number.isFinite,
      ) ||
      candle.time <= 0 ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > candle.high
    ) {
      throw new Error('Data candle tidak valid. Chart tidak diperbarui.')
    }
    byTime.set(candle.time, {
      ...candle,
      volume: Number.isFinite(candle.volume) ? candle.volume : 0,
    })
  }
  return {
    ...data,
    candles: [...byTime.values()].sort((a, b) => a.time - b.time),
  }
}

export function number(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('en-US', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value)
}

export function dateTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Belum tersedia'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export async function getAiAnalysis(
  symbol: string,
  interval: string,
  signal: AbortSignal,
): Promise<AiAnalysisResult> {
  const query = new URLSearchParams({ symbol, interval }).toString()
  return getJson<AiAnalysisResult>(`/api/ai/analyze?${query}`, signal)
}

