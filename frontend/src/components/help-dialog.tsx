import { CheckCircle2, CircleAlert, Sparkles, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type TerminalAccount } from '@/lib/api'

export function HelpDialog({
  open,
  onOpenChange,
  account,
  stale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: TerminalAccount
  stale?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Panduan & Status System
          </DialogTitle>
          <DialogDescription>
            Informasi status koneksi terminal MT5 dan ringkasan arsitektur platform Aurum.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Terminal className="size-3.5 text-primary" /> Status Terminal MT5
              </span>
              <Badge variant={account && !stale ? 'default' : 'destructive'} className="text-[9px]">
                {account && !stale ? 'Terhubung' : 'Terputus / Stale'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {account && !stale
                ? `Terhubung ke ${account.company} (${account.server}) dengan mode ${account.trade_mode}.`
                : 'Terminal MT5 belum mengirimkan data akun terbaru. Pastikan EA AurumMarketBridge aktif.'}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold">Tersedia:</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Integrasi langsung ke MetaTrader 5 (DEMO) dengan pemeriksaan status Algo Trading otomatis.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Mode DEMO memerlukan ARM eksplisit dan verifikasi akun terminal sebelum submit order.</span>
              </li>
              <li className="flex items-start gap-2">
                <CircleAlert className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>Mode REAL / CONTEST diblokir secara eksplisit oleh sistem invarian.</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
