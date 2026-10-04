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
