import { useState, useMemo } from 'react'
import {
  Check,
  Copy,
  Download,
  FileCode,
  Filter,
  Layers,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DeepAnalysisChart } from '@/components/deep-analysis-chart'
import { useStrategyPlans } from '@/hooks/useStrategyPlans'
import type { StrategyPlanRecord, StrategyPlanItem } from '@/types/strategy'
import { cn } from '@/lib/utils'

export function StrategyManagementPage({
  onSelectPlanToWorkspace,
  onOpenTradeExecution,
}: {
  onSelectPlanToWorkspace?: (symbol: string, plan: StrategyPlanItem) => void
  onOpenTradeExecution?: (symbol: string, plan: StrategyPlanItem) => void
}) {
  const { plans, isLoading, savePlan, deletePlan } = useStrategyPlans()

  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBias, setFilterBias] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL')

  // Selected strategy's active plan scenario (e.g. plan_a, plan_b)
  const [activeScenarioId, setActiveScenarioId] = useState<string>('')

  // Chart toggles for selected strategy
  const [showZones, setShowZones] = useState(true)
  const [showTrade, setShowTrade] = useState(true)
  const [showPath, setShowPath] = useState(true)
  const [showEma, setShowEma] = useState(true)
  const [showLabels, setShowLabels] = useState(true)

  // Create strategy modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSymbol, setNewSymbol] = useState('XAUUSD')
  const [newInterval, setNewInterval] = useState('1d')
  const [newBias, setNewBias] = useState<'BEARISH' | 'BULLISH'>('BEARISH')
  const [newPlanName, setNewPlanName] = useState('Plan 1 - Skenario Utama')
  const [newEntry, setNewEntry] = useState('4215')
  const [newSL, setNewSL] = useState('4265')
  const [newTP1, setNewTP1] = useState('4110')
  const [newTP2, setNewTP2] = useState('4000')
  const [newNotes, setNewNotes] = useState('Tunggu konfirmasi penolakan candle sebelum entri.')

  // Unique symbols for filter pills
  const availableSymbols = useMemo(() => {
    const set = new Set<string>()
    plans.forEach((p) => set.add(p.symbol))
    return Array.from(set)
  }, [plans])

  // Filtered plans list
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const matchSearch =
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.symbol.toLowerCase().includes(searchQuery.toLowerCase())
      const matchSymbol = filterSymbol === 'ALL' || p.symbol === filterSymbol
      const matchBias =
        filterBias === 'ALL' ||
        (filterBias === 'BUY' && (p.bias.includes('LONG') || p.bias.includes('BULL'))) ||
        (filterBias === 'SELL' && (p.bias.includes('SHORT') || p.bias.includes('BEAR')))
      return matchSearch && matchSymbol && matchBias
    })
  }, [plans, searchQuery, filterSymbol, filterBias])

  // Current selected strategy record
  const selectedRecord: StrategyPlanRecord | undefined = useMemo(() => {
    if (selectedPlanId) {
      return plans.find((p) => p.id === selectedPlanId)
    }
    return filteredPlans[0] || plans[0]
  }, [plans, selectedPlanId, filteredPlans])

  // Scenarios inside current selected strategy
  const scenarios: StrategyPlanItem[] = useMemo(() => {
    if (!selectedRecord?.payload?.plans || selectedRecord.payload.plans.length === 0) {
      return [
        {
          id: 'plan_main',
          name: 'Plan Utama',
          direction: (selectedRecord?.bias?.includes('LONG') ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
          trigger: 'Konfirmasi candle',
          entry: selectedRecord?.payload?.last_price ?? 4132,
          stop_loss: 4265,
          take_profit_1: 4110,
          rr_ratio: '1 : 2.0',
          is_main: true,
        },
      ]
    }
    return selectedRecord.payload.plans
  }, [selectedRecord])

  // Active scenario for chart rendering
  const currentScenario =
    scenarios.find((s) => s.id === activeScenarioId) || scenarios[0]

  // KPI stats
  const stats = useMemo(() => {
    const total = plans.length
    const sellCount = plans.filter((p) => p.bias.includes('SHORT') || p.bias.includes('BEAR')).length
    const buyCount = plans.filter((p) => p.bias.includes('LONG') || p.bias.includes('BULL')).length
    return { total, sellCount, buyCount }
  }, [plans])

  // Handle create strategy submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const entryNum = parseFloat(newEntry) || 4200
    const slNum = parseFloat(newSL) || 4250
    const tp1Num = parseFloat(newTP1) || 4100
    const tp2Num = parseFloat(newTP2) || 4000
    const diff = Math.abs(entryNum - slNum) || 1
    const rr = `1 : ${((Math.abs(entryNum - tp1Num)) / diff).toFixed(1)}`

    const newRecordPayload = {
      title: newTitle || `${newSymbol} – Skenario ${newBias}`,
      symbol: newSymbol.toUpperCase(),
      interval: newInterval,
      bias: newBias,
      status: 'active',
      payload: {
        title: newTitle || `${newSymbol} – Skenario ${newBias}`,
        symbol: newSymbol.toUpperCase(),
        interval: newInterval,
        last_price: entryNum,
        bias: newBias,
        conclusion: newNotes,
        fundamental: ['Analisis fundamental kustom.'],
        technical: [newNotes],
        volume: 'Analisis volume terkonfirmasi.',
        seasonality_and_timing: {
          seasonality: 'Siklus musiman komoditas.',
          trading_hours_wib: 'Sesi London 14.00 WIB, New York 20.30 WIB.',
          economic_calendar: 'Hindari rilis berita berdampak tinggi.',
        },
        invalidation: `Batalkan jika harga menyentuh SL ${slNum}.`,
        plans: [
          {
            id: 'plan_1',
            name: newPlanName,
            direction: (newBias === 'BULLISH' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
            trigger: newNotes,
            entry: entryNum,
            stop_loss: slNum,
            take_profit_1: tp1Num,
            take_profit_2: tp2Num,
            rr_ratio: rr,
            is_main: true,
            notes: newNotes,
          },
        ],
      },
    }

    const created = await savePlan(newRecordPayload)
    setSelectedPlanId(created.id)
    setCreateModalOpen(false)
  }

  // Duplicate plan
  const handleDuplicate = async (rec: StrategyPlanRecord) => {
    const copyPayload = JSON.parse(JSON.stringify(rec.payload))
    await savePlan({
      title: `${rec.title} (Salinan)`,
      symbol: rec.symbol,
      interval: rec.interval,
      bias: rec.bias,
      status: 'draft',
      payload: copyPayload,
    })
  }

  // Export JSON
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(plans, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aurum_strategies_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Sparkles className="size-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Manajemen Strategi & Rencana Trading
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Simpan dan kelola berbagai skenario rencana trading (Plan 1, Plan 2, dsb.) lengkap dengan gambar chart interaktif, level SL/TP, analisis fundamental, teknikal, dan jam trading ala TradingView.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            className="text-xs gap-1.5"
          >
            <Download className="size-3.5" /> Ekspor JSON
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="text-xs gap-1.5 font-semibold"
          >
            <Plus className="size-4" /> + Buat Strategi Baru
          </Button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5">
          <span className="text-[11px] font-medium text-muted-foreground">Total Strategi Tersimpan</span>
          <p className="mt-1 font-mono text-xl font-bold text-foreground">{stats.total}</p>
        </Card>
        <Card className="p-3.5">
          <span className="text-[11px] font-medium text-muted-foreground">Skenario SELL (Bearish)</span>
          <p className="mt-1 font-mono text-xl font-bold text-rose-400">{stats.sellCount}</p>
        </Card>
        <Card className="p-3.5">
          <span className="text-[11px] font-medium text-muted-foreground">Skenario BUY (Bullish)</span>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-400">{stats.buyCount}</p>
        </Card>
        <Card className="p-3.5">
          <span className="text-[11px] font-medium text-muted-foreground">Simbol Terpantau</span>
          <p className="mt-1 font-mono text-xl font-bold text-primary">{availableSymbols.length || 1}</p>
        </Card>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Strategy Library List (5 cols) */}
        <div className="space-y-4 lg:col-span-4">
          <Card className="p-4 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari strategi atau simbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                size="xs"
                variant={filterBias === 'ALL' ? 'secondary' : 'ghost'}
                onClick={() => setFilterBias('ALL')}
                className="text-[11px]"
              >
                Semua
              </Button>
              <Button
                size="xs"
                variant={filterBias === 'SELL' ? 'destructive' : 'ghost'}
                onClick={() => setFilterBias('SELL')}
                className="text-[11px]"
              >
                SELL
              </Button>
              <Button
                size="xs"
                variant={filterBias === 'BUY' ? 'secondary' : 'ghost'}
                onClick={() => setFilterBias('BUY')}
                className={cn('text-[11px]', filterBias === 'BUY' && 'bg-emerald-600 text-white')}
              >
                BUY
              </Button>
            </div>
          </Card>

          {/* List of Saved Strategies */}
          <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
            {isLoading ? (
              <p className="text-xs text-muted-foreground p-4 text-center">Memuat strategi tersimpan...</p>
            ) : filteredPlans.length === 0 ? (
              <Card className="p-8 text-center space-y-2">
                <p className="text-xs text-muted-foreground">Belum ada strategi tersimpan yang cocok.</p>
                <Button size="xs" onClick={() => setCreateModalOpen(true)}>
                  Buat Strategi Sekarang
                </Button>
              </Card>
            ) : (
              filteredPlans.map((rec) => {
                const isSelected = selectedRecord?.id === rec.id
                const isBear = rec.bias.includes('SHORT') || rec.bias.includes('BEAR')
                const planCount = rec.payload?.plans?.length ?? 1

                return (
                  <Card
                    key={rec.id}
                    onClick={() => {
                      setSelectedPlanId(rec.id)
                      setActiveScenarioId(rec.payload?.plans?.[0]?.id || '')
                    }}
                    className={cn(
                      'cursor-pointer p-3.5 transition-all hover:border-primary/50 relative group',
                      isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={isBear ? 'destructive' : 'default'}
                            className="text-[9px] px-1.5 py-0 uppercase font-bold"
                          >
                            {isBear ? 'SELL' : 'BUY'}
                          </Badge>
                          <span className="font-mono text-xs font-bold text-foreground">
                            {rec.symbol} · {rec.interval.toUpperCase()}
                          </span>
                        </div>
                        <h2 className="mt-1 text-xs font-semibold text-foreground line-clamp-1">
                          {rec.title}
                        </h2>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-foreground"
                          title="Duplikasi"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDuplicate(rec)
                          }}
                        >
                          <Copy className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-rose-400 hover:text-rose-300"
                          title="Hapus"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Hapus strategi "${rec.title}"?`)) {
                              deletePlan(rec.id)
                            }
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2 font-mono">
                      <span>{planCount} Skenario Plan</span>
                      <span className="text-primary font-medium">
                        R:R {rec.payload?.plans?.[0]?.rr_ratio || '1 : 2.0'}
                      </span>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Strategy Detail & Vector Chart (7 cols) */}
        <div className="space-y-6 lg:col-span-8">
          {selectedRecord ? (
            <Card className="overflow-hidden p-4 md:p-6 space-y-6 bg-[#0f1318] border-[#2a313b] text-[#e4e7eb]">
              {/* Strategy Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a313b] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        selectedRecord.bias.includes('SHORT') || selectedRecord.bias.includes('BEAR')
                          ? 'destructive'
                          : 'default'
                      }
                      className="text-[10px] font-bold"
                    >
                      {selectedRecord.bias.toUpperCase()}
                    </Badge>
                    <h2 className="text-lg font-bold text-foreground">
                      {selectedRecord.title}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-[#98a2b0]">
                    {selectedRecord.payload.date_str ||
                      `Disimpan pada ${selectedRecord.created_at ? new Date(selectedRecord.created_at).toLocaleString('id-ID') : 'Sesi aktif'}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {onSelectPlanToWorkspace && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5"
                      onClick={() => onSelectPlanToWorkspace(selectedRecord.symbol, currentScenario)}
                    >
                      <Sparkles className="size-3.5 text-primary" /> Terapkan ke Workspace
                    </Button>
                  )}
                  {onOpenTradeExecution && (
                    <Button
                      size="sm"
                      className="text-xs gap-1.5 font-semibold"
                      onClick={() => onOpenTradeExecution(selectedRecord.symbol, currentScenario)}
                    >
                      <Send className="size-3.5" /> Eksekusi Order MT5
                    </Button>
                  )}
                </div>
              </div>

              {/* Metric 5-Card Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs">
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-2.5">
                  <span className="block font-mono text-base font-bold text-foreground">
                    ≈ {(selectedRecord.payload.last_price || 4132).toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-[#98a2b0]">Harga terakhir</span>
                </div>
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-2.5">
                  <span className="block font-mono text-base font-bold text-amber-300">
                    {selectedRecord.payload.key_resistance || '4.230'}
                  </span>
                  <span className="text-[10px] text-[#98a2b0]">Resistance kunci</span>
                </div>
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-2.5">
                  <span className="block font-mono text-base font-bold text-cyan-300">
                    {selectedRecord.payload.key_support || '4.100–4.110'}
                  </span>
                  <span className="text-[10px] text-[#98a2b0]">Support kunci</span>
                </div>
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-2.5">
                  <span className="block font-mono text-base font-bold text-primary">
                    {currentScenario.rr_ratio || '1 : 2.1'}
                  </span>
                  <span className="text-[10px] text-[#98a2b0]">Rasio R:R Plan</span>
                </div>
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-2.5">
                  <span className="block font-mono text-base font-bold text-foreground">
                    {selectedRecord.payload.record_change || '−26% dari rekor'}
                  </span>
                  <span className="text-[10px] text-[#98a2b0]">Status pergerakan</span>
                </div>
              </div>

              {/* Plan Switcher Pills (Plan 1, Plan 2, Plan 3, etc.) */}
              <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Layers className="size-3.5" /> Pilih Skenario Plan:
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Ganti plan untuk memperbarui posisi trade box & lintasan path pada chart
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {scenarios.map((sc) => {
                    const isCur = sc.id === currentScenario.id
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => setActiveScenarioId(sc.id)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                          isCur
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-[#2a313b] bg-[#171c23] text-muted-foreground hover:bg-[#202732] hover:text-foreground'
                        )}
                      >
                        <span>{sc.name}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] px-1 py-0',
                            isCur ? 'text-primary-foreground border-primary-foreground/30' : sc.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                          )}
                        >
                          {sc.direction}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Layer Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2a313b] bg-[#131722] px-3.5 py-2 text-xs">
                <span className="font-semibold text-muted-foreground">Layer Visual:</span>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={showZones}
                      onChange={(e) => setShowZones(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>Zona S/R</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={showTrade}
                      onChange={(e) => setShowTrade(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>Posisi trade</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={showPath}
                      onChange={(e) => setShowPath(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>Skenario harga</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={showEma}
                      onChange={(e) => setShowEma(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>EMA 10</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={showLabels}
                      onChange={(e) => setShowLabels(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>Label candle</span>
                  </label>
                </div>
              </div>

              {/* The Interactive Vector Candlestick Chart */}
              <DeepAnalysisChart
                symbol={selectedRecord.symbol}
                interval={selectedRecord.interval}
                lastPrice={selectedRecord.payload.last_price}
                activePlan={currentScenario}
                visualData={selectedRecord.payload.visual_data}
                showZones={showZones}
                showTrade={showTrade}
                showPath={showPath}
                showEma={showEma}
                showLabels={showLabels}
              />

              {/* Detailed 6 Analysis Sections */}
              <div className="space-y-6 pt-3 text-xs leading-relaxed border-t border-[#2a313b]">
                {/* 1. Kesimpulan */}
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">1. Kesimpulan</h3>
                  <p className="text-foreground/90">{selectedRecord.payload.conclusion}</p>
                </div>

                {/* 2. Fundamental */}
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">2. Fundamental</h3>
                  <ul className="list-disc pl-4 space-y-1 text-foreground/90">
                    {selectedRecord.payload.fundamental?.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>

                {/* 3. Teknikal & pola candle */}
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">3. Teknikal & Pola Candle</h3>
                  <ul className="list-disc pl-4 space-y-1 text-foreground/90">
                    {selectedRecord.payload.technical?.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>

                {/* 4. Volume */}
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">4. Volume & Momentum</h3>
                  <p className="text-foreground/90">{selectedRecord.payload.volume}</p>
                </div>

                {/* 5. Musim & waktu */}
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">5. Musim & Waktu</h3>
                  <ul className="list-disc pl-4 space-y-1 text-foreground/90">
                    <li><b>Musiman:</b> {selectedRecord.payload.seasonality_and_timing?.seasonality}</li>
                    <li><b>Jam trading (WIB):</b> {selectedRecord.payload.seasonality_and_timing?.trading_hours_wib}</li>
                    <li><b>Kalender penting:</b> {selectedRecord.payload.seasonality_and_timing?.economic_calendar}</li>
                  </ul>
                </div>

                {/* 6. Rencana Trading Table */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">6. Rencana Trading</h3>
                  <div className="overflow-x-auto rounded-lg border border-[#2a313b]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#2a313b] bg-[#171c23] font-semibold text-foreground">
                          <th className="p-2.5">Skenario</th>
                          <th className="p-2.5">Entry</th>
                          <th className="p-2.5">SL</th>
                          <th className="p-2.5">TP Target</th>
                          <th className="p-2.5">RR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a313b]">
                        {scenarios.map((sc) => (
                          <tr key={sc.id} className={cn(sc.id === currentScenario.id && 'bg-primary/10')}>
                            <td className="p-2.5">
                              <span className={cn('font-bold', sc.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400')}>
                                {sc.name}
                              </span>
                              <span className="block text-[10px] text-[#98a2b0]">{sc.trigger}</span>
                            </td>
                            <td className="p-2.5 font-mono text-amber-200">{sc.entry.toLocaleString('id-ID')}</td>
                            <td className="p-2.5 font-mono text-rose-300">{sc.stop_loss.toLocaleString('id-ID')}</td>
                            <td className="p-2.5 font-mono text-emerald-300">
                              {[sc.take_profit_1, sc.take_profit_2, sc.take_profit_3].filter(Boolean).map(n => n?.toLocaleString('id-ID')).join(' / ')}
                            </td>
                            <td className="p-2.5 font-mono text-foreground">{sc.rr_ratio}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-[#98a2b0]">
                    <b>Invalidasi:</b> {selectedRecord.payload.invalidation}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-12 text-center text-muted-foreground text-xs">
              Pilih strategi di sebelah kiri untuk melihat visual chart dan detail rencananya.
            </Card>
          )}
        </div>
      </div>

      {/* Modal Buat Strategi Baru */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-5 space-y-4 border-[#2a313b] bg-[#171c23] text-[#e4e7eb] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2a313b] pb-3">
              <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
                <Plus className="size-4 text-primary" /> Buat Strategi / Rencana Baru
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setCreateModalOpen(false)}
              >
                ✕
              </Button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#98a2b0]">Judul Strategi</label>
                <Input
                  required
                  placeholder="Contoh: XAUUSD – Skenario Breakout Neckline"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="h-8 text-xs bg-[#0f1318] border-[#2a313b]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[#98a2b0]">Simbol</label>
                  <Input
                    required
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    className="h-8 text-xs uppercase font-mono bg-[#0f1318] border-[#2a313b]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[#98a2b0]">Timeframe</label>
                  <Input
                    required
                    value={newInterval}
                    onChange={(e) => setNewInterval(e.target.value)}
                    className="h-8 text-xs font-mono bg-[#0f1318] border-[#2a313b]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-[#98a2b0]">Bias Arah</label>
                  <select
                    value={newBias}
                    onChange={(e) => setNewBias(e.target.value as 'BEARISH' | 'BULLISH')}
                    className="h-8 w-full rounded border border-[#2a313b] bg-[#0f1318] px-2 text-xs text-foreground"
                  >
                    <option value="BEARISH">BEARISH (Sell)</option>
                    <option value="BULLISH">BULLISH (Buy)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#98a2b0]">Nama Skenario Plan 1</label>
                <Input
                  required
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  className="h-8 text-xs bg-[#0f1318] border-[#2a313b]"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-amber-300">Entry</label>
                  <Input
                    type="number"
                    step="any"
                    required
                    value={newEntry}
                    onChange={(e) => setNewEntry(e.target.value)}
                    className="h-8 text-xs font-mono bg-[#0f1318] border-[#2a313b]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-rose-300">Stop Loss (SL)</label>
                  <Input
                    type="number"
                    step="any"
                    required
                    value={newSL}
                    onChange={(e) => setNewSL(e.target.value)}
                    className="h-8 text-xs font-mono bg-[#0f1318] border-[#2a313b]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-emerald-300">Target TP1</label>
                  <Input
                    type="number"
                    step="any"
                    required
                    value={newTP1}
                    onChange={(e) => setNewTP1(e.target.value)}
                    className="h-8 text-xs font-mono bg-[#0f1318] border-[#2a313b]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-emerald-300">Target TP2</label>
                  <Input
                    type="number"
                    step="any"
                    value={newTP2}
                    onChange={(e) => setNewTP2(e.target.value)}
                    className="h-8 text-xs font-mono bg-[#0f1318] border-[#2a313b]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#98a2b0]">Catatan & Trigger Konfirmasi</label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full rounded border border-[#2a313b] bg-[#0f1318] p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#2a313b]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Batal
                </Button>
                <Button type="submit" size="sm" className="font-semibold">
                  Simpan Strategi
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
