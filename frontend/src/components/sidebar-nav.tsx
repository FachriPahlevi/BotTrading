import {
  Activity,
  ArrowUpRight,
  CandlestickChart,
  CircleHelp,
  Layers3,
  LayoutDashboard,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { type TerminalAccount } from '@/lib/api'
import { cn } from '@/lib/utils'

export type TabType =
  | 'workspace'
  | 'activity'
  | 'finance'
  | 'indicators'
  | 'strategies'
  | 'lab'
  | 'fundamental'
  | 'logs'
  | 'risk'

const navItems = [
  { id: 'workspace', label: 'Trading workspace', icon: LayoutDashboard },
  { id: 'finance', label: 'Laporan Keuangan', icon: TrendingUp },
  { id: 'indicators', label: 'Manajemen Indikator', icon: SlidersHorizontal },
  { id: 'strategies', label: 'Strategi Trading', icon: Sparkles },
  { id: 'lab', label: 'Strategy Lab (Backtest)', icon: CandlestickChart },
  { id: 'activity', label: 'Sinyal & aktivitas', icon: Activity },
  { id: 'fundamental', label: 'Konteks pasar', icon: Layers3 },
  { id: 'logs', label: 'Log sistem', icon: ScrollText },
]


export function SidebarNav({
  activeTab,
  onTabChange,
  mobileOpen,
  onMobileOpenChange,
  onOpenHelp,
  account,
}: {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  onOpenHelp: () => void
  account?: TerminalAccount
}) {
  return (
    <>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/65 lg:hidden"
          aria-label="Tutup navigasi"
          onClick={() => onMobileOpenChange(false)}
        />
      )}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 flex w-[216px] shrink-0 flex-col border-r border-border bg-[#0d131b] transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >

        <a
          href="#workspace"
          className="flex h-[76px] items-center gap-3 px-6"
          onClick={() => {
            onTabChange('workspace')
            onMobileOpenChange(false)
          }}
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CandlestickChart className="size-5" />
          </div>
          <div>
            <span className="text-xl font-semibold tracking-[.13em]">AURUM</span>
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
                  onTabChange(item.id as TabType)
                  onMobileOpenChange(false)
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
            Satu tempat untuk chart, analisis, dan keputusan yang bisa ditelusuri.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 px-0 text-primary"
            onClick={onOpenHelp}
          >
            Lihat status fitur <ArrowUpRight className="size-3" />
          </Button>
        </div>
        <div className="mt-auto space-y-4 p-5">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={onOpenHelp}
          >
            <CircleHelp /> Panduan workspace
          </Button>
          <Separator />
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold">
              MT5
            </div>
            <div>
              <p className="break-all text-xs font-medium">
                {account?.company ?? 'Broker belum terbaca'}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {account
                  ? `${account.trade_mode} · •••${account.login.slice(-4)}`
                  : 'Menunggu akun MT5'}
              </p>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">AURUM / WORKSPACE v0.1</p>
        </div>
      </aside>
    </>
  )
}
