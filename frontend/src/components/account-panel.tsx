import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { accountMoney, type TerminalAccount } from '@/lib/api'

export function AccountPanel({
  account,
  loading,
  error,
}: {
  account?: TerminalAccount
  loading: boolean
  error?: string
}) {
  return (
    <section aria-label="Akun MT5" className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {account ? (
            <>
              <span className="font-semibold text-foreground">{account.name}</span>
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({account.trade_mode})
              </span>
            </>
          ) : (
            <span className="font-semibold text-foreground">Akun MT5</span>
          )}
        </div>
        <Badge variant={error ? 'destructive' : 'outline'}>
          {error
            ? 'Data kedaluwarsa'
            : account
              ? 'Data diterima'
              : loading
                ? 'Memuat akun…'
                : 'Data tidak tersedia'}
        </Badge>
      </div>

      {error && (
        <p role="alert" className="text-xs text-amber-300">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {(
          [
            ['Saldo', 'balance'],
            ['Equity', 'equity'],
            ['Profit berjalan', 'profit'],
            ['Margin terpakai', 'margin'],
            ['Margin bebas', 'margin_free'],
          ] as const
        ).map(([label, key]) => (
          <Card key={key} className="py-2.5">
            <CardContent className="space-y-1 py-0">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              <p
                data-testid={`account-${key}`}
                className="break-all font-mono text-base font-semibold"
              >
                {accountMoney(account?.[key], account?.currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
