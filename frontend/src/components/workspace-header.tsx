import { Menu, Radio, RefreshCw, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { dateTime } from '@/lib/api'

export function WorkspaceHeader({
  onMobileOpenToggle,
  symbol,
  interval,
  fresh,
  fetching,
  updatedAt,
  onRefresh,
}: {
  onMobileOpenToggle: () => void
  symbol: string
  interval: string
  fresh: boolean
  fetching: boolean
  updatedAt?: string
  onRefresh: () => void
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border bg-background/90 px-6 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-9 lg:hidden"
          aria-label="Buka navigasi"
          onClick={onMobileOpenToggle}
        >
          <Menu className="size-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold tracking-tight">
            Workspace Utuh · {symbol}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Market feed {interval} · MT5 EA Status
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden flex-col items-end sm:flex">
          <span className="text-[10px] text-muted-foreground">
            {updatedAt ? `Diperbarui ${dateTime(updatedAt)}` : 'Memuat data…'}
          </span>
          <span className="text-[10px] font-medium text-primary">
            Status koneksi: EA Push
          </span>

        </div>
        <Badge variant={fresh ? 'default' : 'destructive'} className="gap-1">
          {fresh ? <Radio className="size-3" /> : <WifiOff className="size-3" />}
          {fresh ? 'Live' : 'Stale / Terputus'}
        </Badge>
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          aria-label="Perbarui semua data"
          disabled={fetching}
          onClick={onRefresh}
        >
          <RefreshCw className={fetching ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      </div>
    </header>
  )
}
