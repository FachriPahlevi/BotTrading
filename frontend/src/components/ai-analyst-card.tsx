import { RefreshCw, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { number, type AiAnalysisResult } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AiAnalystCard({
  aiAnalysis,
  aiAnalyzing,
  aiError,
  onRunAnalysis,
}: {
  aiAnalysis: AiAnalysisResult | null
  aiAnalyzing: boolean
  aiError: string | null
  onRunAnalysis: () => void
}) {
  return (
    <Card className="ai-panel relative">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI market analyst
          </span>
          <Badge
            variant={
              aiAnalysis
                ? aiAnalysis.bias === 'LONG'
                  ? 'default'
                  : aiAnalysis.bias === 'SHORT'
                    ? 'destructive'
                    : 'outline'
                : 'outline'
            }
            className="text-[9px]"
          >
            {aiAnalysis
              ? `${aiAnalysis.bias} (${aiAnalysis.confidence}%)`
              : 'Siap dianalisis'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {aiAnalysis ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide">
                  {aiAnalysis.symbol} · {aiAnalysis.interval}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {aiAnalysis.provider}
                </span>
              </div>
              {aiAnalysis.scenarios?.main && (
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry Range:</span>
                    <span className="font-mono text-amber-200">
                      {number(aiAnalysis.scenarios.main.entry_min, 2)} –{' '}
                      {number(aiAnalysis.scenarios.main.entry_max, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stop Loss (SL):</span>
                    <span className="font-mono text-rose-300">
                      {number(aiAnalysis.scenarios.main.stop_loss, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target TP1:</span>
                    <span className="font-mono text-emerald-300">
                      {number(aiAnalysis.scenarios.main.take_profit_1, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Risk/Reward:</span>
                    <span className="font-mono font-medium text-primary">
                      1 : {aiAnalysis.scenarios.main.rr_ratio}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                Alasan & Konteks Analisis:
              </p>
              <ul className="space-y-1.5 text-xs leading-relaxed text-foreground">
                {aiAnalysis.rationale?.map((reason, idx) => (

                  <li key={idx} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={aiAnalyzing}
              onClick={onRunAnalysis}
            >
              <RefreshCw
                className={cn('size-3', aiAnalyzing && 'animate-spin')}
              />
              Analisis ulang chart
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-5 flex justify-center pt-2">
              <div className="ai-orbit">
                <Sparkles className="size-7 text-primary" />
              </div>
            </div>
            <h2 className="text-center text-base font-medium">
              Dari pergerakan ke perspektif.
            </h2>
            <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
              Skenario, level penting, dan alasan analisis akan hadir langsung pada
              chart.
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
            <Button
              className="w-full"
              disabled={aiAnalyzing}
              onClick={onRunAnalysis}
            >
              <Sparkles className={cn('size-3', aiAnalyzing && 'animate-spin')} />
              {aiAnalyzing ? 'Menganalisis chart…' : 'Analisis chart aktif'}
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
