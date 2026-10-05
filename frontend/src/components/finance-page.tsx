import { useState, useMemo } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Calendar,
  Clock,
  DollarSign,
  Layers,
  Percent,
  RefreshCw,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useFinance } from '@/hooks/useFinance'
import { number, type TerminalAccount } from '@/lib/api'
import type { FinancePeriod } from '@/types/finance'
import { cn } from '@/lib/utils'

export function FinancePage({ account }: { account?: TerminalAccount }) {
  const [selectedPeriod, setSelectedPeriod] = useState<FinancePeriod>('daily')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'ai' | 'manual'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { overview, pendingOrders, isLoadingOverview, refetchFinance } = useFinance(
    selectedPeriod,
    selectedPeriod === 'custom' ? customStart : undefined,
    selectedPeriod === 'custom' ? customEnd : undefined
  )

  const handleRefresh = () => {
    refetchFinance()
  }


  // Quick preset dates for custom filter
  const applyPreset = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    setCustomStart(start.toISOString().split('T')[0])
    setCustomEnd(end.toISOString().split('T')[0])
    setSelectedPeriod('custom')
  }

  const netProfit = overview?.net_profit ?? 0.0
  const isNetProfitPositive = netProfit >= 0

  // Filter deals by source and search query
  const filteredDeals = useMemo(() => {
    if (!overview?.deals) return []
    return overview.deals.filter((d) => {
      // Source filter
      if (sourceFilter === 'ai' && d.source !== 'ai') return false
      if (sourceFilter === 'manual' && d.source !== 'manual') return false

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchSymbol = d.symbol.toLowerCase().includes(query)
        const matchTicket = d.ticket.toString().includes(query)
        const matchComment = d.comment?.toLowerCase().includes(query)
        if (!matchSymbol && !matchTicket && !matchComment) return false
      }

      return true
    })
  }, [overview?.deals, sourceFilter, searchQuery])

  // AI vs Manual performance metrics
  const aiProfit = overview?.ai_profit ?? 0.0
  const manualProfit = overview?.manual_profit ?? 0.0
  const aiTrades = overview?.ai_trades_count ?? 0
  const manualTrades = overview?.manual_trades_count ?? 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <TrendingUp className="size-6 text-primary" />
              Laporan & Manajemen Keuangan
            </h1>
            <Badge variant="outline" className="border-primary/40 text-primary text-[11px]">
              MT5 DEMO
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Pantau arus kas trading, rasio kemenangan, perbandingan performa AI vs Manual, dan riwayat deals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {account && (
            <div className="text-right hidden md:block">
              <p className="text-xs font-semibold text-foreground">{account.name}</p>
              <p className="text-[10px] text-muted-foreground font-mono">
                #{account.login} · {account.server}
              </p>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoadingOverview}
            className="text-xs gap-1.5 h-8"
          >
            <RefreshCw className={cn('size-3.5', isLoadingOverview && 'animate-spin')} />
            Segarkan Data
          </Button>
        </div>
      </div>

      {/* Timeframe Filter Bar */}
      <Card className="border-border bg-card/70 backdrop-blur-md">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <span className="text-xs font-semibold">Pilih Rentang Waktu:</span>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['daily', 'Harian (Hari Ini)'],
                  ['weekly', 'Mingguan (7 Hari)'],
                  ['monthly', 'Bulanan (30 Hari)'],
                  ['yearly', 'Tahunan (Tahun Ini)'],
                  ['custom', 'Kustom 📅'],
                ] as const
              ).map(([p, label]) => (
                <Button
                  key={p}
                  size="sm"
                  variant={selectedPeriod === p ? 'default' : 'outline'}
                  onClick={() => setSelectedPeriod(p)}
                  className={cn(
                    'text-xs h-8 px-3 transition-all',
                    selectedPeriod === p ? 'font-semibold shadow-md' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {selectedPeriod === 'custom' && (
            <div className="pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Dari:</span>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 w-36 text-xs bg-background"
                />
                <span className="text-muted-foreground">Sampai:</span>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 w-36 text-xs bg-background"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground text-[11px] mr-1">Preset Cepat:</span>
                <Button size="xs" variant="ghost" onClick={() => applyPreset(7)} className="text-[11px] h-7">
                  7 Hari
                </Button>
                <Button size="xs" variant="ghost" onClick={() => applyPreset(14)} className="text-[11px] h-7">
                  14 Hari
                </Button>
                <Button size="xs" variant="ghost" onClick={() => applyPreset(30)} className="text-[11px] h-7">
                  30 Hari
                </Button>
                <Button size="xs" variant="ghost" onClick={() => applyPreset(90)} className="text-[11px] h-7">
                  3 Bulan
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Profit */}
        <Card
          className={cn(
            'border relative overflow-hidden transition-all',
            isNetProfitPositive
              ? 'border-emerald-500/40 bg-emerald-950/20 shadow-emerald-950/20'
              : 'border-rose-500/40 bg-rose-950/20 shadow-rose-950/20'
          )}
        >
          <div className="absolute right-3 top-3">
            {isNetProfitPositive ? (
              <TrendingUp className="size-5 text-emerald-400" />
            ) : (
              <TrendingDown className="size-5 text-rose-400" />
            )}
          </div>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Net Profit ({overview?.period_label ?? 'Periode'})</p>
            <div className="flex items-baseline gap-1">
              <span
                className={cn(
                  'font-mono text-2xl font-bold tracking-tight',
                  isNetProfitPositive ? 'text-emerald-400' : 'text-rose-400'
                )}
              >
                {isNetProfitPositive ? '+' : ''}${number(netProfit, 2)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Gross: <span className="text-emerald-400">+${number(overview?.gross_profit ?? 0, 2)}</span> ·{' '}
              Loss: <span className="text-rose-400">${number(overview?.gross_loss ?? 0, 2)}</span>
            </p>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card className="border-border bg-card/80 relative overflow-hidden">
          <div className="absolute right-3 top-3">
            <Percent className="size-5 text-primary/70" />
          </div>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Rasio Kemenangan (Win Rate)</p>
            <p className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {overview?.win_rate ?? 0}%
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">
              <span className="text-emerald-400">{overview?.winning_trades ?? 0} Menang</span> ·{' '}
              <span className="text-rose-400">{overview?.losing_trades ?? 0} Kalah</span>
            </p>
          </CardContent>
        </Card>

        {/* Profit Factor */}
        <Card className="border-border bg-card/80 relative overflow-hidden">
          <div className="absolute right-3 top-3">
            <DollarSign className="size-5 text-amber-400/70" />
          </div>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Profit Factor</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                {overview?.profit_factor ?? 0}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {(overview?.profit_factor ?? 0) >= 1.5
                  ? 'Sangat Sehat'
                  : (overview?.profit_factor ?? 0) >= 1.0
                  ? 'Menguntungkan'
                  : 'Drawdown'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Avg: ${(overview?.avg_trade_profit ?? 0).toFixed(2)} / transaksi
            </p>
          </CardContent>
        </Card>

        {/* Total Trades & Volume */}
        <Card className="border-border bg-card/80 relative overflow-hidden">
          <div className="absolute right-3 top-3">
            <Layers className="size-5 text-sky-400/70" />
          </div>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Total Transaksi Selesai</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                {overview?.trades_count ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">Deals</span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Aktif: {overview?.active_positions_count ?? 0} posisi ({overview?.active_positions_volume ?? 0} lot)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Autopilot vs Manual Trading Comparison Banner */}
      <Card className="border-border bg-linear-to-r from-purple-950/20 via-background to-blue-950/20 overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border/60">
          <CardTitle className="text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-purple-400" />
              <span>Perbandingan Performa: AI Autopilot vs Trading Manual</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-normal">
              {overview?.period_label ?? 'Periode Ini'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AI Box */}
          <div className="rounded-lg border border-purple-500/30 bg-purple-950/15 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bot className="size-4 text-purple-400" />
                <span className="text-xs font-bold text-purple-300">AI Autopilot Agent</span>
              </div>
              <Badge variant="outline" className="border-purple-500/50 text-purple-300 text-[10px]">
                Magic #889900
              </Badge>
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <div>
                <p className="text-[11px] text-muted-foreground">Net PnL AI</p>
                <p
                  className={cn(
                    'font-mono text-xl font-bold',
                    aiProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}
                >
                  {aiProfit >= 0 ? '+' : ''}${number(aiProfit, 2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">Total Transaksi</p>
                <p className="font-mono text-base font-bold text-foreground">{aiTrades} deals</p>
              </div>
            </div>
          </div>

          {/* Manual Box */}
          <div className="rounded-lg border border-blue-500/30 bg-blue-950/15 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <User className="size-4 text-blue-400" />
                <span className="text-xs font-bold text-blue-300">Trading Manual</span>
              </div>
              <Badge variant="outline" className="border-blue-500/50 text-blue-300 text-[10px]">
                Web & MT5 Terminal
              </Badge>
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <div>
                <p className="text-[11px] text-muted-foreground">Net PnL Manual</p>
                <p
                  className={cn(
                    'font-mono text-xl font-bold',
                    manualProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}
                >
                  {manualProfit >= 0 ? '+' : ''}${number(manualProfit, 2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">Total Transaksi</p>
                <p className="font-mono text-base font-bold text-foreground">{manualTrades} deals</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Closed Deals History Table with Source Filter */}
      <Card className="border-border bg-card/80">
        <CardHeader className="py-3 px-4 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">
                Riwayat Transaksi Tertutup ({filteredDeals.length} deals)
              </CardTitle>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search Box */}
              <div className="relative w-44">
                <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cari simbol / tiket..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-8 text-xs bg-background"
                />
              </div>

              {/* Source Filter Pills */}
              <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-md border border-border/60">
                {(
                  [
                    ['all', `Semua (${overview?.deals?.length ?? 0})`],
                    ['ai', `🤖 AI (${aiTrades})`],
                    ['manual', `👤 Manual (${manualTrades})`],
                  ] as const
                ).map(([sf, label]) => (
                  <Button
                    key={sf}
                    size="xs"
                    variant={sourceFilter === sf ? 'secondary' : 'ghost'}
                    onClick={() => setSourceFilter(sf)}
                    className={cn(
                      'text-[10px] h-6 px-2.5',
                      sourceFilter === sf && 'font-semibold bg-background shadow-xs'
                    )}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredDeals.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Tidak ada data transaksi tertutup pada periode dan filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground text-[11px]">
                    <th className="text-left py-2.5 px-4 font-medium">Tiket & Order</th>
                    <th className="text-left py-2.5 px-3 font-medium">Waktu Tutup</th>
                    <th className="text-left py-2.5 px-3 font-medium">Simbol</th>
                    <th className="text-left py-2.5 px-3 font-medium">Aksi</th>
                    <th className="text-left py-2.5 px-3 font-medium">Sumber</th>
                    <th className="text-right py-2.5 px-3 font-medium">Volume</th>
                    <th className="text-right py-2.5 px-3 font-medium">Harga Tutup</th>
                    <th className="text-right py-2.5 px-4 font-medium">Profit / Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredDeals.map((d) => (
                    <tr key={d.ticket} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-foreground">#{d.ticket}</span>
                        {d.order ? <span className="text-[10px] text-muted-foreground block">Order #{d.order}</span> : null}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                        {new Date(d.time).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-foreground">{d.symbol}</td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant={d.action === 'BUY' ? 'default' : 'destructive'}
                          className="text-[9px] px-1.5 py-0 h-4"
                        >
                          {d.action}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] px-1.5 py-0 h-4 font-normal',
                            d.source === 'ai'
                              ? 'border-purple-500/50 text-purple-300 bg-purple-500/10'
                              : 'border-sky-500/50 text-sky-300 bg-sky-500/10'
                          )}
                        >
                          {d.source === 'ai' ? '🤖 AI Autopilot' : '👤 Manual'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{d.volume} Lot</td>
                      <td className="py-2.5 px-3 text-right text-foreground">@{number(d.price, 2)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span
                          className={cn(
                            'font-bold text-sm',
                            d.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          )}
                        >
                          {d.profit >= 0 ? '+' : ''}${number(d.profit, 2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Orders Section (Stop & Limit orders) */}
      <Card className="border-border bg-card/80">
        <CardHeader className="py-3 px-4 border-b border-border/60">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="size-4 text-amber-400" />
              Transaksi Belum Dieksekusi / Pending Orders ({pendingOrders.length})
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">
              Menunggu trigger harga pasar
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pendingOrders.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Tidak ada pending order aktif di terminal MT5 saat ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground text-[11px]">
                    <th className="text-left py-2 px-4 font-medium">Tiket</th>
                    <th className="text-left py-2 px-3 font-medium">Simbol</th>
                    <th className="text-left py-2 px-3 font-medium">Tipe Order</th>
                    <th className="text-right py-2 px-3 font-medium">Volume</th>
                    <th className="text-right py-2 px-3 font-medium">Harga Target</th>
                    <th className="text-right py-2 px-3 font-medium">SL / TP</th>
                    <th className="text-left py-2 px-4 font-medium">Waktu Pasang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {pendingOrders.map((o) => (
                    <tr key={o.ticket} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-foreground">#{o.ticket}</td>
                      <td className="py-2.5 px-3 font-bold">{o.symbol}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="border-amber-500/50 text-amber-300 text-[10px]">
                          {o.type}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">{o.volume} Lot</td>
                      <td className="py-2.5 px-3 text-right font-bold">@{number(o.price_open, 2)}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground text-[11px]">
                        SL: {o.sl ? number(o.sl, 2) : '-'} | TP: {o.tp ? number(o.tp, 2) : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-[11px]">
                        {new Date(o.time_setup).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
