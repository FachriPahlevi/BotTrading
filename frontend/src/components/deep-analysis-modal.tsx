import { useState, useId } from 'react'
import {
  Check,
  ChevronRight,
  Layers,
  Save,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeepAnalysisChart } from '@/components/deep-analysis-chart'
import { MultiAgentComparison } from '@/components/multi-agent-comparison'
import type { AiAnalysisResult } from '@/types/ai'
import type { StrategyPlanItem } from '@/types/strategy'
import { cn } from '@/lib/utils'

export interface DeepAnalysisModalProps {
  open: boolean
  onClose: () => void
  analysis: AiAnalysisResult | null
  marketCandles?: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>
  onSaveStrategy?: (plan: StrategyPlanItem) => void
  onApplyToWorkspace?: (plan: StrategyPlanItem) => void
  onOpenTrade?: (plan: StrategyPlanItem) => void
}

export function DeepAnalysisModal({
  open,
  onClose,
  analysis,
  marketCandles,
  onSaveStrategy,
  onApplyToWorkspace,
  onOpenTrade,
}: DeepAnalysisModalProps) {
  const [activePlanId, setActivePlanId] = useState<string>('plan_a')
  const [activeAgentKey, setActiveAgentKey] = useState<string>('')
  const [viewMode, setViewMode] = useState<'compare' | 'detail'>('compare')

  const [showZones, setShowZones] = useState(true)
  const [showTrade, setShowTrade] = useState(true)
  const [showPath, setShowPath] = useState(true)
  const [showEma, setShowEma] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [savedSuccess, setSavedSuccess] = useState(false)

  // Unique IDs for checkbox accessibility
  const zonesId = useId()
  const tradeId = useId()
  const pathId = useId()
  const emaId = useId()
  const labelsId = useId()

  if (!open || !analysis) return null

  const agentResults = analysis.agent_results || {}
  const hasMultipleAgents = Object.keys(agentResults).length > 1

  // Resolved analysis based on user model selection
  const currentAnalysis: AiAnalysisResult =
    activeAgentKey && agentResults[activeAgentKey]
      ? agentResults[activeAgentKey]
      : analysis

  const plans: StrategyPlanItem[] =
    currentAnalysis.plans && currentAnalysis.plans.length > 0
      ? currentAnalysis.plans
      : [
          {
            id: 'plan_a',
            name: 'A. Skenario Utama',
            direction: (currentAnalysis.bias === 'LONG' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
            trigger: 'Konfirmasi candle pada area entri',
            entry: currentAnalysis.scenarios?.main?.entry_min ?? currentAnalysis.last_price ?? 0,
            stop_loss: currentAnalysis.scenarios?.main?.stop_loss ?? 0,
            take_profit_1: currentAnalysis.scenarios?.main?.take_profit_1 ?? 0,
            take_profit_2: currentAnalysis.scenarios?.main?.take_profit_2 ?? 0,
            rr_ratio: `1 : ${currentAnalysis.scenarios?.main?.rr_ratio ?? 2.0}`,
            is_main: true,
          },
        ]

  const activePlan = plans.find((p) => p.id === activePlanId) || plans[0]

  const handleSave = () => {
    if (onSaveStrategy && activePlan) {
      onSaveStrategy(activePlan)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    }
  }

  const handleSelectAgentFromCompare = (agentKey: string) => {
    setActiveAgentKey(agentKey)
    setViewMode('detail')
  }

  const symbol = currentAnalysis.symbol || 'XAUUSD'
  const lastPrice = currentAnalysis.last_price ?? (marketCandles?.slice(-1)[0]?.close ?? 0)
  const bias = currentAnalysis.bias || 'WAIT'
  const isBearish = bias.toUpperCase().includes('SHORT') || bias.toUpperCase().includes('BEAR')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 md:p-6 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-[#0f1318] text-[#e4e7eb] shadow-2xl">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-[#2a313b] bg-[#171c23] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-foreground md:text-lg">
                  {symbol} – Analisis Komparatif Multi-Agent
                </h1>
                <Badge variant={isBearish ? 'destructive' : 'default'} className="text-[10px] uppercase font-bold tracking-wider">
                  {bias} ({currentAnalysis.confidence ?? 80}%)
                </Badge>
              </div>
              <p className="text-[11px] text-[#98a2b0]">
                {currentAnalysis.provider_name || currentAnalysis.provider} · Data OHLC MT5 terintegrasi
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              className={cn(
                'h-8 text-xs font-medium gap-1.5 transition-all',
                savedSuccess ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300' : 'text-primary'
              )}
            >
              {savedSuccess ? (
                <>
                  <Check className="size-3.5" /> Tersimpan ke Manajemen Strategi
                </>
              ) : (
                <>
                  <Save className="size-3.5" /> Simpan Plan
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Tutup"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* View Mode Switcher Subheader (Compare Mode vs Detail Mode) */}
        {hasMultipleAgents && (
          <div className="flex items-center justify-between border-b border-[#2a313b] bg-[#131722] px-5 py-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('compare')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-all',
                  viewMode === 'compare'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-[#1f242d] hover:text-foreground'
                )}
              >
                <Layers className="size-3.5" /> Matriks Perbandingan Agen ({Object.keys(agentResults).length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detail')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-all',
                  viewMode === 'detail'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-[#1f242d] hover:text-foreground'
                )}
              >
                <Sparkles className="size-3.5" /> Detail Analisis & Chart Visual
              </button>
            </div>

            {/* Quick Model Selector when in detail mode */}
            {viewMode === 'detail' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Model:</span>
                {Object.keys(agentResults).map((aid) => (
                  <button
                    key={aid}
                    type="button"
                    onClick={() => setActiveAgentKey(aid)}
                    className={cn(
                      'rounded px-2 py-0.5 text-[10px] font-medium border transition-colors',
                      (activeAgentKey === aid || (!activeAgentKey && aid === analysis.primary_agent))
                        ? 'border-primary bg-primary/20 text-primary font-bold'
                        : 'border-[#2a313b] text-muted-foreground hover:bg-[#1f242d]'
                    )}
                  >
                    {aid.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-7 text-sm leading-relaxed">
          {viewMode === 'compare' && hasMultipleAgents ? (
            /* Multi-Agent Side-by-Side Comparison Matrix */
            <MultiAgentComparison
              analysis={analysis}
              activeAgentKey={activeAgentKey || analysis.primary_agent}
              onSelectAgent={handleSelectAgentFromCompare}
              onApplyPlan={(res) => {
                if (res.agent_id) setActiveAgentKey(res.agent_id)
                setViewMode('detail')
              }}
            />
          ) : (
            /* Detailed Single-Agent Breakdown View */
            <>
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-3 shadow-sm">
                  <span className="block font-mono text-lg font-bold text-foreground">
                    ≈ {lastPrice ? lastPrice.toLocaleString('id-ID', { minimumFractionDigits: 2 }) : '-'}
                  </span>
                  <span className="text-[11px] text-[#98a2b0]">Harga terakhir</span>
                </div>
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-3 shadow-sm">
                  <span className={cn('flex items-center gap-1 font-mono text-lg font-bold', isBearish ? 'text-rose-400' : 'text-emerald-400')}>
                    {isBearish ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
                    {bias}
                  </span>
                  <span className="text-[11px] text-[#98a2b0]">Bias model aktif</span>
                </div>
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-3 shadow-sm">
                  <span className="block font-mono text-lg font-bold text-amber-300">
                    {currentAnalysis.key_resistance ?? '-'}
                  </span>
                  <span className="text-[11px] text-[#98a2b0]">Resistance kunci</span>
                </div>
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-3 shadow-sm">
                  <span className="block font-mono text-lg font-bold text-cyan-300">
                    {currentAnalysis.key_support ?? '-'}
                  </span>
                  <span className="text-[11px] text-[#98a2b0]">Support kunci</span>
                </div>
                <div className="rounded-lg border border-[#2a313b] bg-[#171c23] p-3 shadow-sm">
                  <span className="block font-mono text-lg font-bold text-foreground">
                    {currentAnalysis.decision || 'WAIT'}
                  </span>
                  <span className="text-[11px] text-[#98a2b0]">Keputusan gerbang</span>
                </div>
              </div>

              {/* Interactive Plan Selector Bar */}
              {plans.length > 0 && (
                <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-primary">
                      <Layers className="size-3.5" /> Skenario Trading Plan:
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Level Entry, SL, TP & Rasio R:R terhitung
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {plans.map((p) => {
                      const isSelected = p.id === activePlan.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setActivePlanId(p.id)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-[#2a313b] bg-[#171c23] text-muted-foreground hover:bg-[#202732] hover:text-foreground'
                          )}
                        >
                          <span>{p.name}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1 py-0 border-current',
                              isSelected ? 'border-primary-foreground/30 text-primary-foreground' : p.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                            )}
                          >
                            {p.direction}
                          </Badge>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Layer Toggles Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#2a313b] bg-[#131722] px-3.5 py-2 text-xs">
                <span className="font-semibold text-muted-foreground">Layer Visual:</span>
                <div className="flex flex-wrap items-center gap-4">
                  <label htmlFor={zonesId} className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      id={zonesId}
                      type="checkbox"
                      checked={showZones}
                      onChange={(e) => setShowZones(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>Zona S/R</span>
                  </label>
                  <label htmlFor={tradeId} className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      id={tradeId}
                      type="checkbox"
                      checked={showTrade}
                      onChange={(e) => setShowTrade(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>Posisi {activePlan.direction.toLowerCase()}</span>
                  </label>
                  <label htmlFor={pathId} className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      id={pathId}
                      type="checkbox"
                      checked={showPath}
                      onChange={(e) => setShowPath(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>Skenario harga</span>
                  </label>
                  <label htmlFor={emaId} className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      id={emaId}
                      type="checkbox"
                      checked={showEma}
                      onChange={(e) => setShowEma(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>EMA</span>
                  </label>
                  <label htmlFor={labelsId} className="flex cursor-pointer items-center gap-1.5 hover:text-foreground">
                    <input
                      id={labelsId}
                      type="checkbox"
                      checked={showLabels}
                      onChange={(e) => setShowLabels(e.target.checked)}
                      className="rounded border-[#2a313b] accent-primary"
                    />
                    <span>Label candle</span>
                  </label>
                </div>
              </div>

              {/* Vector Candlestick Chart */}
              <div className="space-y-1.5">
                <DeepAnalysisChart
                  symbol={symbol}
                  interval={currentAnalysis.interval || '1D'}
                  lastPrice={lastPrice}
                  activePlan={activePlan}
                  visualData={currentAnalysis.visual_data}
                  marketCandles={marketCandles}
                  showZones={showZones}
                  showTrade={showTrade}
                  showPath={showPath}
                  showEma={showEma}
                  showLabels={showLabels}
                />
                <p className="text-[11px] text-[#98a2b0] italic">
                  Data candle dihitung langsung dari live MT5 feed. Indikator teknikal berbasis bar tertutup.
                </p>
              </div>

              {/* Detail Sections */}
              <div className="space-y-6 pt-2">
                {/* 1. Kesimpulan */}
                <section className="space-y-2">
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs text-primary font-bold">1</span>
                    Kesimpulan Analisis
                  </h2>
                  <p className="text-foreground/90 leading-relaxed">
                    {currentAnalysis.conclusion || currentAnalysis.summary || 'Analisis teknikal berbasis level harga pasar aktif.'}
                  </p>
                </section>

                {/* 2. Rationale & Argumen Model */}
                <section className="space-y-2.5">
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs text-primary font-bold">2</span>
                    Alasan & Argumen Model
                  </h2>
                  <ul className="space-y-2 pl-4 list-disc text-foreground/90">
                    {(currentAnalysis.rationale || []).map((point, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {point}
                      </li>
                    ))}
                  </ul>
                </section>

                {/* 3. Teknikal & Level Kunci */}
                <section className="space-y-2.5">
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs text-primary font-bold">3</span>
                    Metrik Teknikal Nyata
                  </h2>
                  <ul className="space-y-2 pl-4 list-disc text-foreground/90">
                    {(currentAnalysis.technical || []).map((point, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {point}
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Invalidation Note */}
                {currentAnalysis.invalidation && (
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    <b>Invalidasi bias:</b> {currentAnalysis.invalidation}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2a313b] bg-[#171c23] px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs text-[#98a2b0]">
            <span>Skenario:</span>
            <Badge variant="outline" className="font-mono text-xs">
              {activePlan.name}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {onApplyToWorkspace && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onApplyToWorkspace(activePlan)
                  onClose()
                }}
                className="text-xs gap-1"
              >
                <ChevronRight className="size-3.5" /> Terapkan ke Workspace
              </Button>
            )}
            {onOpenTrade && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  onOpenTrade(activePlan)
                  onClose()
                }}
                className="text-xs gap-1 font-semibold"
              >
                <Send className="size-3.5" /> Eksekusi Plan ({activePlan.direction})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
              Tutup
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
