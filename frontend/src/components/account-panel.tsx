import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { accountMoney, dateTime, number, type TerminalAccount } from '@/lib/api'

export function AccountPanel({ account, loading, error }: {
  account?: TerminalAccount
  loading: boolean
  error?: string
}) {
  return <section aria-label="Akun MT5" className="space-y-3">
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{account?.name ?? 'Akun MT5 belum tersedia'}</h2>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {account ? `${account.company} · ${account.server} · Akun •••${account.login.slice(-4)}` : 'Menunggu informasi dari terminal yang terhubung'}
            </p>
          </div>
          <Badge variant="outline">{account ? `${account.trade_mode} · Data terminal` : loading ? 'Memuat akun…' : 'Data tidak tersedia'}</Badge>
        </div>
        {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
        {account && <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span>Leverage 1:{account.leverage}</span>
          <span>Posisi terbuka: {number(account.positions_count, 0)}</span>
          <span>Margin level: {account.margin_level == null ? 'Tidak berlaku' : `${number(account.margin_level)}%`}</span>
          <span>Kredit: {accountMoney(account.credit, account.currency)}</span>
          <span>Diperbarui: {dateTime(account.updated_at)}</span>
        </div>}
      </CardContent>
    </Card>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      {([
        ['Saldo', 'balance'], ['Equity', 'equity'], ['Profit berjalan', 'profit'],
        ['Margin terpakai', 'margin'], ['Margin bebas', 'margin_free'],
      ] as const).map(([label, key]) => <Card key={key}>
        <CardContent className="space-y-2 py-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p data-testid={`account-${key}`} className="break-all font-mono text-lg font-semibold">{accountMoney(account?.[key], account?.currency)}</p>
          <p className="text-[10px] text-muted-foreground">{account ? `Mata uang akun: ${account.currency}` : 'Belum tersedia'}</p>
        </CardContent>
      </Card>)}
    </div>
  </section>
}
