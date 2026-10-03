import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CandlestickChart,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Database,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Radio,
  RefreshCw,
  Search,
  ScrollText,
  ShieldCheck,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { RiskCalculator } from '@/components/risk-calculator'
import { AccountPanel } from '@/components/account-panel'
import { LogPanel } from '@/components/log-panel'
import { ActivityPanel, Empty } from '@/components/activity'
import {
  getJson,
  getMarket,
  getAccount,
  dateTime,
  number,
  type Signal,
  type Summary,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const intervals = ['1m', '5m', '15m', '1h', '4h', '1d']
const MarketChart = lazy(() =>
  import('@/components/market-chart').then((module) => ({
    default: module.MarketChart,
  })),
)
const navItems = [
  { id: 'workspace', label: 'Trading workspace', icon: LayoutDashboard },
  { id: 'activity', label: 'Sinyal & aktivitas', icon: Activity },
  { id: 'risk', label: 'Anggaran risiko', icon: ShieldCheck },
  { id: 'fundamental', label: 'Konteks pasar', icon: Layers3 },
  { id: 'logs', label: 'Log sistem', icon: ScrollText },
]

function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string
  value: ReactNode
  note: string
  icon: ReactNode
}) {
  return (
    <Card className="gap-3 py-4">
      <CardContent>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <p className="mt-3 truncate text-2xl font-medium tracking-tight">
          {value}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'workspace' | 'activity' | 'risk' | 'fundamental' | 'logs'>('workspace')
  const [symbol, setSymbol] = useState('XAUUSDm')
  const [interval, setIntervalValue] = useState('1h')
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [draftSymbol, setDraftSymbol] = useState('')
  const [symbolError, setSymbolError] = useState('')
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null)
  const [now, setNow] = useState(Date.now())
  const market = useQuery({
    queryKey: ['market', symbol, interval],
    queryFn: ({ signal }) => getMarket(symbol, interval, signal),
    refetchInterval: 15_000,
  })
  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: ({ signal }) => getJson<Summary>('/api/dashboard/summary', signal),
    refetchInterval: 30_000,
  })
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getJson<{ status: string }>('/health', signal),
    refetchInterval: 30_000,
  })
  const accountQuery = useQuery({
    queryKey: ['account'],
    queryFn: ({ signal }) => getAccount(signal),
    refetchInterval: 15_000,
    retry: false,
  })
  const accountAge = accountQuery.data ? (now - Date.parse(accountQuery.data.updated_at)) / 1000 : Infinity
  const account = !accountQuery.isError && accountAge <= 60 && accountAge >= -10 ? accountQuery.data : undefined
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [])
  const last = market.data?.candles.at(-1)
  const first = market.data?.candles[0]
  const change =
    first && last && first.open !== 0
      ? ((last.close - first.open) / first.open) * 100
      : null
  const age = market.data
    ? (now - Date.parse(market.data.updated_at)) / 1000
    : Infinity
  const stale = market.isError || age > 60 || age < -60
  const fresh = !!last && !stale
  const overview = summary.data?.overview
  const fetching = market.isFetching || summary.isFetching || health.isFetching || accountQuery.isFetching

  function refresh() {
    void market.refetch()
    void summary.refetch()
    void health.refetch()
    void accountQuery.refetch()
  }
  function chooseSymbol(value: string) {
    setSymbol(value)
    setSelectedSignal(null)
    setSearchOpen(false)
    setSymbolError('')
  }
  function submitSymbol(event: React.FormEvent) {
    event.preventDefault()
    const value = draftSymbol.trim()
    if (!/^[a-zA-Z0-9]{1,20}$/.test(value)) {
      setSymbolError('Gunakan 1–20 huruf atau angka sesuai simbol pada MT5.')
      return
    }
    chooseSymbol(value)
  }
  function viewSignal(signal: Signal) {
    setSymbol(signal.symbol)
    setSelectedSignal(signal)
    setActiveTab('workspace')
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-background">
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/65 lg:hidden"
          aria-label="Tutup navigasi"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[216px] flex-col border-r border-border bg-[#0d131b] transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <a
          href="#workspace"
          className="flex h-[76px] items-center gap-3 px-6"
          onClick={() => {
            setActiveTab('workspace')
            setMobileOpen(false)
          }}
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CandlestickChart className="size-5" />
          </div>
          <div>
            <span className="text-xl font-semibold tracking-[.13em]">
              AURUM
            </span>
            <p className="text-[9px] tracking-[.24em] text-muted-foreground">
              TRADING WORKSPACE
            </p>
          </div>
        </a>
        <div className="px-4 pt-5">
          <p className="mb-3 px-3 text-[9px] font-semibold tracking-[.18em] text-muted-foreground">
            WORKSPACE
          </p>
          <nav aria-label="Navigasi utama" className="space-y-1">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => {
                  setActiveTab(item.id as typeof activeTab)
                  setMobileOpen(false)
                }}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-3 text-xs transition-colors hover:bg-muted hover:text-foreground',
                  activeTab === item.id
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground',
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {activeTab === item.id && (
                  <span className="ml-auto size-1.5 rounded-full bg-primary" />
                )}
              </a>
            ))}
          </nav>
        </div>
        <div className="mx-4 mt-8 rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-xs font-medium">AI trading, terencana.</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Satu tempat untuk chart, analisis, dan keputusan yang bisa
            ditelusuri.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 px-0 text-primary"
            onClick={() => setHelpOpen(true)}
          >
            Lihat status fitur <ArrowUpRight className="size-3" />
          </Button>
        </div>
        <div className="mt-auto space-y-4 p-5">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setHelpOpen(true)}
          >
            <CircleHelp /> Panduan workspace
          </Button>
          <Separator />
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-xs">
              MT5
            </div>
            <div>
              <p className="break-all text-xs font-medium">{account?.company ?? 'Broker belum terbaca'}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {account ? `${account.trade_mode} · •••${account.login.slice(-4)}` : 'Menunggu akun MT5'}
              </p>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">
            AURUM / WORKSPACE v0.1
          </p>
        </div>
      </aside>

      <div className="lg:ml-[216px]">
        <header className="flex min-h-[68px] items-center justify-between gap-3 border-b border-border px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Buka navigasi"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <Command className="hidden size-4 text-muted-foreground sm:block" />
            <span className="hidden text-xs text-muted-foreground sm:block">
              Workspace
            </span>
            <ChevronRight className="hidden size-3 text-muted-foreground sm:block" />
            <span className="text-xs font-medium">Terminal pasar</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  health.data?.status === 'ok' && !health.isError
                    ? 'bg-primary'
                    : 'bg-amber-400',
                )}
              />
              {health.isError
                ? 'API tidak tersedia'
                : health.data
                  ? 'API terhubung'
                  : 'Memeriksa API'}
            </span>
            <Badge variant="outline" className="gap-1.5 text-[10px]">
              <LockKeyhole className="size-3" />
              Observasi
            </Badge>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Perbarui semua data"
              disabled={fetching}
              onClick={refresh}
            >
              <RefreshCw className={cn(fetching && 'animate-spin')} />
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-[1800px] space-y-5 px-4 py-6 sm:px-7">
          <section className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] tracking-[.15em] text-primary">
                <span className="h-px w-5 bg-primary" /> MARKET INTELLIGENCE
              </div>
              <h1 className="text-2xl font-medium tracking-tight sm:text-[28px]">
                {activeTab === 'logs'
                  ? 'Log & Diagnostik Sistem'
                  : activeTab === 'activity'
                  ? 'Aktivitas & Sinyal Workspace'
                  : activeTab === 'risk'
                  ? 'Kalkulator & Anggaran Risiko'
                  : activeTab === 'fundamental'
                  ? 'Konteks Pasar & Fundamental'
                  : 'Pasar bergerak. Tetap terarah.'}
              </h1>
              <p className="mt-2 text-xs text-muted-foreground">
                {activeTab === 'logs'
                  ? 'Pantau request API, diagnosis koneksi EA, dan log internal.'
                  : activeTab === 'activity'
                  ? 'Riwayat sinyal tersimpan, pengujian risiko, dan regime pasar.'
                  : activeTab === 'risk'
                  ? 'Kalkulasi ukuran lot dan batas risiko per transaksi.'
                  : activeTab === 'fundamental'
                  ? 'Berita ekonomi, event penting, dan sentimen pasar.'
                  : 'Pantau pergerakan harga dan baca konteks pasar dalam satu workspace.'}
              </p>
            </div>
            {activeTab === 'workspace' && (
              <Button variant="outline" onClick={() => setSearchOpen(true)}>
                <Search className="size-3.5" /> Cari instrumen
              </Button>
            )}
          </section>

          {(activeTab === 'workspace' || activeTab === 'activity' || activeTab === 'risk') && (
            <AccountPanel
              account={account}
              loading={accountQuery.isPending}
              error={accountQuery.error?.message ?? (accountQuery.data && !account ? 'Data akun kedaluwarsa. Menunggu pembaruan terminal.' : undefined)}
            />
          )}

          {activeTab === 'workspace' && (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Stat
                  label="Sinyal tercatat"
                  value={overview ? number(overview.total_signals, 0) : '—'}
                  note={
                    summary.isError
                      ? 'Ringkasan gagal diperbarui'
                      : 'Seluruh sinyal di database'
                  }
                  icon={<Activity className="size-4" />}
                />
                <Stat
                  label="Sinyal terbuka"
                  value={overview ? number(overview.open_signals, 0) : '—'}
                  note="Bukan jumlah posisi broker"
                  icon={<ArrowUpRight className="size-4" />}
                />
                <Stat
                  label="Event risiko aktif"
                  value={
                    <span className={overview?.risk_alerts ? 'text-amber-300' : ''}>
                      {overview ? number(overview.risk_alerts, 0) : '—'}
                    </span>
                  }
                  note="Pemeriksaan yang belum diselesaikan"
                  icon={<ShieldCheck className="size-4" />}
                />
                <Stat
                  label="Confluence rata-rata"
                  value={
                    summary.data?.confluence_feed.length ? (
                      <>
                        {number(overview?.average_confluence, 1)}
                        <span className="ml-1 text-sm text-muted-foreground">
                          /100
                        </span>
                      </>
                    ) : (
                      '—'
                    )
                  }
                  note="Skor keselarasan, bukan probabilitas"
                  icon={<Layers3 className="size-4" />}
                />
              </div>

              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-5">
                  <Suspense
                    fallback={
                      <Card className="min-h-[510px] items-center justify-center text-muted-foreground">
                        Menyiapkan chart interaktif…
                      </Card>
                    }
                  >
                    <Card id="workspace" className="scroll-mt-4 gap-0 py-0">
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/8 text-sm font-semibold text-amber-200">
                            {symbol.toUpperCase().startsWith('XAU') ||
                            symbol === 'GOLD'
                              ? 'Au'
                              : 'FX'}
                          </div>
                          <div>
                            <button
                              className="flex items-center gap-2 text-sm font-semibold hover:text-primary"
                              onClick={() => setSearchOpen(true)}
                            >
                              {symbol}
                              <ChevronRight className="size-3 text-muted-foreground" />
                            </button>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {market.data
                                ? `Simbol diterima: ${market.data.symbol}`
                                : 'Menunggu data terminal'}{' '}
                              · MT5
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-xl font-medium">
                            {number(last?.close, 5)}
                          </p>
                          <p
                            className={cn(
                              'mt-1 flex items-center justify-end gap-1 font-mono text-[10px]',
                              (change ?? 0) >= 0 ? 'text-primary' : 'text-rose-300',
                            )}
                          >
                            {change !== null &&
                              (change >= 0 ? (
                                <ArrowUpRight className="size-3" />
                              ) : (
                                <ArrowDownRight className="size-3" />
                              ))}
                            {change !== null
                              ? `${change >= 0 ? '+' : ''}${number(change)}%`
                              : '—'}
                            <span className="ml-1 font-sans text-muted-foreground">
                              rentang chart
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3">
                        <div className="flex gap-1" aria-label="Timeframe">
                          {intervals.map((tf) => (
                            <Button
                              key={tf}
                              size="xs"
                              variant={interval === tf ? 'secondary' : 'ghost'}
                              className={
                                interval === tf
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                              }
                              aria-pressed={interval === tf}
                              onClick={() => setIntervalValue(tf)}
                            >
                              {tf.toUpperCase()}
                            </Button>
                          ))}
                        </div>
                        <span
                          className={cn(
                            'flex items-center gap-1.5 text-[10px]',
                            fresh ? 'text-primary' : 'text-amber-300',
                          )}
                        >
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              fresh ? 'bg-primary' : 'bg-amber-300',
                            )}
                          />
                          {market.isPending
                            ? 'Menghubungkan'
                            : fresh
                              ? 'Data diterima'
                              : last
                                ? 'Data kedaluwarsa'
                                : 'Feed tidak tersedia'}
                        </span>
                      </div>
                      {(market.isError || (last && stale)) && (
                        <div
                          role="alert"
                          className="border-t border-amber-300/15 bg-amber-300/5 px-4 py-3 text-xs text-amber-200"
                        >
                          <p>
                            {market.isError
                              ? 'Data pasar belum bisa diperbarui.'
                              : 'Data terakhir sudah kedaluwarsa.'}
                            {last &&
                              ' Chart menampilkan data terakhir, bukan harga terkini.'}
                          </p>
                          <details className="mt-1 text-[10px] text-muted-foreground">
                            <summary className="cursor-pointer">
                              Detail koneksi
                            </summary>
                            <p className="mt-1 break-words">
                              {market.error?.message ||
                                `Terakhir diterima ${dateTime(market.data?.updated_at)}`}
                            </p>
                          </details>
                        </div>
                      )}
                      {last && market.data ? (
                        <MarketChart
                          key={`${symbol}-${interval}`}
                          market={market.data}
                          signal={selectedSignal}
                        />
                      ) : (
                        <div className="chart-empty flex min-h-[380px] flex-col items-center justify-center border-t border-border px-6 text-center sm:min-h-[510px]">
                          <div className="mb-5 rounded-2xl border border-primary/20 bg-background p-4">
                            <CandlestickChart className="size-8 text-primary" />
                          </div>
                          <p className="text-sm font-medium">
                            {market.isPending
                              ? 'Menyiapkan chart pasar…'
                              : 'Chart siap. Menunggu feed MT5.'}
                          </p>
                          <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                            {market.isPending
                              ? 'Mengambil candle untuk instrumen dan timeframe pilihan.'
                              : 'Pastikan bridge MT5 mengirim candle untuk instrumen ini. Data contoh tidak ditampilkan sebagai harga pasar.'}
                          </p>
                          <Button
                            variant="outline"
                            className="mt-5"
                            disabled={market.isFetching}
                            onClick={() => void market.refetch()}
                          >
                            <RefreshCw
                              className={cn(
                                'size-3',
                                market.isFetching && 'animate-spin',
                              )}
                            />{' '}
                            Coba hubungkan
                          </Button>
                        </div>
                      )}
                      {selectedSignal && (
                        <div className="flex items-center justify-between gap-2 border-t border-border bg-primary/5 px-4 py-2 text-[11px]">
                          <span>
                            Sinyal #{selectedSignal.id} ·{' '}
                            <span className="text-amber-200">
                              Entry {number(selectedSignal.entry, 5)}
                            </span>{' '}
                            ·{' '}
                            <span className="text-rose-300">
                              SL {number(selectedSignal.stop_loss, 5)}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              Timeframe tampilan {interval.toUpperCase()}
                            </span>
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Sembunyikan level sinyal"
                            onClick={() => setSelectedSignal(null)}
                          >
                            <X />
                          </Button>
                        </div>
                      )}
                    </Card>
                  </Suspense>
                  <ActivityPanel
                    data={summary.data}
                    error={summary.isError}
                    loading={summary.isPending}
                    onSignal={viewSignal}
                  />
                </div>

                <aside className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
                  <Card className="ai-panel relative">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Sparkles className="size-4 text-primary" /> AI market
                          analyst
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] text-muted-foreground"
                        >
                          Belum aktif
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-5 flex justify-center pt-2">
                        <div className="ai-orbit">
                          <Sparkles className="size-7 text-primary" />
                        </div>
                      </div>
                      <h2 className="text-center text-base font-medium">
                        Dari pergerakan ke perspektif.
                      </h2>
                      <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
                        Skenario, level penting, dan alasan analisis akan hadir
                        langsung pada chart.
                      </p>
                      <div className="my-5 space-y-2.5">
                        {[
                          'Analisis teknikal & multi-timeframe',
                          'Skenario LONG / SHORT / WAIT',
                          'Zona entry, stop loss & target',
                        ].map((text, i) => (
                          <div
                            key={text}
                            className="flex items-center gap-2 text-[11px] text-muted-foreground"
                          >
                            <span className="flex size-4 items-center justify-center rounded-full border border-primary/20 text-[8px] text-primary">
                              {i + 1}
                            </span>
                            {text}
                          </div>
                        ))}
                      </div>
                      <Button className="w-full" disabled>
                        <Sparkles /> Analisis chart aktif
                      </Button>
                      <p className="mt-2 text-center text-[10px] text-muted-foreground">
                        Provider AI belum terhubung. Tidak ada sinyal AI aktif.
                      </p>
                    </CardContent>
                  </Card>
                  <RiskCalculator account={account} />
                  <Card className="gap-3">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <LockKeyhole className="size-4 text-muted-foreground" />{' '}
                        Eksekusi trading
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Status worker
                        </span>
                        <span>Belum tersedia</span>
                      </div>
                      <Button variant="secondary" className="mt-4 w-full" disabled>
                        Mulai trading dengan AI
                      </Button>
                      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                        Workspace saat ini untuk observasi. Kontrol order menunggu
                        integrasi engine dan validasi risiko.
                      </p>
                    </CardContent>
                  </Card>
                </aside>
              </div>
            </>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-5">
              <ActivityPanel
                data={summary.data}
                error={summary.isError}
                loading={summary.isPending}
                onSignal={viewSignal}
              />
            </div>
          )}

          {activeTab === 'risk' && (
            <div id="risk" className="max-w-3xl space-y-5">
              <RiskCalculator account={account} />
            </div>
          )}

          {activeTab === 'fundamental' && (
            <section
              id="fundamental"
              className="grid scroll-mt-6 gap-5 md:grid-cols-2"
            >
              <Card className="gap-1">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Clock3 className="size-4 text-muted-foreground" /> Kalender
                      ekonomi
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[9px] text-muted-foreground"
                    >
                      Belum terhubung
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Empty
                    title="Pantau event sebelum mengambil posisi"
                    description="Jadwal rilis, tingkat kepentingan, dan countdown akan tampil setelah sumber kalender tersambung."
                  />
                </CardContent>
              </Card>
              <Card className="gap-1">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Radio className="size-4 text-muted-foreground" /> Berita &
                      fundamental
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[9px] text-muted-foreground"
                    >
                      Belum terhubung
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Empty
                    title="Konteks yang dilengkapi sumber"
                    description="Berita terbaru akan disertai sumber, waktu publikasi, dan keterkaitannya dengan instrumen pilihan."
                  />
                </CardContent>
              </Card>
            </section>
          )}

          {activeTab === 'logs' && <LogPanel />}
          <footer className="flex flex-wrap items-center justify-between gap-2 pb-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Database className="size-3" /> Ringkasan:{' '}
              {dateTime(summary.data?.generated_at)}
            </span>
            <span>
              Candle: {dateTime(market.data?.updated_at)} · polling 15 detik
            </span>
          </footer>
        </main>
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pilih instrumen</DialogTitle>
            <DialogDescription>
              Masukkan simbol persis dari MT5. Ketersediaan mengikuti feed
              bridge, bukan daftar seluruh akun.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSymbol} className="space-y-4">
            <Label htmlFor="symbol">Simbol MT5</Label>
            <Input
              id="symbol"
              placeholder="Contoh: XAUUSDm"
              value={draftSymbol}
              onChange={(e) => setDraftSymbol(e.target.value)}
              maxLength={20}
              autoComplete="off"
            />
            {symbolError && (
              <p role="alert" className="text-xs text-destructive">
                {symbolError}
              </p>
            )}
            <div className="flex gap-2">
              {['XAUUSDm', 'XAUUSD', 'GOLD'].map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => chooseSymbol(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
            <Button type="submit" className="w-full">
              Buka chart <ArrowUpRight />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workspace yang dapat ditelusuri</DialogTitle>
            <DialogDescription>
              Fitur yang tersedia mengikuti koneksi data dan engine saat ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-xs leading-relaxed">
            <p>
              <strong className="text-primary">Tersedia:</strong> chart MT5
              dengan polling, indikator visual, gambar manual sementara, level
              entry/SL sinyal tersimpan, ringkasan database, informasi akun MT5,
              dan kalkulator anggaran berdasarkan saldo terminal.
            </p>
            <p>
              <strong className="text-amber-200">Belum tersedia:</strong>{' '}
              analisis AI, order manual/otomatis, feed berita, dan
              kalender ekonomi. Kontrol tersebut dinonaktifkan sampai backend
              terhubung.
            </p>
            <p className="text-muted-foreground">
              Indikator chart dihitung untuk visualisasi. Gambar manual hilang
              saat mengganti instrumen/timeframe atau memuat ulang. Koneksi API
              tidak membuktikan worker trading aktif.
            </p>
            <p className="text-muted-foreground">
              Pembaruan chart 15 detik, ringkasan 30 detik. Data dengan
              timestamp lebih dari 60 detik ditandai kedaluwarsa.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
