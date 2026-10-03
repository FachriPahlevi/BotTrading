import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw, ScrollText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getJson } from '@/lib/api'

interface LogEvent {
  id: number
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  source: 'api' | 'bridge' | 'system'
  message: string
  details: { request_id?: string; method?: string; path?: string; status?: number; duration_ms?: number; reason?: string; error?: unknown }
}
interface Diagnostics {
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

export function LogPanel() {
  const [paused, setPaused] = useState(false)
  const [level, setLevel] = useState('ALL')
  const [source, setSource] = useState('ALL')
  const [search, setSearch] = useState('')
  const logs = useQuery({
    queryKey: ['diagnostics'],
    queryFn: ({ signal }) => getJson<Diagnostics>('/api/diagnostics', signal),
    refetchInterval: paused ? false : 5_000,
    refetchOnWindowFocus: !paused,
    retry: false,
  })
  const data = logs.data
  const events = (data?.events ?? []).filter(event =>
    (level === 'ALL' || event.level === level) && (source === 'ALL' || event.source === source)
    && JSON.stringify(event).toLowerCase().includes(search.toLowerCase()),
  )
  function download() {
    const blob = new Blob([JSON.stringify({ ...data, events }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'aurum-system-log.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Card id="logs" className="min-w-0 scroll-mt-6">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><ScrollText className="size-4 text-primary" />Log sistem</CardTitle>
      <p className="text-xs text-muted-foreground">Request API, error dan kiriman bridge sejak proses API dimulai. Maksimal {data?.capacity ?? 1000} event terakhir; hilang saat restart. Journal terminal Windows belum terhubung.</p>
    </CardHeader>
    <CardContent className="min-w-0 space-y-4">
      {logs.isPending && <p role="status">Memuat log…</p>}
      {logs.isError && <p role="alert" className="text-sm text-amber-300">Log gagal diperbarui. {logs.error.message} {data ? 'Tampilan di bawah adalah hasil terakhir.' : ''}</p>}
      {data && <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <p className="font-medium">Jalur koneksi: {data.connection.mode === 'EA_PUSH' ? 'EA → API' : 'API → Python bridge → MT5'}</p>
        <p className="font-mono text-muted-foreground">Instance API: {data.session_id}</p>
        <p>{data.connection.explanation}</p>
        <p className="text-muted-foreground">Akun EA: {data.connection.account_age_seconds == null ? 'belum diterima' : `${data.connection.account_fresh ? 'segar' : 'kedaluwarsa'} · ${Math.round(data.connection.account_age_seconds)} detik`}</p>
        <div className="flex flex-wrap gap-2">{data.connection.markets.length ? data.connection.markets.map(m =>
          <span key={`${m.symbol}-${m.interval}`} className="rounded border border-border px-2 py-1">{m.symbol} {m.interval.toUpperCase()} · {Math.round(m.age_seconds)} dtk · {m.fresh ? 'segar' : 'kedaluwarsa'}</span>,
        ) : <span>Candle EA: belum diterima.</span>}</div>
        <p className="text-muted-foreground">Sesi dimulai {new Date(data.started_at).toLocaleString('id-ID')} · Diperbarui {new Date(data.generated_at).toLocaleTimeString('id-ID')}</p>
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Cari log" placeholder="Cari endpoint, alasan, request ID…" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-64" />
        <select aria-label="Level log" value={level} onChange={e => setLevel(e.target.value)} className="rounded border border-border bg-card p-2 text-xs">
          <option value="ALL">Semua level</option>{['INFO', 'WARN', 'ERROR'].map(v => <option key={v}>{v}</option>)}
        </select>
        <select aria-label="Sumber log" value={source} onChange={e => setSource(e.target.value)} className="rounded border border-border bg-card p-2 text-xs">
          <option value="ALL">Semua sumber</option>{['api', 'bridge', 'system'].map(v => <option key={v}>{v}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={() => setPaused(!paused)}>{paused ? 'Lanjutkan log' : 'Jeda log'}</Button>
        <Button variant="outline" size="sm" aria-label="Perbarui log" disabled={logs.isFetching} onClick={() => void logs.refetch()}><RefreshCw className="size-3" /></Button>
        <Button variant="outline" size="sm" disabled={!data} onClick={download}><Download className="size-3" />Unduh JSON</Button>
      </div>
      <p className="text-xs text-muted-foreground">{events.length} event cocok · {paused ? 'Pembaruan otomatis dijeda' : 'Pembaruan setiap 5 detik'}{data?.dropped ? ` · ${data.dropped} event lama keluar dari batas penyimpanan` : ''}</p>
      <div className="max-h-[560px] space-y-2 overflow-auto" data-testid="log-events">
        {!events.length && !logs.isPending && <p className="py-6 text-center text-sm text-muted-foreground">{data?.events.length ? 'Tidak ada log yang cocok dengan filter.' : 'Belum ada event yang tercatat.'}</p>}
        {events.map(event => <details key={`${data?.session_id}-${event.id}`} className="rounded-lg border border-border p-3 text-xs">
          <summary className="cursor-pointer break-words leading-relaxed">
            <span className={event.level === 'ERROR' ? 'text-red-300' : event.level === 'WARN' ? 'text-amber-300' : 'text-primary'}>{event.level}</span>{' '}
            <time>{new Date(event.timestamp).toLocaleString('id-ID')}</time> · {event.source} · {event.details.method} {event.details.path} {event.details.status} · {event.message}
          </summary>
          {event.details.reason && <p className="mt-2 text-amber-200">{event.details.reason}</p>}
          <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-background p-3 text-[11px] text-muted-foreground">{JSON.stringify(event, null, 2)}</pre>
        </details>)}
      </div>
    </CardContent>
  </Card>
}
