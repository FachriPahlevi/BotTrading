import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { number } from '@/lib/api'
import type { AiAnalysisResult } from '@/types/ai'
import { cn } from '@/lib/utils'

export interface MultiAgentComparisonProps {
  analysis: AiAnalysisResult
  activeAgentKey?: string
  onSelectAgent?: (agentKey: string) => void
  onApplyPlan?: (agentResult: AiAnalysisResult) => void
}

export function MultiAgentComparison({
  analysis,
  activeAgentKey,
  onSelectAgent,
  onApplyPlan,
}: MultiAgentComparisonProps) {
  const agentResults = analysis.agent_results || {}
  const consensus = analysis.consensus
  const agentKeys = Object.keys(agentResults)

  if (agentKeys.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Tidak ada data perbandingan multi-agent.
      </div>
    )
  }

  const isConsensusBear =
    consensus?.bias?.toUpperCase().includes('BEAR') ||
    consensus?.bias?.toUpperCase().includes('SHORT')
  const isConsensusBull =
    consensus?.bias?.toUpperCase().includes('BULL') ||
    consensus?.bias?.toUpperCase().includes('LONG')

  return (
    <div className="space-y-6">
      {/* 1. Consensus Banner */}
      {consensus && (
        <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-background to-primary/5 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Sparkles className="size-4" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Konsensus Multi-Agent AI
                </span>
                <Badge
                  variant={isConsensusBear ? 'destructive' : isConsensusBull ? 'default' : 'outline'}
                  className="font-mono text-xs font-bold"
                >
                  {consensus.bias}
                </Badge>
              </div>
              <p className="text-xs text-foreground/90 sm:text-sm">
                {consensus.summary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
              <div className="rounded-lg border border-border bg-background/80 px-3 py-1.5 text-center">
                <span className="block font-mono text-xs text-muted-foreground">
                  Tingkat Kesepakatan
                </span>
                <span className="font-mono text-sm font-bold text-foreground">
                  {consensus.agreement_ratio} Agent
                </span>
              </div>
              <div className="rounded-lg border border-border bg-background/80 px-3 py-1.5 text-center">
                <span className="block font-mono text-xs text-muted-foreground">
                  Rata-rata Keyakinan
                </span>
                <span className="font-mono text-sm font-bold text-primary">
                  {consensus.average_confidence}%
                </span>
              </div>
            </div>
          </div>

          {/* Vote Breakdown Pills */}
          {consensus.votes && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
              <span className="text-[11px] font-medium">Distribusi Arah:</span>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-950/40 px-2 py-0.5 text-emerald-400 border border-emerald-800/40">
                <TrendingUp className="size-3" /> Bullish ({consensus.votes.LONG || 0})
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-rose-950/40 px-2 py-0.5 text-rose-400 border border-rose-800/40">
                <TrendingDown className="size-3" /> Bearish ({consensus.votes.SHORT || 0})
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-muted-foreground border border-border">
                Wait / Netral ({consensus.votes.WAIT || 0})
              </span>
            </div>
          )}
        </div>
      )}

      {/* 2. Side-by-Side Agent Comparison Cards Grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="size-4 text-primary" /> Matriks Perbandingan Agen ({agentKeys.length} Agen Dipilih)
          </h2>
          <span className="text-[11px] text-muted-foreground">
            Bandingkan rasio R:R, level entry, SL, TP & argumen masing-masing model
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agentKeys.map((key) => {
            const agentData = agentResults[key]
            const isCurrentActive = activeAgentKey === key
            const isBear =
              agentData.bias?.toUpperCase().includes('BEAR') ||
              agentData.bias?.toUpperCase().includes('SHORT')
            const isFailed = agentData.status === 'failed'
            const isSkipped = agentData.status === 'skipped'
            const isWarning = agentData.status === 'warning'
            const mainPlan = agentData.plans?.[0]

            return (
              <Card
                key={key}
                className={cn(
                  'relative flex flex-col justify-between overflow-hidden border transition-all duration-200',
                  isCurrentActive
                    ? 'border-primary ring-1 ring-primary/40 bg-primary/[0.02]'
                    : isFailed
                    ? 'border-rose-900/40 bg-rose-950/[0.04]'
                    : 'border-border/70 hover:border-border hover:bg-card/60'
                )}
              >
                {/* Agent Card Header */}
                <div className="border-b border-border/60 bg-muted/30 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background border border-border text-primary">
                        {key === 'gemini' ? (
                          <Sparkles className="size-4 text-amber-400" />
                        ) : key === 'claude' ? (
                          <Bot className="size-4 text-orange-400" />
                        ) : (
                          <Cpu className="size-4 text-blue-400" />
                        )}
                      </span>
                      <div className="truncate">
                        <h3 className="truncate text-xs font-bold text-foreground">
                          {agentData.provider_name || key.toUpperCase()}
                        </h3>
                        <span className="text-[10px] text-muted-foreground uppercase font-mono">
                          ID: {key}
                        </span>
                      </div>
                    </div>

                    <Badge
                      variant={isFailed ? 'destructive' : isBear ? 'destructive' : 'default'}
                      className={cn(
                        'shrink-0 text-[10px] font-bold',
                        isSkipped && 'bg-muted text-muted-foreground border-border',
                        isFailed && 'bg-rose-950/80 text-rose-300 border-rose-800'
                      )}
                    >
                      {isSkipped ? 'SKIPPED' : isFailed ? 'FAILED' : `${agentData.bias} (${agentData.confidence ?? 80}%)`}
                    </Badge>
                  </div>

                  {/* Failure / Quota Notice */}
                  {isFailed && (
                    <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-rose-500/30 bg-rose-950/30 p-2 text-[10px] text-rose-300">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-rose-400" />
                      <span className="leading-tight">
                        {agentData.summary || agentData.error_message || `Gagal memproses model (${agentData.error_code || 'error'}).`}
                      </span>
                    </div>
                  )}

                  {/* Warning Notice if API key exhausted */}
                  {isWarning && (
                    <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-950/20 p-2 text-[10px] text-amber-300">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <span className="leading-tight">
                        {agentData.error_message || 'Fallback mode terkalibrasi aktif.'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Agent Card Body */}
                <div className="flex-1 p-3.5 space-y-3.5 text-xs">
                  {/* Setup & Levels */}
                  {mainPlan ? (
                    <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/60 p-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground font-medium">Skenario:</span>
                        <span className="font-semibold text-foreground truncate max-w-[170px]">
                          {mainPlan.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Entry:</span>
                        <span className="font-mono text-amber-300 font-medium">
                          {number(mainPlan.entry, 2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Stop Loss (SL):</span>
                        <span className="font-mono text-rose-300 font-medium">
                          {number(mainPlan.stop_loss, 2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Take Profit (TP1):</span>
                        <span className="font-mono text-emerald-300 font-medium">
                          {number(mainPlan.take_profit_1, 2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border/40 pt-1">
                        <span className="text-muted-foreground">Risk/Reward:</span>
                        <span className="font-mono font-bold text-primary">
                          {mainPlan.rr_ratio}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/60 bg-background/60 p-2 text-center text-muted-foreground text-[11px]">
                      Tidak ada detail skenario plan.
                    </div>
                  )}

                  {/* Key S/R */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded border border-border/50 bg-muted/20 p-1.5 text-center">
                      <span className="block text-[9px] text-muted-foreground">Resistance</span>
                      <span className="font-mono font-bold text-amber-300">
                        {agentData.key_resistance || '-'}
                      </span>
                    </div>
                    <div className="rounded border border-border/50 bg-muted/20 p-1.5 text-center">
                      <span className="block text-[9px] text-muted-foreground">Support</span>
                      <span className="font-mono font-bold text-cyan-300">
                        {agentData.key_support || '-'}
                      </span>
                    </div>
                  </div>

                  {/* Conclusion Snippet */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Argumen Model:
                    </span>
                    <p className="line-clamp-3 text-[11px] leading-relaxed text-foreground/80">
                      {agentData.conclusion ||
                        agentData.rationale?.[0] ||
                        'Analisis teknikal mengindikasikan zona konfirmasi sebelum entry.'}
                    </p>
                  </div>
                </div>

                {/* Agent Card Footer Action */}
                <div className="border-t border-border/60 bg-muted/20 p-2.5 flex items-center gap-2">
                  {onSelectAgent && (
                    <Button
                      size="sm"
                      variant={isCurrentActive ? 'default' : 'outline'}
                      disabled={isFailed || isSkipped}
                      className={cn(
                        'flex-1 text-xs font-semibold gap-1.5 h-8',
                        isCurrentActive && 'bg-primary text-primary-foreground',
                        (isFailed || isSkipped) && 'opacity-50 cursor-not-allowed'
                      )}
                      onClick={() => onSelectAgent(key)}
                    >
                      {isCurrentActive ? (
                        <>
                          <Check className="size-3.5" /> Plan Aktif
                        </>
                      ) : isFailed ? (
                        <>Plan Tidak Tersedia</>
                      ) : (
                        <>Pilih Plan Ini</>
                      )}
                    </Button>
                  )}

                  {onApplyPlan && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-8 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => onApplyPlan(agentData)}
                      title="Gunakan analisis ini untuk overlay chart utama"
                    >
                      <ChevronRight className="size-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
