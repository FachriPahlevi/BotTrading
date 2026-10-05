import { useState, useEffect, type ChangeEvent } from 'react'
import {
  Code2,
  FileCode,
  FileUp,
  Filter,
  Plus,
  Search,
  Sliders,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, ItemList, Params, selectClass } from './shared'
import {
  request,
  requestText,
  download,
  type Catalog,
  type Item,
  type Instance,
  type Preview,
  type Spec,
} from './api'
import { LabChart } from './lab-chart'
import { PineEditor } from './pine-editor'
import { IndicatorSettingsDialog } from './indicator-settings-dialog'

function generatePineDraft(name: string, kind?: string, p?: Record<string, number>): string {
  const period = p?.period ?? p?.length ?? 20
  const k = kind ?? 'ema'
  return `//@version=5
indicator("${name || 'Indikator Kustom'}", overlay=true)

length = input.int(${period}, minval=1, title="Panjang Periode")
src = input.source(close, title="Sumber Harga")
out = ta.${k === 'sma' ? 'sma' : k === 'rsi' ? 'rsi' : 'ema'}(src, length)

plot(out, color=color.aqua, title="${name || 'Plot'}", linewidth=2)
`
}

export function LibraryPanel({
  catalog,
  act,
  forcedKind,
  hideDataset,
}: {
  catalog: Catalog
  act: (fn: () => Promise<unknown>) => Promise<void>
  forcedKind?: 'indicators' | 'strategies'
  hideDataset?: boolean
}) {
  const [kind, setKind] = useState<'indicators' | 'strategies'>(forcedKind ?? 'indicators')
  const [editorMode, setEditorMode] = useState<'interface' | 'pine'>('interface')
  const [selected, setSelected] = useState<Item | null>(null)
  const [name, setName] = useState(forcedKind === 'strategies' ? 'Strategi saya' : 'Indikator saya')
  const [engine, setEngine] = useState('ema')
  const [params, setParams] = useState<Record<string, number>>({})
  const [description, setDescription] = useState('')
  const [source, setSource] = useState('')
  const [author, setAuthor] = useState('AURUM Lab')
  const [license, setLicense] = useState('MPL-2.0')
  const [adaptation, setAdaptation] = useState('source_only')
  const [instances, setInstances] = useState<Instance[]>([])
  const [definition, setDefinition] = useState('')
  const [dataset, setDataset] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'builtin' | 'custom'>('all')
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [rules, setRules] = useState(
    JSON.stringify(
      {
        buy: { op: 'crossover', left: 'trend.value', right: 'close' },
        sell: { op: 'crossunder', left: 'trend.value', right: 'close' },
        stop: { ref: 'volatility.value', mult: 2 },
        target_r: 2,
        assumptions:
          'Sinyal candle tertutup; entry open berikutnya; satu posisi; SL lebih dahulu jika SL/TP tersentuh dalam satu bar.',
      },
      null,
      2,
    ),
  )
  const [compare, setCompare] = useState('')

  useEffect(() => {
    if (forcedKind && forcedKind !== kind) {
      setKind(forcedKind)
      setSelected(null)
      setName(forcedKind === 'indicators' ? 'Indikator saya' : 'Strategi saya')
    }
  }, [forcedKind])

  function choose(item: Item) {
    setSelected(item)
    setName(item.name)
    setDescription(item.spec.description ?? '')
    setEngine(item.spec.kind ?? 'ema')
    setParams(item.spec.params ?? {})
    setInstances(item.spec.indicators ?? [])
    if (item.spec.source && item.spec.source.trim().length > 50) {
      setSource(item.spec.source)
    } else if (item.spec.kind === 'boswaves_core') {
      void requestText('/example-source')
        .then((t) => {
          if (t) setSource(t)
        })
        .catch(() => {})
      setSource(generatePineDraft(item.name, item.spec.kind, item.spec.params))
    } else {
      setSource(generatePineDraft(item.name, item.spec.kind, item.spec.params))
    }
    setAuthor(item.spec.provenance?.author ?? 'AURUM Lab')
    setLicense(item.spec.provenance?.license ?? 'MPL-2.0')

    if (item.kind === 'strategies') {
      setRules(
        JSON.stringify(
          {
            buy: item.spec.buy,
            sell: item.spec.sell,
            stop: item.spec.stop,
            target_r: item.spec.target_r,
            assumptions: item.spec.assumptions,
          },
          null,
          2,
        ),
      )
    }
    setCompare('')
    setPreview(null)
  }

  function handleCreateNew() {
    setSelected(null)
    const newName = kind === 'indicators' ? 'Indikator baru' : 'Strategi baru'
    setName(newName)
    setDescription('')
    setEngine('ema')
    setParams({})
    setInstances([])
    setSource(generatePineDraft(newName, 'ema', {}))
    setAuthor('User')
    setLicense('Custom')
  }

  function add() {
    const item = catalog.indicators.find((i) => i.version_id === definition)
    if (item && instances.length < 32) {
      setInstances([
        ...instances,
        {
          alias: `ind${instances.length + 1}`,
          version_id: item.version_id,
          params: { ...item.spec.params },
        },
      ])
    }
  }

  async function save() {
    const spec: Spec =
      kind === 'indicators'
        ? {
            kind: engine,
            params,
            description,
            source: source || undefined,
            provenance: source ? { author, license } : undefined,
          }
        : { ...JSON.parse(rules), description, indicators: instances, status: 'idea' }
    const item = await request<Item>(
      selected ? `/items/${kind}/${selected.id}` : `/items/${kind}`,
      selected ? 'PUT' : 'POST',
      { name, spec },
    )
    choose(item)
  }

  async function handleDialogSave(
    newParams: Record<string, number>,
    newName: string,
    newDesc: string,
  ) {
    setParams(newParams)
    setName(newName)
    setDescription(newDesc)
    const spec: Spec = {
      kind: engine,
      params: newParams,
      description: newDesc,
      source: source || undefined,
      provenance: source ? { author, license } : undefined,
    }
    const item = await request<Item>(
      selected ? `/items/indicators/${selected.id}` : '/items/indicators',
      selected ? 'PUT' : 'POST',
      { name: newName, spec },
    )
    choose(item)
    setSettingsDialogOpen(false)
  }

  function handleQuickImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const content = evt.target?.result as string
      if (!content) return
      setSource(content)
      const match = content.match(/(?:indicator|study)\s*\(\s*["']([^"']+)["']/i)
      if (match && match[1]) {
        setName(match[1])
      } else {
        setName(file.name.replace(/\.[^/.]+$/, ''))
      }
      setSelected(null)
      setEditorMode('pine')
    }
    reader.readAsText(file)
  }

  // Filter items in catalog
  const currentCatalog = catalog[kind] || []
  const filteredItems = currentCatalog.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.spec.kind ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false
    if (categoryFilter === 'builtin') return item.builtin
    if (categoryFilter === 'custom') return !item.builtin
    return true
  })

  return (
    <div className="space-y-5">
      {/* Top Header / Mode Switcher */}
      {forcedKind ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              {forcedKind === 'indicators' ? (
                <>
                  <Sliders className="size-4 text-primary" />
                  Manajemen Indikator
                </>
              ) : (
                <>
                  <Sparkles className="size-4 text-primary" />
                  Manajemen Strategi Trading
                </>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {forcedKind === 'indicators'
                ? 'Kelola rumus teknikal, sesuaikan parameter interface ala TradingView, atau tulis & impor Pine Script di Pine Editor.'
                : 'Rakit multi-indikator menjadi strategi sinyal terversi dengan aturan deklaratif dan rasio R.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {forcedKind === 'indicators' && (
              <div className="flex rounded-lg border border-border bg-[#0d121a] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setEditorMode('interface')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                    editorMode === 'interface'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sliders className="size-3.5" />
                  Interface Inputs
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('pine')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
                    editorMode === 'pine'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Code2 className="size-3.5" />
                  Pine Editor
                </button>
              </div>
            )}

            {forcedKind === 'strategies' && (
              <Button
                size="xs"
                variant="outline"
                className="hidden sm:inline-flex"
                onClick={() => setKind('strategies')}
              >
                Strategi bernama
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(['indicators', 'strategies'] as const).map((k) => (
            <Button
              key={k}
              variant={kind === k ? 'secondary' : 'outline'}
              onClick={() => {
                setKind(k)
                setSelected(null)
                setName(k === 'indicators' ? 'Indikator saya' : 'Strategi saya')
              }}
            >
              {k === 'indicators' ? 'Indikator & script' : 'Strategi bernama'}
            </Button>
          ))}
        </div>
      )}

      {/* Main Grid: Catalog List (Left) & Editor Panel (Right) */}
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        {/* Left Column: Indicator / Strategy Catalog */}
        <div className="space-y-3">
          {/* Catalog Filter Bar */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  kind === 'indicators'
                    ? 'Cari indikator (EMA, RSI, ALMA...)'
                    : 'Cari strategi...'
                }
                className="pl-8 h-8 text-xs bg-[#0d121a] border-border"
              />
            </div>

            {kind === 'indicators' && (
              <div className="flex gap-1 text-[11px]">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    categoryFilter === 'all'
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Semua ({currentCatalog.length})
                </button>
                <button
                  onClick={() => setCategoryFilter('builtin')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    categoryFilter === 'builtin'
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🌟 Bawaan
                </button>
                <button
                  onClick={() => setCategoryFilter('custom')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    categoryFilter === 'custom'
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  📜 Kustom
                </button>
              </div>
            )}
          </div>

          {/* Quick Actions (Baru & Impor) */}
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={handleCreateNew}
              className="gap-1 text-xs flex-1"
            >
              <Plus className="size-3" />
              <span>{kind === 'indicators' ? 'Indikator Baru' : 'Strategi Baru'}</span>
            </Button>

            {kind === 'indicators' && (
              <label className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-[#0d121a] px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                <FileUp className="size-3 text-primary" />
                <span>Impor Pine</span>
                <input
                  type="file"
                  accept=".pine,.txt"
                  className="hidden"
                  onChange={handleQuickImportFile}
                />
              </label>
            )}
          </div>

          {/* Catalog Item List */}
          <ItemList
            items={filteredItems}
            onSelect={choose}
            onArchive={(i) => void act(() => request(`/items/${i.id}/archive`, 'POST'))}
            onClone={(i) =>
              void act(async () => {
                const copy = await request<Item>(`/items/${i.id}/clone`, 'POST', {
                  name: `${i.name.slice(0, 65)} salinan ${Date.now().toString().slice(-6)}`,
                  spec: {},
                })
                choose(copy)
              })
            }
            onEditPine={
              kind === 'indicators'
                ? (i) => {
                    choose(i)
                    setEditorMode('pine')
                  }
                : undefined
            }
          />
        </div>

        {/* Right Column: Editor Workspace */}
        <div className="min-w-0">
          {kind === 'indicators' && editorMode === 'pine' ? (
            /* Dedicated TradingView Pine Editor */
            <PineEditor
              code={source}
              onChange={setSource}
              name={name}
              onNameChange={setName}
              engine={engine}
              onEngineChange={setEngine}
              schemas={catalog.schemas}
              author={author}
              onAuthorChange={setAuthor}
              license={license}
              onLicenseChange={setLicense}
              description={description}
              onDescriptionChange={setDescription}
              onSave={() => void act(save)}
              onSwitchToInterface={() => setEditorMode('interface')}
              onApplyToChart={() => {
                if (dataset && selected) {
                  void act(async () => {
                    setPreview(
                      await request<Preview>('/preview', 'POST', {
                        dataset_version_id: dataset,
                        indicators: [
                          {
                            alias: 'indicator',
                            version_id: selected.version_id,
                            params,
                          },
                        ],
                      }),
                    )
                  })
                }
              }}
              canSave={!selected?.builtin && !selected?.archived}
              isBuiltin={selected?.builtin}
            />
          ) : (
            /* Interface Inputs Form Mode */
            <div className="min-w-0 space-y-4 rounded-xl border border-border bg-[#0d121a] p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-foreground">
                    {selected ? `Editor · v${selected.version} (${selected.name})` : 'Buat Baru'}
                  </h3>
                  {selected?.builtin && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary font-medium">
                      Bawaan
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {kind === 'indicators' && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setEditorMode('pine')}
                      className="gap-1 text-primary border-primary/30 hover:border-primary"
                    >
                      <Code2 className="size-3.5" />
                      <span>Buka di Pine Editor</span>
                    </Button>
                  )}
                  <Button size="xs" variant="outline" onClick={handleCreateNew}>
                    Baru
                  </Button>
                </div>
              </div>

              <Field label="Nama">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama instrumen / strategi"
                  disabled={selected?.builtin}
                />
              </Field>

              <Field label="Deskripsi">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Keterangan singkat..."
                  disabled={selected?.builtin}
                />
              </Field>

              {kind === 'indicators' ? (
                <>
                  <Field label="Mesin Kalkulasi Indikator">
                    <select
                      className={selectClass}
                      value={engine}
                      disabled={selected?.builtin}
                      onChange={(e) => {
                        setEngine(e.target.value)
                        setParams({})
                      }}
                    >
                      {Object.entries(catalog.schemas).map(([k, s]) => (
                        <option key={k} value={k}>
                          {s.label} ({k})
                        </option>
                      ))}
                      {engine === 'source_only' && (
                        <option value="source_only">Source tersimpan · belum didukung</option>
                      )}
                    </select>
                  </Field>

                  <div className="rounded-lg border border-border/60 bg-[#111722] p-3.5 space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-foreground">
                        Parameter Input ({catalog.schemas[engine]?.label ?? engine})
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Output: {catalog.schemas[engine]?.outputs.join(', ') ?? 'value'}
                      </span>
                    </div>
                    <Params
                      schema={catalog.schemas[engine]}
                      values={params}
                      onChange={setParams}
                    />
                  </div>

                  {selected?.spec.provenance && (
                    <p className="break-all text-xs text-muted-foreground bg-[#111722] p-2.5 rounded border border-border/40">
                      Penulis: <strong>{selected.spec.provenance.author}</strong> · Lisensi:{' '}
                      <strong>{selected.spec.provenance.license}</strong> · SHA:{' '}
                      <span className="font-mono text-[10px]">
                        {selected.spec.provenance.source_hash?.slice(0, 16)}…
                      </span>
                    </p>
                  )}

                  {selected?.spec.unsupported?.length ? (
                    <p className="text-xs text-amber-200 bg-amber-500/10 p-2.5 rounded border border-amber-500/20">
                      Belum diterjemahkan: {selected.spec.unsupported.join(', ')}
                    </p>
                  ) : null}

                  {/* Quick Importer Accordion */}
                  <details className="space-y-3 rounded-lg border border-border/60 bg-[#111722] p-3">
                    <summary className="cursor-pointer text-xs font-medium text-foreground hover:text-primary">
                      📥 Impor Berkas Pine Script
                    </summary>
                    <p className="text-[11px] text-muted-foreground">
                      Source disimpan dengan atribusi lisensi. Contoh BOSWaves memiliki adaptasi
                      numerik draft untuk chart.
                    </p>
                    <Input
                      type="file"
                      accept=".pine,.txt"
                      aria-label="Berkas Pine"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void f.text().then(setSource)
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Penulis">
                        <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
                      </Field>
                      <Field label="Lisensi">
                        <Input value={license} onChange={(e) => setLicense(e.target.value)} />
                      </Field>
                    </div>
                    <select
                      aria-label="Mode impor"
                      className={selectClass}
                      value={adaptation}
                      onChange={(e) => setAdaptation(e.target.value)}
                    >
                      <option value="source_only">Simpan source untuk review</option>
                      <option value="boswaves_numeric">
                        Adaptasi numerik contoh BOSWaves (draft)
                      </option>
                    </select>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="xs"
                        disabled={!source}
                        onClick={() =>
                          void act(async () =>
                            choose(
                              await request<Item>('/indicators/import', 'POST', {
                                name,
                                source,
                                author,
                                license,
                                adaptation,
                              }),
                            ),
                          )
                        }
                      >
                        Impor Script
                      </Button>
                      <a
                        className="text-[11px] text-primary underline ml-2"
                        href="/api/lab/example-source"
                        download
                      >
                        Unduh source contoh BOSWaves.pine
                      </a>
                    </div>
                  </details>
                </>
              ) : (
                /* Strategy Composer Form */
                <>
                  <p className="text-xs text-muted-foreground">
                    Susun instance indikator, lalu referensikan alias.output pada aturan.
                    Maksimal 32 instance per strategi/pratinjau.
                  </p>
                  <div className="flex gap-2">
                    <select
                      aria-label="Tambahkan indikator"
                      className={selectClass}
                      value={definition}
                      onChange={(e) => setDefinition(e.target.value)}
                    >
                      <option value="">Pilih indikator</option>
                      {catalog.indicators
                        .filter((i) => !i.archived && i.spec.kind !== 'source_only')
                        .map((i) => (
                          <option key={i.id} value={i.version_id}>
                            {i.name} v{i.version}
                          </option>
                        ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={add}
                      disabled={!definition || instances.length >= 32}
                    >
                      Tambah
                    </Button>
                  </div>
                  {instances.map((i, index) => {
                    const item = catalog.indicators.find((d) =>
                      d.versions.some((v) => v.id === i.version_id),
                    )
                    const spec = item?.versions.find((v) => v.id === i.version_id)?.spec
                    return (
                      <div
                        key={index}
                        className="space-y-2 rounded border border-border bg-[#111722] p-3"
                      >
                        <div className="flex gap-2">
                          <Input
                            aria-label={`Alias indikator ${index + 1}`}
                            value={i.alias}
                            onChange={(e) =>
                              setInstances(
                                instances.map((v, n) =>
                                  n === index ? { ...v, alias: e.target.value } : v,
                                ),
                              )
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setInstances(instances.filter((_, n) => n !== index))
                            }
                          >
                            Hapus
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item?.name} · output:{' '}
                          {catalog.schemas[spec?.kind ?? '']?.outputs.join(', ')}
                        </p>
                        <Params
                          schema={catalog.schemas[spec?.kind ?? '']}
                          values={i.params}
                          onChange={(p) =>
                            setInstances(
                              instances.map((v, n) => (n === index ? { ...v, params: p } : v)),
                            )
                          }
                        />
                      </div>
                    )
                  })}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const bos = catalog.indicators.find(
                        (i) => i.spec.kind === 'boswaves_core' && !i.archived,
                      )
                      if (bos) {
                        setInstances([
                          {
                            alias: 'ribbon',
                            version_id: bos.version_id,
                            params: { ...bos.spec.params },
                          },
                        ])
                        setRules(
                          JSON.stringify(
                            {
                              buy: { op: 'gt', left: 'ribbon.bull_flip', right: 0 },
                              sell: { op: 'gt', left: 'ribbon.bear_flip', right: 0 },
                              stop: { ref: 'ribbon.risk', mult: 1 },
                              target_r: 2,
                              assumptions:
                                'Adaptasi numerik BOSWaves draft, bukan strategi asli penulis. Entry open berikutnya, satu posisi, SL-first, tanpa pembalikan otomatis.',
                            },
                            null,
                            2,
                          ),
                        )
                      }
                    }}
                  >
                    Isi template BOSWaves draft
                  </Button>
                  <Field label="Aturan deklaratif JSON">
                    <textarea
                      className={`${selectClass} min-h-64 font-mono text-xs`}
                      value={rules}
                      onChange={(e) => setRules(e.target.value)}
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Operator: gt, lt, crossover, crossunder; gabungan all/any dengan rules. Buy
                    dan sell bersamaan berarti WAIT. Source kode tidak dieksekusi.
                  </p>
                </>
              )}

              {/* Action Buttons (Save & Export) */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  disabled={
                    (!!selected && (selected.builtin || selected.archived)) ||
                    (engine === 'source_only' && kind === 'indicators')
                  }
                  onClick={() => void act(save)}
                >
                  Simpan {selected ? 'versi' : 'baru'}
                </Button>
                {selected && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      download(`${selected.name}.json`, {
                        kind,
                        name,
                        spec:
                          kind === 'indicators'
                            ? { kind: engine, params, description, source }
                            : {
                                ...JSON.parse(rules),
                                description,
                                indicators: instances,
                                status: 'idea',
                              },
                      })
                    }
                  >
                    Ekspor konfigurasi
                  </Button>
                )}
              </div>

              <Field label="Impor konfigurasi JSON">
                <Input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f)
                      void act(async () => {
                        const data = JSON.parse(await f.text())
                        if (data.kind !== 'indicators' && data.kind !== 'strategies')
                          throw Error('Jenis konfigurasi tidak didukung.')
                        setKind(data.kind)
                        choose(
                          await request<Item>(`/items/${data.kind}`, 'POST', {
                            name: data.name,
                            spec: data.spec,
                          }),
                        )
                      })
                  }}
                />
              </Field>

              {selected && (
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Riwayat versi & perbandingan konfigurasi
                  </summary>
                  <select
                    className={`${selectClass} my-2`}
                    value={compare}
                    onChange={(e) => setCompare(e.target.value)}
                  >
                    <option value="">Pilih versi pembanding</option>
                    {selected.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.number} · {v.config_hash.slice(0, 12)}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-2 md:grid-cols-2">
                    {[
                      selected.versions.find((v) => v.id === compare)?.spec,
                      selected.spec,
                    ].map((v, n) => (
                      <pre
                        key={n}
                        className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-[10px] bg-[#111722] p-2 rounded"
                      >
                        {JSON.stringify(v, null, 2)}
                      </pre>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Historical Chart Preview Section */}
      {!hideDataset && (
        <div className="space-y-3 rounded-xl border border-border bg-[#0d121a] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">
              {kind === 'indicators'
                ? 'Pratinjau Indikator pada Histori Market'
                : 'Pratinjau Strategi pada Histori Market'}
            </h3>
            <span className="text-xs text-muted-foreground">Candle Historis MT5 Research</span>
          </div>
          <select
            aria-label="Dataset pratinjau"
            className={selectClass}
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
          >
            <option value="">Pilih dataset research</option>
            {catalog.datasets
              .filter((d) => !d.archived && d.spec.role === 'research')
              .map((d) => (
                <option key={d.id} value={d.version_id}>
                  {d.name} · {d.spec.rows} candle
                </option>
              ))}
          </select>
          <Button
            disabled={!dataset || (kind === 'indicators' ? !selected : !instances.length)}
            onClick={() =>
              void act(async () => {
                const list =
                  kind === 'strategies'
                    ? instances
                    : [{ alias: 'indicator', version_id: selected!.version_id, params }]
                setPreview(
                  await request<Preview>('/preview', 'POST', {
                    dataset_version_id: dataset,
                    indicators: list,
                  }),
                )
              })
            }
          >
            Terapkan ke chart historis
          </Button>
          {preview && <LabChart data={preview} />}
        </div>
      )}

      {/* TradingView Settings Dialog if opened */}
      {selected && (
        <IndicatorSettingsDialog
          item={selected}
          schema={catalog.schemas[engine]}
          isOpen={settingsDialogOpen}
          onClose={() => setSettingsDialogOpen(false)}
          onSave={handleDialogSave}
          onOpenPineEditor={() => {
            setEditorMode('pine')
          }}
          onApplyToChart={() => {
            if (dataset) {
              void act(async () => {
                setPreview(
                  await request<Preview>('/preview', 'POST', {
                    dataset_version_id: dataset,
                    indicators: [
                      {
                        alias: 'indicator',
                        version_id: selected.version_id,
                        params,
                      },
                    ],
                  }),
                )
              })
            }
          }}
        />
      )}
    </div>
  )
}
