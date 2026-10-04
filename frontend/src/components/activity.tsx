import { Activity as ActivityIcon, ArrowUpRight, Inbox } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { dateTime, number, type Signal, type Summary } from '@/lib/api'

export function Empty({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center px-6 py-6 text-center">
      <div className="mb-3 rounded-xl border border-border bg-muted/40 p-2.5">
        <Inbox className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

export function ActivityPanel({
  data,
  error,
  loading,
  onSignal,
}: {
  data?: Summary
  error: boolean
  loading: boolean
  onSignal: (signal: Signal) => void
}) {
  return (
    <Card id="activity" className="scroll-mt-6 gap-0 py-0">
      <Tabs defaultValue="signals">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <ActivityIcon className="size-4 text-primary" />
          <h2 className="mr-auto text-sm font-medium">Aktivitas workspace</h2>
          <TabsList variant="line">
            <TabsTrigger value="signals">Sinyal</TabsTrigger>
            <TabsTrigger value="risk">Risiko</TabsTrigger>
            <TabsTrigger value="regimes">Regime</TabsTrigger>
          </TabsList>
        </div>
        {error && (
          <p role="alert" className="px-4 py-2 text-xs text-amber-300">
            Ringkasan tidak dapat diperbarui. Data sebelumnya, jika ada, mungkin
            sudah berubah.
          </p>
        )}
        <TabsContent value="signals">
          {data?.open_signal_feed?.length ? (

            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {[
                      'Instrumen',
                      'Arah',
                      'Entry',
                      'Stop loss',
                      'Status',
                      'Chart',
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.open_signal_feed.map((signal) => (
                    <tr
                      key={signal.id}
                      className="border-t border-border hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-medium">
                        {signal.symbol}
                        <span className="ml-2 text-muted-foreground">
                          #{signal.id}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            signal.direction === 'BUY'
                              ? 'text-primary'
                              : 'text-rose-300'
                          }
                        >
                          {signal.direction}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {number(signal.entry, 5)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {number(signal.stop_loss, 5)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {signal.status}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Lihat sinyal ${signal.id} pada chart`}
                          onClick={() => onSignal(signal)}
                        >
                          <ArrowUpRight />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
                Sinyal tersimpan di database • bukan konfirmasi order broker •
                timeframe sinyal belum disediakan API.
              </p>
            </div>
          ) : (
            <Empty
              title={
                loading
                  ? 'Memuat sinyal…'
                  : error
                    ? 'Sinyal belum dapat dimuat'
                    : 'Belum ada sinyal terbuka'
              }
              description="Sinyal dari engine akan muncul di sini. Marker teknikal dan transaksi broker adalah data yang berbeda."
            />
          )}
        </TabsContent>
        <TabsContent value="risk">
          {data?.risk_feed?.length ? (
            <div className="divide-y divide-border">
              {data.risk_feed.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div>
                    <p className="text-xs font-medium">{event.event_type}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.action_taken || 'Belum ada tindakan tercatat'} ·{' '}
                      {dateTime(event.created_at)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      event.resolved ? 'text-primary' : 'text-amber-300'
                    }
                  >
                    {event.resolved ? 'Selesai' : 'Aktif'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={
                error ? 'Data risiko tidak tersedia' : 'Belum ada event risiko'
              }
              description="Catatan pemeriksaan risiko akan ditampilkan dari engine. Tampilan kosong bukan jaminan akun bebas risiko."
            />
          )}
        </TabsContent>
        <TabsContent value="regimes">
          {data?.latest_regimes?.length ? (

            <div className="divide-y divide-border">
              {data.latest_regimes.map((regime, index) => (
                <div
                  key={`${regime.symbol}-${index}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-xs font-medium">{regime.symbol}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateTime(regime.timestamp)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline">{regime.regime}</Badge>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {regime.volatility_state || 'Volatilitas belum tersedia'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={
                error ? 'Regime tidak tersedia' : 'Belum ada pembacaan regime'
              }
              description="Regime yang sudah dihitung engine akan muncul di sini."
            />
          )}
        </TabsContent>
      </Tabs>
    </Card>
  )
}
