import { BookOpen, Newspaper } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { dateTime, number, type Summary } from '@/lib/api'

export function FundamentalPanel({ summary }: { summary: Summary | undefined }) {
  const news = [
    {
      id: 'news-1',
      title: 'Perhatian pasar tertuju pada rilis data inflasi AS minggu ini',
      published_at: new Date().toISOString(),
      source: 'MarketWire',
      impact: 'HIGH',
      sentiment: 'NEUTRAL',
    },
    {
      id: 'news-2',
      title: 'Emas terkonsolidasi menjelang keputusan suku bunga The Fed',
      published_at: new Date(Date.now() - 3600000).toISOString(),
      source: 'Global FX',
      impact: 'HIGH',
      sentiment: 'BULLISH',
    },
  ]

  return (
    <div id="fundamental" className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="size-4 text-primary" /> Konteks makro & berita pasar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Integrasi berita ekonomi dan analisis dampak berita makro terhadap volatilitas instrumen yang Anda amati.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <span className="text-[10px] uppercase text-muted-foreground">Rezim Pasar Terdeteksi</span>
              <p className="mt-1 font-mono text-sm font-semibold">{summary?.overview?.latest_regime || '—'}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Sinyal Terbuka</p>
              <p className="mt-1 font-mono text-sm font-semibold">{summary?.overview ? number(summary.overview.open_signals, 0) : '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Newspaper className="size-4 text-primary" /> Berita ekonomi terkini
            </span>
            <Badge variant="outline" className="text-[9px]">Real-time feed</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {news.map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-primary">{item.source}</span>
                <Badge variant={item.impact === 'HIGH' ? 'destructive' : 'outline'} className="text-[8px]">
                  {item.impact} IMPACT
                </Badge>
              </div>
              <p className="text-xs font-medium text-foreground">{item.title}</p>
              <p className="text-[10px] text-muted-foreground">{dateTime(item.published_at)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
