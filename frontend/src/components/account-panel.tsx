import {
  ArrowUpRight,
  Clock,
  DollarSign,
  Layers,
  Percent,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useFinance } from '@/hooks/useFinance'
import { accountMoney, number, type TerminalAccount } from '@/lib/api'

export function AccountPanel({
  account,
  loading,
  error,
  onOpenFinance,
}: {
  account?: TerminalAccount
  loading: boolean
  error?: string
  onOpenFinance?: () => void
}) {
  const { overview, pendingOrders } = useFinance('daily')

  const activePositionsCount = overview?.active_positions_count ?? account?.positions_count ?? 0
  const activeVolume = overview?.active_positions_volume ?? 0.0
  const activeFloatingPnl = overview?.active_floating_pnl ?? account?.profit ?? 0.0
  const pendingCount = overview?.pending_orders_count ?? pendingOrders.length

  return (
    <section aria-label="Akun MT5 dan Ringkasan Trading" className="space-y-3">
      {/* Account Info Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" />
          {account ? (
            <>
              <span className="font-semibold text-foreground">{account.name}</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                #{account.login} · {account.server} ({account.trade_mode})
              </span>
            </>
          ) : (
            <span className="font-semibold text-foreground">Akun MT5</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenFinance && (
            <Button
              variant="outline"
              size="xs"
              onClick={onOpenFinance}
              className="text-[11px] h-6 px-2 text-primary hover:text-primary gap-1 border-primary/30 hover:bg-primary/10"
            >
              <TrendingUp className="size-3" />
              Laporan Keuangan & Portofolio
              <ArrowUpRight className="size-3" />
            </Button>
          )}

          <Badge variant={error ? 'destructive' : 'outline'} className="text-[10px]">
            {error
              ? 'Data kedaluwarsa'
              : account
                ? 'Data diterima'
                : loading
                  ? 'Memuat akun…'
                  : 'Data tidak tersedia'}
          </Badge>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-amber-300">
          {error}
        </p>
      )}

      {/* 5 Compact Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {/* 1. Saldo Akun */}
        <Card className="py-2.5 border-border bg-card/80">
          <CardContent className="space-y-1 py-0">
            <p className="text-[11px] font-medium text-muted-foreground">Saldo Akun</p>
            <p
              data-testid="account-balance"
              className="font-mono text-base font-bold tracking-tight text-foreground"
            >
              {accountMoney(account?.balance, account?.currency)}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">Modal Pokok MT5</p>
          </CardContent>
        </Card>

        {/* 2. Equity */}
        <Card className="py-2.5 border-border bg-card/80">
          <CardContent className="space-y-1 py-0">
            <p className="text-[11px] font-medium text-muted-foreground">Equity</p>
            <p
              data-testid="account-equity"
              className="font-mono text-base font-bold tracking-tight text-foreground"
            >
              {accountMoney(account?.equity, account?.currency)}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">Nilai Likuiditas Akun</p>
          </CardContent>
        </Card>

        {/* 3. Profit Berjalan */}
        <Card className="py-2.5 border-border bg-card/80">
          <CardContent className="space-y-1 py-0">
            <p className="text-[11px] font-medium text-muted-foreground">Profit Berjalan</p>
            <p
              data-testid="account-profit"
              className={`font-mono text-base font-bold tracking-tight ${
                activeFloatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {accountMoney(account ? activeFloatingPnl : undefined, account?.currency)}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">Floating PnL Saat Ini</p>
          </CardContent>
        </Card>

        {/* 4. Transaksi Berjalan (Menggantikan Margin Terpakai) */}
        <Card className="py-2.5 border-border bg-card/80 relative overflow-hidden">
          <div className="absolute right-2 top-2">
            <Layers className="size-3.5 text-primary/60" />
          </div>
          <CardContent className="space-y-1 py-0">
            <p className="text-[11px] font-medium text-muted-foreground">Transaksi Berjalan</p>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold text-foreground">
                {activePositionsCount}
              </span>
              <span className="text-[11px] text-muted-foreground">Posisi</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {activeVolume > 0 ? `${activeVolume} Lot` : 'Tidak ada posisi'} ·{' '}
              <span className={activeFloatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {activeFloatingPnl >= 0 ? '+' : ''}${number(activeFloatingPnl, 2)}
              </span>
              {activePositionsCount > 0 && overview?.active_ai_positions !== undefined && (
                <span className="text-[9px] text-muted-foreground/80 block mt-0.5">
                  {overview.active_ai_positions} AI · {overview.active_manual_positions ?? 0} Manual
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* 5. Belum Dieksekusi / Pending Limit (Menggantikan Margin Bebas) */}
        <Card className="py-2.5 border-border bg-card/80 relative overflow-hidden">
          <div className="absolute right-2 top-2">
            <Clock className="size-3.5 text-amber-400/60" />
          </div>
          <CardContent className="space-y-1 py-0">
            <p className="text-[11px] font-medium text-muted-foreground">Belum Dieksekusi</p>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-base font-bold text-foreground">
                {pendingCount}
              </span>
              <span className="text-[11px] text-muted-foreground">Order</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              Stop Limit / Limit Aktif
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
