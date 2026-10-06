import { useState } from 'react'
import {
  AlertTriangle,
  Bot,
  Check,
  Cpu,
  Layers,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { number } from '@/lib/api'
import type { AiAnalysisResult } from '@/types/ai'
import type { StrategyPlanItem } from '@/types/strategy'
import { cn } from '@/lib/utils'

export interface AiAnalystCardProps {
  aiAnalysis: AiAnalysisResult | null
  aiAnalyzing: boolean
  aiError: string | null
  onRunAnalysis: (agents?: string[]) => void
  onOpenDeepAnalysis?: () => void
  onSaveToStrategyManager?: (plan: StrategyPlanItem) => void
  selectedAgents?: string[]
  onSelectAgents?: (agents: string[]) => void
}

const AVAILABLE_AGENT_OPTIONS = [
  { id: 'gemini', label: 'Gemini AI', icon: Sparkles },
  { id: 'claude', label: 'Claude', icon: Bot },
  { id: 'rule_based', label: 'Internal', icon: Cpu },
]

export function AiAnalystCard({
  aiAnalysis,
  aiAnalyzing,
  aiError,
  onRunAnalysis,
  onOpenDeepAnalysis,
  onSaveToStrategyManager,
  selectedAgents: propAgents,
  onSelectAgents,
}: AiAnalystCardProps) {
  const [internalAgents, setInternalAgents] = useState<string[]>(['gemini', 'claude', 'rule_based'])
  const selectedAgents = propAgents ?? internalAgents
  const setSelectedAgents = onSelectAgents ?? setInternalAgents

  const [selectedPlanId, setSelectedPlanId] = useState<string>('plan_a')
  const [activeModelKey, setActiveModelKey] = useState<string>('')
  const [savedSuccess, setSavedSuccess] = useState(false)

  const toggleAgent = (agentId: string) => {
    let updated: string[]
    if (selectedAgents.includes(agentId)) {
      if (selectedAgents.length === 1) return // Keep at least one
      updated = selectedAgents.filter((id) => id !== agentId)
    } else {
      updated = [...selectedAgents, agentId]
    }
    setSelectedAgents(updated)
  }

  const selectAllAgents = () => {
    setSelectedAgents(['gemini', 'claude', 'rule_based'])
  }

  // Active analysis data: either primary or user-switched agent result
  const agentResults = aiAnalysis?.agent_results || {}
  const activeAnalysis: AiAnalysisResult =
    activeModelKey && agentResults[activeModelKey]
      ? agentResults[activeModelKey]
      : aiAnalysis || ({} as AiAnalysisResult)

  const plans: StrategyPlanItem[] =
    activeAnalysis?.plans && activeAnalysis.plans.length > 0
      ? activeAnalysis.plans
      : activeAnalysis?.scenarios?.main
      ? [
          {
            id: 'plan_a',
            name: 'A. Skenario Utama',
            direction: (activeAnalysis.bias === 'LONG' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
            trigger: 'Konfirmasi candle pasar',
            entry: activeAnalysis.scenarios.main.entry_min ?? activeAnalysis.last_price ?? 0,
            stop_loss: activeAnalysis.scenarios.main.stop_loss ?? 0,
            take_profit_1: activeAnalysis.scenarios.main.take_profit_1 ?? 0,
            take_profit_2: activeAnalysis.scenarios.main.take_profit_2 ?? 0,
            rr_ratio: `1 : ${activeAnalysis.scenarios.main.rr_ratio ?? 2.0}`,
            is_main: true,
          },
        ]
      : []

  const activePlan = plans.find((p) => p.id === selectedPlanId) || plans[0]

  const handleSave = () => {
    if (onSaveToStrategyManager && activePlan) {
      onSaveToStrategyManager(activePlan)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
    }
  }

  const isBear =
    activeAnalysis?.bias?.toUpperCase().includes('SHORT') ||
    activeAnalysis?.bias?.toUpperCase().includes('BEAR')

  const isAllSelected = selectedAgents.length === 3

  return (
    <Card className="ai-panel relative">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI Market Analyst
          </span>
          <div className="flex items-center gap-1.5">
            {aiAnalysis?.consensus && (
              <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                {aiAnalysis.consensus.agreement_ratio} {aiAnalysis.consensus.bias}
              </Badge>
            )}
            <Badge
              variant={
                aiAnalysis
                  ? isBear
                    ? 'destructive'
                    : 'default'
                  : 'outline'
              }
              className="text-[9px]"
            >
              {aiAnalysis
                ? `${activeAnalysis.bias || 'WAIT'} (${activeAnalysis.confidence ?? 80}%)`
                : 'Siap dianalisis'}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Agent Selector Controls */}
        <div className="mb-3.5 space-y-1.5 rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
              <Layers className="size-3 text-primary" /> Pilih AI Agent:
            </span>
            <button
              type="button"
              onClick={selectAllAgents}
              className={cn(
                'text-[10px] font-medium transition-colors hover:text-foreground',
                isAllSelected ? 'text-primary font-bold' : 'text-muted-foreground'
              )}
            >
              Pilih Semua (3)
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {AVAILABLE_AGENT_OPTIONS.map((opt) => {
              const isSelected = selectedAgents.includes(opt.id)
              const Icon = opt.icon
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleAgent(opt.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium border transition-all',
                    isSelected
                      ? 'border-primary/50 bg-primary/10 text-primary font-semibold shadow-xs'
                      : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="size-3" />
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {aiAnalysis ? (
          <div className="space-y-4">
            {/* Header Instrument & Switcher */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide">
                  {aiAnalysis.symbol} · {aiAnalysis.interval}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {activeAnalysis.provider_name || activeAnalysis.provider}
                </span>
              </div>

              {/* Multi-Agent Tabs Switcher */}
              {Object.keys(agentResults).length > 1 && (
                <div className="flex flex-wrap gap-1 border-t border-border/50 pt-2">
                  <span className="text-[10px] text-muted-foreground self-center mr-1">
                    Lihat Hasil:
                  </span>
                  {Object.entries(agentResults).map(([key, res]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveModelKey(key)}
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] font-medium border transition-colors',
                        (activeModelKey === key || (!activeModelKey && key === aiAnalysis.primary_agent))
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border/60 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {key.toUpperCase()} ({res.bias || 'WAIT'})
                    </button>
                  ))}
                </div>
              )}

              {/* Warning if agent failed / quota notice */}
              {activeAnalysis.status === 'failed' && (
                <div className="flex items-start gap-1.5 rounded bg-rose-950/20 p-2 text-[10px] text-rose-300 border border-rose-800/30">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-rose-400" />
                  <span className="leading-tight">
                    {activeAnalysis.summary || `Gagal memproses model (${activeAnalysis.error_code || 'error'}).`}
                  </span>
                </div>
              )}

              {/* Plan Switcher Pills */}
              {plans.length > 1 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlanId(p.id)}
                      className={cn(
                        'rounded px-2 py-0.5 text-[10px] font-medium border transition-colors',
                        p.id === activePlan?.id
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-border/60 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {p.name.split(' ')[0]} {p.direction}
                    </button>
                  ))}
                </div>
              )}

              {/* Active Plan Levels */}
              {activePlan && (
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Skenario:</span>
                    <span className="font-semibold text-foreground">{activePlan.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry Range:</span>
                    <span className="font-mono text-amber-200">
                      {number(activePlan.entry, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stop Loss (SL):</span>
                    <span className="font-mono text-rose-300">
                      {number(activePlan.stop_loss, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target TP1:</span>
                    <span className="font-mono text-emerald-300">
                      {number(activePlan.take_profit_1, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk/Reward:</span>
                    <span className="font-mono font-medium text-primary">
                      {activePlan.rr_ratio}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Rationale List */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                Alasan & Argumen Model:
              </p>
              <ul className="space-y-1.5 text-xs leading-relaxed text-foreground">
                {(activeAnalysis.rationale || []).map((reason, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {onOpenDeepAnalysis && (
                <Button
                  className="w-full text-xs font-semibold gap-1.5 bg-primary/90 hover:bg-primary"
                  onClick={onOpenDeepAnalysis}
                >
                  <Sparkles className="size-3.5" /> Buka Perbandingan & Analisis Lengkap
                </Button>
              )}

              {onSaveToStrategyManager && (
                <Button
                  variant="outline"
                  className={cn(
                    'w-full text-xs gap-1.5 transition-all',
                    savedSuccess && 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                  )}
                  onClick={handleSave}
                >
                  {savedSuccess ? (
                    <>
                      <Check className="size-3.5" /> Tersimpan ke Manajemen Strategi
                    </>
                  ) : (
                    <>
                      <Save className="size-3.5" /> Simpan Plan ke Manajemen Strategi
                    </>
                  )}
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                disabled={aiAnalyzing}
                onClick={() => onRunAnalysis(selectedAgents)}
              >
                <RefreshCw
                  className={cn('size-3 mr-1.5', aiAnalyzing && 'animate-spin')}
                />
                Analisis ulang ({selectedAgents.length} Agent)
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 flex justify-center pt-2">
              <div className="ai-orbit">
                <Sparkles className="size-7 text-primary" />
              </div>
            </div>
            <h2 className="text-center text-base font-medium">
              Analisis Komparatif Multi-Agent
            </h2>
            <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
              Pilih agent yang diinginkan (Gemini, Claude, atau Internal) untuk membandingkan akurasi dan konsensus arah pasar secara transparan.
            </p>
            <Button
              className="mt-4 w-full font-semibold shadow-md"
              disabled={aiAnalyzing}
              onClick={() => onRunAnalysis(selectedAgents)}
            >
              <Sparkles className={cn('size-3.5 mr-1.5', aiAnalyzing && 'animate-spin')} />
              {aiAnalyzing
                ? 'Menganalisis chart…'
                : `Jalankan Analisis (${selectedAgents.length} Agent)`}
            </Button>
          </>
        )}
        {aiError && (
          <p className="mt-2 text-center text-[10px] text-rose-300">
            {aiError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
