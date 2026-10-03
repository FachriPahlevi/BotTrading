import { useState } from 'react'
import { Calculator, Info, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { accountMoney, type TerminalAccount } from '@/lib/api'

export function RiskCalculator({ account }: { account?: TerminalAccount }) {
  const [risk, setRisk] = useState('0.5')
  const amount = account?.balance ?? NaN
  const percent = Number(risk)
  const valid =
    risk !== '' &&
    Number.isFinite(amount) &&
    Number.isFinite(percent) &&
    amount > 0 &&
    percent > 0 &&
    percent <= 100
  return (
    <Card id="risk" className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Anggaran risiko
          </span>
          <Badge variant="outline" className="text-[10px]">
            Kalkulator
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="capital" className="text-xs text-muted-foreground">
              Saldo MT5 ({account?.currency ?? '—'})
            </Label>
            <Input
              id="capital"
              readOnly
              value={accountMoney(account?.balance, account?.currency)}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="risk-percent"
              className="text-xs text-muted-foreground"
            >
              Risiko per trade (%)
            </Label>
            <Input
              id="risk-percent"
              type="number"
              min="0.01"
              max="100"
              step="0.1"
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-primary/15 bg-primary/5 px-3 py-3">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calculator className="size-4" /> Budget kerugian
          </span>
          <strong
            data-testid="risk-budget"
            className="font-mono text-lg text-primary"
          >
            {valid ? accountMoney((amount * percent) / 100, account?.currency) : '—'}
          </strong>
        </div>
        {!valid && (
          <p role="alert" className="text-xs text-destructive">
            {!account ? 'Menunggu saldo MT5 yang valid dan terbaru.' : 'Saldo harus positif dan risiko lebih dari 0 sampai 100%.'}
          </p>
        )}
        <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Dihitung dari saldo MT5 terbaru. Persentase ini hanya kalkulator lokal,
          belum mengatur risiko engine atau lot. Tidak mengirim order.
        </p>
      </CardContent>
    </Card>
  )
}
