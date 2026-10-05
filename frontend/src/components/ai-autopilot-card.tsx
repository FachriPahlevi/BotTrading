import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  DollarSign,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Square,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useAutopilot } from '@/hooks/useAutopilot'
import { number } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AiAutopilotCard({
  symbol,
  interval,
}: {
  symbol: string
  interval: string
}) {
  const {
    status,
    startAutopilot,
    isStarting,
    pauseAutopilot,
    isPausing,
    stopAutopilot,
    isStopping,
    stepAutopilot,
    isStepping,
  } = useAutopilot()

  const [targetProfit, setTargetProfit] = useState('1000')
  const [maxLoss, setMaxLoss] = useState('200')
  const [volume, setVolume] = useState('0.01')
  const [actionError, setActionError] = useState<string | null>(null)

  const isRunning = status?.status === 'RUNNING'
  const isPaused = status?.status === 'PAUSED'
  const isTargetReached = status?.status === 'TARGET_REACHED'

  const currentTotalProfit = status?.total_profit ?? 0
  const targetVal = status?.target_profit ?? (parseFloat(targetProfit) || 1000)
  const progressPercent = status?.progress_percent ?? 0
  const remainingTarget = Math.max(0, targetVal - currentTotalProfit)

  async function handleStart() {
    setActionError(null)
    const tp = parseFloat(targetProfit)
    const ml = parseFloat(maxLoss)
    const vol = parseFloat(volume)

    if (!tp || tp <= 0) {
      setActionError('Target profit harus lebih besar dari 0')
      return
    }

    try {
      await startAutopilot({
        target_profit: tp,
        max_loss: ml || 200,
        volume: vol || 0.01,
        symbol,
        interval,
      })
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal memulai AI Autopilot')
    }
  }

  async function handlePause() {
    try {
      await pauseAutopilot()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal menjeda AI Autopilot')
    }
  }

  async function handleStop() {
    try {
      await stopAutopilot({ close_positions: true })
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghentikan AI Autopilot')
    }
  }

  async function handleStep() {
    try {
      await stepAutopilot()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Gagal menjalankan evaluasi')
    }
  }

  return (
    <Card className="border-border bg-gradient-to-b from-card via-card to-background relative overflow-hidden shadow-lg">
      {/* Background neon ambient highlight */}
      <div className={cn(
        'absolute -right-16 -top-16 h-36 w-36 rounded-full blur-3xl pointer-events-none transition-all duration-700',
        isRunning ? 'bg-emerald-500/20' : isTargetReached ? 'bg-amber-500/25' : 'bg-primary/10'
      )} />

      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <div className="relative">
              <Bot className="size-4 text-primary" />
              {isRunning && (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>
            AI Trading Agent (Autopilot)
          </CardTitle>

          <Badge
            variant="outline"
            className={cn(
              'px-2.5 py-0.5 text-[11px] font-mono font-medium transition-all gap-1.5',
              isRunning && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shadow-sm shadow-emerald-500/20',
              isTargetReached && 'border-amber-500/50 bg-amber-500/15 text-amber-300 animate-pulse',
              isPaused && 'border-amber-500/40 bg-amber-500/10 text-amber-400',
              !isRunning && !isPaused && !isTargetReached && 'border-border text-muted-foreground'
            )}
          >
            {isRunning ? (
              <>
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ACTIVE · RUNNING
              </>
            ) : isTargetReached ? (
              <>
                <Target className="size-3 text-amber-400" />
                TARGET TERCAPAI 🎯
              </>
            ) : isPaused ? (
              'DIJEDA'
            ) : (
              'STANDBY'
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Target Reached Banner */}
        {isTargetReached && (
          <div className="rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-emerald-500/15 p-3 text-xs text-amber-200 flex items-start gap-2.5 shadow-inner">
            <Flame className="size-5 shrink-0 text-amber-400 animate-bounce mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">SELAMAT! Target Profit ${number(targetVal, 2)} Telah Tercapai! 🎯</p>
              <p className="text-[11px] text-amber-200/90 mt-0.5">
                AI telah mengamankan keuntungan dan menutup semua posisi terbuka. Total profit sesi ini: <strong className="font-mono text-emerald-300">+${number(currentTotalProfit, 2)}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Target Profit & Progress Bar */}
        <div className="space-y-2 rounded-lg border border-border/80 bg-background/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <Target className="size-3.5 text-primary" /> Target Profit
            </span>
            <div className="font-mono text-xs font-bold text-foreground">
              <span className={cn(currentTotalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {currentTotalProfit >= 0 ? '+' : ''}${number(currentTotalProfit, 2)}
              </span>
              <span className="text-muted-foreground"> / ${number(targetVal, 2)}</span>
            </div>
          </div>

          {/* Glowing Animated Progress Bar */}
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/80">
            <div
              className={cn(
                'h-full transition-all duration-700 ease-out rounded-full',
                isTargetReached
                  ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-400 shadow-md shadow-amber-500/40'
                  : 'bg-gradient-to-r from-primary via-emerald-400 to-emerald-500'
              )}
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{progressPercent.toFixed(1)}% tercapai</span>
            {remainingTarget > 0 ? (
              <span className="font-mono">Sisa: ${remainingTarget.toFixed(2)} lagi</span>
            ) : (
              <span className="text-emerald-400 font-semibold font-mono">100% Target Berhasil!</span>
            )}
          </div>
        </div>

        {/* Live Session Stats Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-border/60 bg-background/40 p-2">
            <p className="text-[10px] text-muted-foreground">Floating PnL</p>
            <p className={cn(
              'font-mono text-xs font-bold mt-0.5',
              (status?.unrealized_profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            )}>
              {(status?.unrealized_profit ?? 0) >= 0 ? '+' : ''}${number(status?.unrealized_profit ?? 0, 2)}
            </p>
          </div>

          <div className="rounded border border-border/60 bg-background/40 p-2">
            <p className="text-[10px] text-muted-foreground">Total Transaksi</p>
            <p className="font-mono text-xs font-bold mt-0.5 text-foreground">
              {status?.trades_count ?? 0}
            </p>
          </div>

          <div className="rounded border border-border/60 bg-background/40 p-2">
            <p className="text-[10px] text-muted-foreground">Win / Loss</p>
            <p className="font-mono text-xs font-bold mt-0.5 text-emerald-400">
              {status?.winning_trades ?? 0} <span className="text-muted-foreground font-normal">/</span> <span className="text-rose-400">{status?.losing_trades ?? 0}</span>
            </p>
          </div>
        </div>

        {/* Configuration Inputs (disabled while running) */}
        {!isRunning && !isPaused && (
          <div className="space-y-3 rounded-lg border border-border/70 bg-background/30 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <Label htmlFor="ap-target" className="text-muted-foreground flex items-center gap-1">
                  <DollarSign className="size-3 text-emerald-400" /> Target Profit (USD)
                </Label>
                <div className="flex gap-1">
                  {[100, 500, 1000, 2500].map((val) => (
                    <Button
                      key={val}
                      size="xs"
                      variant={targetProfit === String(val) ? 'secondary' : 'ghost'}
                      onClick={() => setTargetProfit(String(val))}
                      className="px-1.5 text-[10px] h-5"
                    >
                      ${val}
                    </Button>
                  ))}
                </div>
              </div>
              <Input
                id="ap-target"
                type="number"
                step="50"
                min="10"
                value={targetProfit}
                onChange={(e) => setTargetProfit(e.target.value)}
                className="font-mono font-bold text-center text-emerald-400 border-emerald-500/30"
                placeholder="1000"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="ap-loss" className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Shield className="size-3 text-rose-400" /> Max Drawdown ($)
                </Label>
                <Input
                  id="ap-loss"
                  type="number"
                  step="50"
                  min="20"
                  value={maxLoss}
                  onChange={(e) => setMaxLoss(e.target.value)}
                  className="font-mono text-xs text-center border-rose-500/30"
                  placeholder="200"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="ap-vol" className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Zap className="size-3 text-primary" /> Volume (Lot)
                </Label>
                <Input
                  id="ap-vol"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="5.0"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  className="font-mono text-xs text-center"
                  placeholder="0.01"
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="space-y-2">
          {!isRunning && !isPaused ? (
            <Button
              size="lg"
              disabled={isStarting}
              onClick={handleStart}
              className="w-full h-12 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-md shadow-emerald-900/30 transition-all active:scale-[0.98] gap-2"
            >
              <Play className="size-4 fill-white" />
              Mulai AI Autopilot (Target ${number(parseFloat(targetProfit || '1000'), 2)})
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {isRunning ? (
                <Button
                  size="default"
                  variant="outline"
                  disabled={isPausing}
                  onClick={handlePause}
                  className="gap-1.5 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                >
                  <Pause className="size-3.5" /> Jeda Agent
                </Button>
              ) : (
                <Button
                  size="default"
                  disabled={isStarting}
                  onClick={handleStart}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Play className="size-3.5 fill-white" /> Lanjutkan
                </Button>
              )}

              <Button
                size="default"
                variant="destructive"
                disabled={isStopping}
                onClick={handleStop}
                className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Square className="size-3.5 fill-white" /> Hentikan & Tutup
              </Button>
            </div>
          )}

          {/* Manual immediate cycle trigger */}
          {isRunning && (
            <Button
              size="xs"
              variant="ghost"
              disabled={isStepping}
              onClick={handleStep}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground gap-1.5 h-7"
            >
              <RotateCcw className={cn('size-3', isStepping && 'animate-spin')} />
              Pindai & Evaluasi Pasar Sekarang
            </Button>
          )}
        </div>

        {actionError && (
          <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300 flex items-center gap-1.5">
            <AlertTriangle className="size-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Live Activity Feed / Terminal */}
        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1 text-[11px]">
              <Activity className="size-3 text-primary" /> Log Aktivitas Agent ({symbol})
            </span>
            <span className="font-mono text-[10px]">
              {status?.last_action || 'Standby'}
            </span>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1 rounded border border-border/80 bg-background/80 p-2 font-mono text-[10px] leading-relaxed">
            {status?.logs && status.logs.length > 0 ? (
              status.logs.map((log) => (
                <div key={log.id} className="flex items-start gap-1.5">
                  <span className={cn(
                    'shrink-0 font-bold px-1 rounded text-[9px]',
                    log.type === 'TARGET' && 'bg-amber-500/20 text-amber-300',
                    log.type === 'TRADE' && 'bg-emerald-500/20 text-emerald-300',
                    log.type === 'PROFIT' && 'bg-teal-500/20 text-teal-300',
                    log.type === 'WARN' && 'bg-rose-500/20 text-rose-300',
                    log.type === 'INFO' && 'text-muted-foreground'
                  )}>
                    [{log.type}]
                  </span>
                  <span className="text-foreground/90 break-words flex-1">
                    {log.message}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-center py-4 text-muted-foreground">
                Agent siap. Klik 'Mulai AI Autopilot' untuk memulai siklus trading otomatis.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
