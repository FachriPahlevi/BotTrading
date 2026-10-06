export interface Instance { alias: string; version_id: string; params: Record<string, number> }
export interface Spec {
  kind?: string; params?: Record<string, number>; description?: string; status?: string
  source?: string; unsupported?: string[]; provenance?: Record<string, string>
  indicators?: Instance[]; instances?: { alias: string; kind: string; params: Record<string, number> }[]
  buy?: Rule; sell?: Rule; stop?: {ref: string; mult: number}; target_r?: number; assumptions?: string
  rows?: number; interval?: string; symbol?: string; broker?: string; server?: string; role?: string
  start?: number; end?: number; gap_count?: number; dataset_id?: string
  [key: string]: unknown
}
export interface Rule { op: string; left?: string | number; right?: string | number; rules?: Rule[] }
export interface Version { id: string; number: number; config_hash: string; spec: Spec; created_at: string }
export interface Item { id: string; name: string; kind: string; archived: boolean; builtin: boolean; version_id: string; version: number; config_hash: string; spec: Spec; versions: Version[]; usage: number }
export interface Schema { label: string; params: Record<string, {type: string; default: number; min: number; max: number}>; outputs: string[] }
export interface Run { id: string; name: string; status: string; progress: number; error?: string; metrics: Record<string, unknown>; created_at: string; snapshot?: Record<string, unknown>; result?: {trades: Record<string, unknown>[]; equity_curve: {time: number; equity: number; balance: number}[]; [key: string]: unknown} }
export interface Catalog { indicators: Item[]; strategies: Item[]; datasets: Item[]; schemas: Record<string, Schema>; runs: Run[]; run_count: number; history_bridge_configured: boolean }
export interface Preview { candles: {time:number;open:number;high:number;low:number;close:number;volume:number}[]; lines: Record<string, (number|null)[]>; instances: {alias:string;kind:string}[]; symbol:string;interval:string;note:string;warmup_bars:number }
export interface ChartIndicatorConfig extends Instance { key:string; name:string; visible:boolean }
export interface IndicatorCalculation { lines:Record<string,(number|null)[]>;instances:{alias:string;kind:string;status:string}[];warmup_bars:number;ready:boolean;candles:number;symbol:string;interval:string;note:string }
export async function request<T>(path: string, method='GET', data?: unknown): Promise<T> {
  const r = await fetch(`/api/lab${path}`, {method, headers: {'Content-Type':'application/json'}, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(180000)})
  const body = await r.json().catch(() => null)
  if (!r.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : `Permintaan tidak valid / layanan gagal (HTTP ${r.status}). Periksa field form.`)
  return body
}
export async function requestText(path: string): Promise<string> {
  const r = await fetch(`/api/lab${path}`, { signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return await r.text()
}
export function download(name: string, data: unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
  const link=document.createElement('a');link.href=url;link.download=name;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function metric(value: unknown, digits=2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US',{maximumFractionDigits:digits}) : '—'
}
