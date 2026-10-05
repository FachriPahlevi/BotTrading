import {useState, useEffect} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {Card} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {request,type Catalog} from './api'
import {DatasetPanel} from './dataset-panel'
import {LibraryPanel} from './library-panel'
import {RunPanel} from './run-panel'
import {TradingViewIndicatorStudio} from './tradingview-indicator-studio'

export type LabTab = 'data' | 'indicators' | 'strategies' | 'runs' | 'library'
export type LabMode = 'indicators' | 'strategies' | 'lab' | 'full'

export function LabPanel({
  initialTab,
  mode,
}: {
  initialTab?: LabTab
  mode?: LabMode
}) {
  const currentMode =
    mode ??
    (initialTab === 'indicators'
      ? 'indicators'
      : initialTab === 'strategies'
      ? 'strategies'
      : 'full')

  const [tab, setTab] = useState<LabTab>(
    currentMode === 'indicators'
      ? 'indicators'
      : currentMode === 'strategies'
      ? 'strategies'
      : initialTab || 'data',
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['lab-catalog'],
    queryFn: () => request<Catalog>('/catalog'),
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (initialTab && initialTab !== tab) {
      setTab(initialTab)
    }
  }, [initialTab])

  async function act(fn: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await fn()
      await client.invalidateQueries({ queryKey: ['lab-catalog'] })
      setMessage('Berhasil. Perubahan tersimpan / hasil diperbarui.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permintaan gagal.')
    } finally {
      setBusy(false)
    }
  }

  const labTabs: [LabTab, string][] =
    currentMode === 'lab'
      ? [
          ['data', '1. Data historis'],
          ['runs', '2. Backtest & Evaluasi'],
        ]
      : [
          ['data', '1. Data historis'],
          ['indicators', '2. Manajemen Indikator'],
          ['strategies', '3. Strategi Trading'],
          ['runs', '4. Backtest & Evaluasi'],
        ]

  return (
    <Card className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-4">
        <div>
          {currentMode === 'indicators' ? (
            <>
              <p className="text-xs uppercase tracking-widest text-primary">TradingView Studio</p>
              <h2 className="mt-1 text-2xl font-semibold">Manajemen Indikator</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Katalog indikator teknikal, interface pengaturan parameter, dan Pine Script Editor bawaan.
              </p>
            </>
          ) : currentMode === 'strategies' ? (
            <>
              <p className="text-xs uppercase tracking-widest text-primary">Rules & Automation</p>
              <h2 className="mt-1 text-2xl font-semibold">Strategi Trading</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Rakit multi-indikator menjadi strategi sinyal terversi dengan aturan deklaratif, stop loss, dan target rasio R.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-widest text-primary">Research & Strategy Lab</p>
              <h2 className="mt-1 text-2xl font-semibold">Strategy & Indicator Lab</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pemisahan modul formula indikator teknikal dengan aturan strategi transaksi terkonfigurasi.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Only show tab navigation if NOT in dedicated indicators or strategies mode */}
      {currentMode !== 'indicators' && currentMode !== 'strategies' && (
        <div className="flex flex-wrap items-center gap-2">
          {labTabs.map(([id, label]) => (
            <Button
              key={id}
              variant={tab === id ? 'secondary' : 'outline'}
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {query.isPending && <p className="text-xs text-muted-foreground">Memuat katalog…</p>}
      {(error || query.isError) && (
        <p role="alert" className="rounded border border-rose-400/30 p-3 text-sm text-rose-300">
          {error || query.error?.message}
        </p>
      )}
      {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
      {busy && <p role="status" className="text-xs text-muted-foreground">Memproses…</p>}

      {query.data && (
        <fieldset disabled={busy} className="min-w-0">
          {currentMode === 'indicators' ? (
            <TradingViewIndicatorStudio
              catalog={query.data}
              act={act}
            />
          ) : currentMode === 'strategies' ? (
            <LibraryPanel
              catalog={query.data}
              act={act}
              forcedKind="strategies"
            />
          ) : (
            <>
              {tab === 'data' && <DatasetPanel catalog={query.data} act={act} />}
              {tab === 'indicators' && (
                <TradingViewIndicatorStudio
                  catalog={query.data}
                  act={act}
                />
              )}
              {tab === 'strategies' && (
                <LibraryPanel catalog={query.data} act={act} forcedKind="strategies" />
              )}
              {tab === 'library' && <LibraryPanel catalog={query.data} act={act} />}
              {tab === 'runs' && <RunPanel catalog={query.data} act={act} />}
            </>
          )}
        </fieldset>
      )}
    </Card>
  )
}
