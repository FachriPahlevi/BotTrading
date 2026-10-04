export interface LogEvent {
  id: number
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  source: 'api' | 'bridge' | 'system'
  message: string
  details: {
    request_id?: string
    method?: string
    path?: string
    status?: number
    duration_ms?: number
    reason?: string
    error?: unknown
  }
}

export interface Diagnostics {
  session_id: string
  started_at: string
  generated_at: string
  capacity: number
  dropped: number
  events: LogEvent[]
  connection: {
    mode: string
    account_age_seconds: number | null
    account_fresh: boolean
    markets: { symbol: string; interval: string; age_seconds: number; fresh: boolean }[]
    explanation: string
  }
}
