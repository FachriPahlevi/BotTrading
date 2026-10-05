import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Layers,
  Percent,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useTrade } from '@/hooks/useTrade'
import { number, type TerminalAccount } from '@/lib/api'
import { cn } from '@/lib/utils'

export function TradePanel({
  symbol,
  currentPrice,
  account,
}: {
  symbol: string
  currentPrice?: number
  account?: TerminalAccount
}) {
  const {
    positions,
    submitOrder,
    closePosition,
    closeAllPositions,
    isSubmitting,
    isClosing,
    isClosingAll,
  } = useTrade()

  const [volume, setVolume] = useState('0.01')
  const [sl, setSl] = useState('')
  const [tp, setTp] = useState('')
  const [lastOrderMessage, setLastOrderMessage] = useState<string | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)

  // Auto Close Feature States
  const [autoCloseActive, setAutoCloseActive] = useState(false)
  const [targetProfitLimit, setTargetProfitLimit] = useState('50')
  const [maxLossLimit, setMaxLossLimit] = useState('30')
  const [showAutoCloseSettings, setShowAutoCloseSettings] = useState(false)

  // Track which ticket is currently closing
  const [closingTicket, setClosingTicket] = useState<number | null>(null)

  const price = currentPrice || 2700.0
  const spread = 0.20
  const ask = price + spread
  const bid = price

  // Calculate total floating PnL of all open positions
  const totalFloatingPnl = positions.reduce((acc, p) => acc + (p.profit ?? 0), 0)

  // Auto Close Protection Engine
  useEffect(() => {
    if (!autoCloseActive || positions.length === 0 || isClosingAll) return

    const tpVal = parseFloat(targetProfitLimit)
    const slVal = parseFloat(maxLossLimit)

    if (Number.isFinite(tpVal) && tpVal > 0 && totalFloatingPnl >= tpVal) {
      setAutoCloseActive(false)
      void closeAllPositions().then((res) => {
        setLastOrderMessage(`🎯 AUTO CLOSE DIPICU: Target Profit $${tpVal} tercapai! ${res.message}`)
      })
    } else if (Number.isFinite(slVal) && slVal > 0 && totalFloatingPnl <= -slVal) {
      setAutoCloseActive(false)
      void closeAllPositions().then((res) => {
        setLastOrderMessage(`🛡️ AUTO CLOSE DIPICU: Batas Risiko -$${slVal} tersentuh! ${res.message}`)
      })
    }
  }, [totalFloatingPnl, autoCloseActive, positions.length, isClosingAll, targetProfitLimit, maxLossLimit])

  function adjustVolume(delta: number) {
    const current = parseFloat(volume) || 0.01
    const next = Math.max(0.01, Math.min(10.0, current + delta))
    setVolume(next.toFixed(2))
  }

  function autoSl(direction: 'BUY' | 'SELL') {
    const pips = 20 * 0.1
    if (direction === 'BUY') {
      setSl((ask - pips).toFixed(2))
    } else {
      setSl((bid + pips).toFixed(2))
    }
  }

  function autoTp(direction: 'BUY' | 'SELL') {
    const pips = 40 * 0.1
    if (direction === 'BUY') {
      setTp((ask + pips).toFixed(2))
    } else {
      setTp((bid - pips).toFixed(2))
    }
  }

  async function handleOrder(action: 'BUY' | 'SELL') {
    setLastOrderMessage(null)
    setOrderError(null)

    const vol = parseFloat(volume)
    if (!Number.isFinite(vol) || vol <= 0) {
      setOrderError('Volume lot tidak valid')
      return
    }

    const slVal = sl ? parseFloat(sl) : undefined
    const tpVal = tp ? parseFloat(tp) : undefined

    if (slVal) {
      if (action === 'BUY' && slVal >= ask) {
        setOrderError(`Untuk BUY, Stop Loss harus di bawah harga entri (${ask.toFixed(2)})`)
        return
      }
      if (action === 'SELL' && slVal <= bid) {
        setOrderError(`Untuk SELL, Stop Loss harus di atas harga entri (${bid.toFixed(2)})`)
        return
      }
    }

    try {
      const res = await submitOrder({
        symbol,
        action,
        volume: vol,
        sl: slVal,
        tp: tpVal,
        mode: 'demo',
        source: 'manual',
      })
      setLastOrderMessage(res.message)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Eksekusi order gagal'
      setOrderError(message)
    }
  }

  // Handle Close (Full or Partial)
  async function handleClose(ticket: number, partial = false, originalVolume = 0.01) {
    setClosingTicket(ticket)
    setOrderError(null)
    try {
      const volToClose = partial ? Math.max(0.01, Math.round((originalVolume / 2) * 100) / 100) : undefined
      const res = await closePosition(volToClose ? { ticket, volume: volToClose } : ticket)
      setLastOrderMessage(res.message)
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : 'Gagal menutup posisi')
    } finally {
      setClosingTicket(null)
    }
  }

  // Handle Emergency Close All
  async function handleCloseAll() {
    setOrderError(null)
    try {
      const res = await closeAllPositions()
      setLastOrderMessage(res.message)
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : 'Gagal menutup seluruh posisi')
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="size-4 text-primary" /> Eksekusi Order Langsung MT5
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 gap-1.5 text-[11px] font-mono font-medium px-2 py-0.5">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              MT5 DEMO
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-2 text-[11px] text-emerald-300">
          <ShieldAlert className="size-4 shrink-0 text-emerald-400" />
          <span>
            Integrasi langsung ke MT5 aktif. Pastikan tombol <strong>Algo Trading</strong> di MT5 menyala hijau (Ctrl + E).
          </span>
        </div>

        {/* Volume Lot */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <Label htmlFor="trade-volume" className="text-muted-foreground">Volume (Lot)</Label>
            <span className="font-mono text-[11px] text-muted-foreground">Min 0.01 · Step 0.01</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon-xs" variant="outline" onClick={() => adjustVolume(-0.01)}>−</Button>
            <Input
              id="trade-volume"
              type="number"
              step="0.01"
              min="0.01"
              max="10.0"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className="text-center font-mono font-semibold"
            />
            <Button size="icon-xs" variant="outline" onClick={() => adjustVolume(0.01)}>+</Button>
            <div className="flex gap-1">
              {[0.01, 0.05, 0.1].map((val) => (
                <Button
                  key={val}
                  size="xs"
                  variant="ghost"
                  onClick={() => setVolume(val.toFixed(2))}
                  className="px-2 text-[10px]"
                >
                  {val}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* SL & TP Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="trade-sl" className="text-xs text-rose-300">Stop Loss (SL)</Label>
              <button
                type="button"
                onClick={() => autoSl('BUY')}
                className="text-[10px] text-primary hover:underline"
              >
                Auto SL
              </button>
            </div>
            <Input
              id="trade-sl"
              type="number"
              step="0.01"
              placeholder="Contoh: 2680.00"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              className="font-mono text-xs border-rose-500/20 focus-visible:ring-rose-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="trade-tp" className="text-xs text-emerald-300">Take Profit (TP)</Label>
              <button
                type="button"
                onClick={() => autoTp('BUY')}
                className="text-[10px] text-primary hover:underline"
              >
                Auto TP
              </button>
            </div>
            <Input
              id="trade-tp"
              type="number"
              step="0.01"
              placeholder="Contoh: 2740.00"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              className="font-mono text-xs border-emerald-500/20 focus-visible:ring-emerald-500/30"
            />
          </div>
        </div>

        {/* BUY & SELL Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button
            size="lg"
            variant="destructive"
            disabled={isSubmitting}
            onClick={() => handleOrder('SELL')}
            className="flex h-14 flex-col justify-center bg-rose-600 hover:bg-rose-700 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <ArrowDownRight className="size-4" /> SELL
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight">
              {number(bid, 2)}
            </span>
          </Button>

          <Button
            size="lg"
            disabled={isSubmitting}
            onClick={() => handleOrder('BUY')}
            className="flex h-14 flex-col justify-center bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all text-white"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <ArrowUpRight className="size-4" /> BUY
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight">
              {number(ask, 2)}
            </span>
          </Button>
        </div>

        {/* Order Feedback Alert */}
        {lastOrderMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <div className="flex-1">
              <p className="font-medium">{lastOrderMessage}</p>
            </div>
          </div>
        )}

        {orderError && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            <XCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
            <div className="flex-1">
              <p className="font-medium">{orderError}</p>
            </div>
          </div>
        )}

        {/* Active Open Positions Section */}
        {positions.length > 0 && (
          <div className="border-t border-border pt-3 space-y-2.5">
            {/* Positions Header with Floating PnL and Close All Button */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold">
                <Layers className="size-3.5 text-primary" />
                <span>Posisi Terbuka ({positions.length})</span>
                <span
                  className={cn(
                    'font-mono font-bold text-xs ml-1 px-1.5 py-0.2 rounded',
                    totalFloatingPnl >= 0
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  )}
                >
                  {totalFloatingPnl >= 0 ? '+' : ''}${number(totalFloatingPnl, 2)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {/* Auto Close Config Toggle */}
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setShowAutoCloseSettings(!showAutoCloseSettings)}
                  className={cn(
                    'h-6 text-[10px] px-1.5 gap-1',
                    autoCloseActive && 'text-amber-400 font-semibold bg-amber-400/10'
                  )}
                  title="Atur Auto Close Otomatis"
                >
                  <ShieldCheck className="size-3" />
                  Auto Close {autoCloseActive ? 'ON' : ''}
                </Button>

                {/* Instant Close All Positions Button */}
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={isClosingAll}
                  onClick={handleCloseAll}
                  className="h-6 text-[10px] px-2 font-bold bg-rose-700 hover:bg-rose-800 text-white shadow-xs"
                >
                  {isClosingAll ? 'Menutup Semua…' : '🚨 Tutup Semua'}
                </Button>
              </div>
            </div>

            {/* Auto Close Settings Drawer */}
            {showAutoCloseSettings && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <AlertTriangle className="size-3.5 text-amber-400" />
                    <span>Auto Close Protection (Semua Posisi)</span>
                  </div>
                  <Button
                    size="xs"
                    variant={autoCloseActive ? 'default' : 'outline'}
                    onClick={() => setAutoCloseActive(!autoCloseActive)}
                    className={cn(
                      'text-[10px] h-6 px-2 font-bold',
                      autoCloseActive ? 'bg-amber-500 hover:bg-amber-600 text-black' : ''
                    )}
                  >
                    {autoCloseActive ? 'AKTIF (ON)' : 'AKTIFKAN (OFF)'}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Ketika total floating PnL mencapai target atau batas rugi, sistem otomatis menutup SEMUA posisi terbuka secara serentak.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <Label className="text-[10px] text-emerald-300 font-medium">Target Profit ($):</Label>
                    <Input
                      type="number"
                      step="5"
                      value={targetProfitLimit}
                      onChange={(e) => setTargetProfitLimit(e.target.value)}
                      className="h-6 text-xs font-mono bg-background"
                      placeholder="50"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-rose-300 font-medium">Batas Cut Loss ($):</Label>
                    <Input
                      type="number"
                      step="5"
                      value={maxLossLimit}
                      onChange={(e) => setMaxLossLimit(e.target.value)}
                      className="h-6 text-xs font-mono bg-background"
                      placeholder="30"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Position Cards List */}
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {positions.map((pos) => {
                const profitVal = pos.profit ?? 0
                const isProfitable = profitVal >= 0
                const isTicketClosing = closingTicket === pos.ticket

                return (
                  <div
                    key={pos.ticket}
                    className="rounded-lg border border-border/80 bg-background/80 p-2.5 text-xs space-y-1.5 shadow-xs"
                  >
                    {/* Top Row: Symbol, Action, Source, and Big Floating Profit */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant={pos.action === 'BUY' ? 'default' : 'destructive'}
                          className="px-1.5 py-0 text-[10px] font-bold"
                        >
                          {pos.action}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] px-1 py-0 h-4 font-normal',
                            pos.source === 'ai'
                              ? 'border-purple-500/50 text-purple-300 bg-purple-500/10'
                              : 'border-sky-500/50 text-sky-300 bg-sky-500/10'
                          )}
                        >
                          {pos.source === 'ai' ? '🤖 AI' : '👤 Manual'}
                        </Badge>
                        <span className="font-mono font-bold text-foreground">
                          {pos.volume} {pos.symbol}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          #{pos.ticket}
                        </span>
                      </div>

                      {/* Floating PnL */}
                      <div className="text-right">
                        <span
                          className={cn(
                            'font-mono text-sm font-extrabold tracking-tight',
                            isProfitable ? 'text-emerald-400' : 'text-rose-400'
                          )}
                        >
                          {isProfitable ? '+' : ''}${number(profitVal, 2)}
                        </span>
                      </div>
                    </div>

                    {/* Price and Levels Row */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                      <div>
                        <span>Entri: {number(pos.entry_price, 2)}</span>
                        {pos.current_price && (
                          <span className="ml-2 text-foreground font-semibold">
                            Kini: {number(pos.current_price, 2)}
                          </span>
                        )}
                      </div>
                      <div className="space-x-2">
                        {pos.sl && <span className="text-rose-300">SL: {number(pos.sl, 2)}</span>}
                        {pos.tp && <span className="text-emerald-300">TP: {number(pos.tp, 2)}</span>}
                      </div>
                    </div>

                    {/* Action Buttons: Close 50% vs Close Full */}
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/50">
                      {/* Partial Close 50% Button */}
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isClosing || isTicketClosing || pos.volume < 0.02}
                        onClick={() => handleClose(pos.ticket, true, pos.volume)}
                        className="h-6 text-[10px] px-2 text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                        title={
                          pos.volume < 0.02
                            ? 'Volume sudah 0.01 Lot (minimum broker)'
                            : `Tutup separuh (${(pos.volume / 2).toFixed(2)} Lot)`
                        }
                      >
                        {isTicketClosing ? 'Memproses…' : 'Tutup 50%'}
                      </Button>

                      {/* Full Close Button */}
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={isClosing || isTicketClosing}
                        onClick={() => handleClose(pos.ticket, false, pos.volume)}
                        className="h-6 text-[10px] px-2.5 font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                      >
                        {isTicketClosing ? 'Menutup…' : 'Tutup Semua'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
