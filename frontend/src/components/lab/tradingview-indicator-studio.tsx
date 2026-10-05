import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import {
  Code2,
  Sliders,
  Search,
  Plus,
  FileUp,
  Download,
  Copy,
  Check,
  Save,
  Play,
  Star,
  Eye,
  EyeOff,
  Trash2,
  CopyPlus,
  Sparkles,
  Layers,
  HelpCircle,
  X,
  TrendingUp,
  Activity,
  Palette,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { selectClass } from './shared'
import {
  request,
  requestText,
  download,
  type Catalog,
  type Item,
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

export interface TradingViewIndicatorStudioProps {
  catalog: Catalog
  act: (fn: () => Promise<unknown>) => Promise<void>
}

export function TradingViewIndicatorStudio({
  catalog,
  act,
}: TradingViewIndicatorStudioProps) {
  // Navigation / View modes: 'chart' | 'editor' | 'settings'
  const [viewMode, setViewMode] = useState<'chart' | 'editor' | 'settings'>('editor')

  // Selected indicator state
  const [selected, setSelected] = useState<Item | null>(null)
  const [name, setName] = useState('Indikator Kustom Baru')
  const [engine, setEngine] = useState('ema')
  const [params, setParams] = useState<Record<string, number>>({ period: 20 })
  const [description, setDescription] = useState('')
  const [source, setSource] = useState(generatePineDraft('Indikator Kustom Baru', 'ema', { period: 20 }))
  const [author, setAuthor] = useState('AURUM Lab')
  const [license, setLicense] = useState('MPL-2.0')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [visibleOnChart, setVisibleOnChart] = useState(true)

  // Modals & Popups
  const [libraryModalOpen, setLibraryModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [libraryCategory, setLibraryCategory] = useState<'all' | 'builtin' | 'custom' | 'fav'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('aurum_fav_indicators') ?? '[]')
    } catch {
      return []
    }
  })

  // Pick first available research dataset for preview
  const defaultDataset = catalog.datasets.find((d) => !d.archived && d.spec.role === 'research')?.version_id ?? ''
  const [datasetId, setDatasetId] = useState(defaultDataset)

  // Initialize selected indicator on first mount if available
  useEffect(() => {
    if (!selected && catalog.indicators.length > 0) {
      // Pick BOSWaves if available, or first non-archived indicator
      const boswaves = catalog.indicators.find((i) => !i.archived && i.spec.kind === 'boswaves_core')
      const first = boswaves ?? catalog.indicators.find((i) => !i.archived && i.spec.kind === 'ema') ?? catalog.indicators[0]
      void choose(first)
    }
  }, [catalog.indicators])

  function toggleFavorite(id: string) {
    const updated = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id]
    setFavorites(updated)
    try {
      localStorage.setItem('aurum_fav_indicators', JSON.stringify(updated))
    } catch {
      // Ignore storage errors
    }
  }

  async function choose(item: Item) {
    setSelected(item)
    setName(item.name)
    setDescription(item.spec.description ?? '')
    setEngine(item.spec.kind ?? 'ema')
    setParams(item.spec.params ?? {})
    setAuthor(item.spec.provenance?.author ?? 'AURUM Lab')
    setLicense(item.spec.provenance?.license ?? 'MPL-2.0')
    setPreview(null)

    if (item.spec.source && item.spec.source.trim().length > 50) {
      setSource(item.spec.source)
    } else if (item.spec.kind === 'boswaves_core') {
      try {
        const text = await requestText('/example-source')
        if (text) {
          setSource(text)
        } else {
          setSource(generatePineDraft(item.name, item.spec.kind, item.spec.params))
        }
      } catch {
        setSource(generatePineDraft(item.name, item.spec.kind, item.spec.params))
      }
    } else {
      setSource(generatePineDraft(item.name, item.spec.kind, item.spec.params))
    }
  }

  function handleNewScript() {
    setSelected(null)
    const newName = 'Script Pine Baru'
    setName(newName)
    setEngine('ema')
    setParams({ period: 20 })
    setDescription('Indikator kustom baru dibuat di Pine Editor.')
    setSource(generatePineDraft(newName, 'ema', { period: 20 }))
    setAuthor('User')
    setLicense('Custom')
    setViewMode('editor')
  }

  async function handleSave() {
    const spec: Spec = {
      kind: engine,
      params,
      description,
      source: source || undefined,
      provenance: source ? { author, license } : undefined,
    }
    const item = await request<Item>(
      selected ? `/items/indicators/${selected.id}` : '/items/indicators',
      selected ? 'PUT' : 'POST',
      { name, spec },
    )
    choose(item)
  }

  async function handleSettingsSave(
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
    setSettingsModalOpen(false)
  }

  async function applyIndicatorToChart() {
    if (!datasetId || !selected) return
    const prev = await request<Preview>('/preview', 'POST', {
      dataset_version_id: datasetId,
      indicators: [
        {
          alias: 'indicator',
          version_id: selected.version_id,
          params,
        },
      ],
    })
    setPreview(prev)
    setViewMode('chart')
  }

  function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
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
      setViewMode('editor')
    }
    reader.readAsText(file)
  }

  // Filter indicators for the TradingView Library Modal
  const filteredIndicators = catalog.indicators.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.spec.kind ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false
    if (libraryCategory === 'builtin') return item.builtin
    if (libraryCategory === 'custom') return !item.builtin
    if (libraryCategory === 'fav') return favorites.includes(item.id)
    return true
  })

  return (
    <div className="flex flex-col space-y-4">
      {/* 1. TradingView Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-[#0d121a] px-4 py-2.5 shadow-sm">
        {/* Left: Indicator title and Status */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
            fx
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground truncate">
                {selected?.name ?? name}
              </span>
              <span className="rounded bg-primary/20 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-primary">
                {selected?.spec.kind?.toUpperCase() ?? engine.toUpperCase()}
              </span>
              {selected?.builtin && (
                <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
                  Bawaan
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {selected ? `v${selected.version} · ${selected.spec.provenance?.author ?? 'AURUM Lab'}` : 'Script Baru (Belum Disimpan)'}
            </p>
          </div>
        </div>

        {/* Center: View Switcher (Chart vs Pine Editor vs Inputs) */}
        <div className="flex items-center rounded-lg border border-border bg-[#141b26] p-1 text-xs">
          <button
            onClick={() => {
              setViewMode('chart')
              if (!preview && datasetId && selected) {
                void applyIndicatorToChart()
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              viewMode === 'chart'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="size-3.5" />
            <span className="hidden sm:inline">Grafik Chart</span>
          </button>
          <button
            onClick={() => setViewMode('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              viewMode === 'editor'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Code2 className="size-3.5" />
            <span>Pine Editor</span>
          </button>
          <button
            onClick={() => setViewMode('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              viewMode === 'settings'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="size-3.5" />
            <span className="hidden sm:inline">Pengaturan Inputs</span>
          </button>
        </div>

        {/* Right: Library, New, Import, Save Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Open TradingView Indicator Library Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLibraryModalOpen(true)}
            className="gap-1.5 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-medium text-xs h-8"
          >
            <Search className="size-3.5" />
            <span>Perpustakaan Indikator</span>
          </Button>

          {/* New Script */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleNewScript}
            className="gap-1.5 border-border bg-[#141b26] text-foreground hover:bg-[#1a2332] text-xs h-8"
            title="Buat script indikator baru"
          >
            <Plus className="size-3.5" />
            <span className="hidden md:inline">Script Baru</span>
          </Button>

          {/* Import Pine file */}
          <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-[#141b26] px-2.5 text-xs font-medium text-foreground hover:bg-[#1a2332] transition-colors">
            <FileUp className="size-3.5 text-muted-foreground" />
            <span className="hidden md:inline">Impor .pine</span>
            <input
              type="file"
              accept=".pine,.txt"
              className="hidden"
              onChange={handleImportFile}
            />
          </label>

          {/* Save Script Button */}
          <Button
            size="sm"
            disabled={selected?.builtin || selected?.archived}
            onClick={() => void act(handleSave)}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-3 font-semibold"
          >
            <Save className="size-3.5" />
            <span>Simpan</span>
          </Button>
        </div>
      </div>

      {/* 2. Interactive Legend Bar (TradingView Chart Legend Style) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-[#0d121a] px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400" />
          <span className="font-semibold text-foreground">
            {name}
          </span>
          <span className="font-mono text-muted-foreground">
            ({Object.entries(params).map(([k, v]) => `${k}: ${v}`).join(', ') || 'default'})
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setVisibleOnChart(!visibleOnChart)}
            className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
            title={visibleOnChart ? 'Sembunyikan dari chart' : 'Tampilkan di chart'}
          >
            {visibleOnChart ? <Eye className="size-3.5 text-primary" /> : <EyeOff className="size-3.5" />}
          </Button>

          <Button
            size="xs"
            variant="ghost"
            onClick={() => setSettingsModalOpen(true)}
            className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
            title="Pengaturan parameter inputs (TradingView Settings)"
          >
            <Sliders className="size-3.5" />
          </Button>

          <Button
            size="xs"
            variant="ghost"
            onClick={() => setViewMode('editor')}
            className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
            title="Lihat source code di Pine Editor"
          >
            <Code2 className="size-3.5" />
          </Button>

          {selected && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                void act(async () => {
                  const copy = await request<Item>(`/items/indicators/${selected.id}/clone`, 'POST', {
                    name: `${selected.name} (Salinan)`,
                    spec: {},
                  })
                  choose(copy)
                })
              }
              className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
              title="Duplikat indikator"
            >
              <CopyPlus className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* 3. Main Workspace Area */}
      {viewMode === 'editor' && (
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
          onSave={() => void act(handleSave)}
          onSwitchToInterface={() => setViewMode('settings')}
          onApplyToChart={() => void applyIndicatorToChart()}
          canSave={!selected?.builtin && !selected?.archived}
          isBuiltin={selected?.builtin}
        />
      )}

      {viewMode === 'settings' && (
        <div className="rounded-xl border border-border bg-[#0d121a] p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                Pengaturan Parameter: {name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Konfigurasi nilai parameter teknikal tanpa koding (persis seperti dialog Settings di TradingView).
              </p>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setViewMode('editor')}
              className="gap-1.5 text-primary border-primary/30"
            >
              <Code2 className="size-3.5" />
              Buka di Pine Editor
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Nama Indikator
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={selected?.builtin}
                  className="bg-[#141b26] border-border text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Mesin Algoritma (Engine)
                </label>
                <select
                  value={engine}
                  onChange={(e) => {
                    setEngine(e.target.value)
                    setParams({})
                  }}
                  disabled={selected?.builtin}
                  className={`${selectClass} bg-[#141b26] border-border text-xs`}
                >
                  {Object.entries(catalog.schemas).map(([k, s]) => (
                    <option key={k} value={k}>
                      {s.label} ({k})
                    </option>
                  ))}
                  <option value="source_only">Source tersimpan (Review Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Keterangan / Deskripsi
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  disabled={selected?.builtin}
                  placeholder="Keterangan cara kerja indikator..."
                  className={`${selectClass} bg-[#141b26] border-border text-xs resize-none`}
                />
              </div>
            </div>

            {/* Right: Technical Parameters Form */}
            <div className="rounded-xl border border-border/80 bg-[#111722] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="font-semibold text-xs text-foreground">
                  Parameter Inputs ({catalog.schemas[engine]?.label ?? engine})
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Outputs: {catalog.schemas[engine]?.outputs.join(', ') ?? 'value'}
                </span>
              </div>

              {catalog.schemas[engine]?.params && Object.keys(catalog.schemas[engine].params).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {Object.entries(catalog.schemas[engine].params).map(([key, r]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono font-medium text-foreground">{key}</span>
                        <span className="text-[10px] text-muted-foreground">def: {r.default}</span>
                      </div>
                      <Input
                        type="number"
                        value={params[key] ?? r.default}
                        min={r.min}
                        max={r.max}
                        step={r.type === 'integer' ? 1 : 'any'}
                        disabled={selected?.builtin}
                        onChange={(e) =>
                          setParams({
                            ...params,
                            [key]: Number(e.target.value),
                          })
                        }
                        className="h-8 text-xs bg-[#18202d] border-border"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground/60">
                        <span>Min: {r.min}</span>
                        <span>Max: {r.max}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-4">
                  Formula indikator ini tidak memerlukan input parameter tambahan.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <Button
              size="xs"
              variant="outline"
              onClick={() => void applyIndicatorToChart()}
              className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:border-emerald-500"
            >
              <Play className="size-3.5" />
              Terapkan ke Chart
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="xs"
                variant="outline"
                onClick={() => setViewMode('chart')}
              >
                Kembali ke Chart
              </Button>
              <Button
                size="xs"
                disabled={selected?.builtin || selected?.archived}
                onClick={() => void act(handleSave)}
                className="bg-primary text-primary-foreground font-semibold px-4"
              >
                Simpan Parameter
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'chart' && (
        <div className="rounded-xl border border-border bg-[#0d121a] p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h3 className="font-semibold text-sm text-foreground">
                Visualisasi Chart: {name}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Pratinjau garis indikator pada candle chart MT5.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                className={`${selectClass} h-7 py-0 text-xs w-auto bg-[#141b26] border-border`}
              >
                <option value="">Pilih Dataset Candle MT5...</option>
                {catalog.datasets
                  .filter((d) => !d.archived && d.spec.role === 'research')
                  .map((d) => (
                    <option key={d.id} value={d.version_id}>
                      {d.name} ({d.spec.symbol} {d.spec.interval})
                    </option>
                  ))}
              </select>

              <Button
                size="xs"
                disabled={!datasetId || !selected}
                onClick={() => void applyIndicatorToChart()}
                className="h-7 text-xs bg-primary text-primary-foreground"
              >
                Render Ulang
              </Button>
            </div>
          </div>

          {preview ? (
            <LabChart data={preview} />
          ) : (
            <div className="flex min-h-[380px] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 p-8 text-center bg-[#070a0f]">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                <Activity className="size-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Grafik Siap Ditampilkan
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                Klik tombol di bawah untuk menerapkan indikator <strong>{name}</strong> ke grafik candle.
              </p>
              <Button
                size="sm"
                disabled={!datasetId || !selected}
                onClick={() => void applyIndicatorToChart()}
                className="gap-2 bg-primary text-primary-foreground"
              >
                <Play className="size-3.5" />
                Terapkan Indikator ke Chart
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 4. TradingView "Indicators, Metrics & Strategies" Modal */}
      {libraryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="relative flex flex-col w-full max-w-3xl rounded-xl border border-border bg-[#0d121a] shadow-2xl overflow-hidden max-h-[85vh]">
            {/* Modal Header (TradingView Style) */}
            <div className="flex items-center justify-between border-b border-border/80 bg-[#121824] px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  fx
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">
                    Indikator, Metrik & Script
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Perpustakaan rumus teknikal & script Pine Script
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLibraryModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Tutup"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="border-b border-border/60 bg-[#0f1520] p-3 px-5">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ketik untuk mencari indikator (contoh: EMA, RSI, ALMA, Bollinger...)"
                  className="pl-9 h-9 text-xs bg-[#141b26] border-border"
                  autoFocus
                />
              </div>
            </div>

            {/* Modal Body: Left Categories & Right Indicator List */}
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] flex-1 min-h-[380px] overflow-hidden">
              {/* Left Sidebar Categories */}
              <div className="border-r border-border/60 bg-[#090d14] p-3 space-y-1 text-xs">
                <button
                  onClick={() => setLibraryCategory('all')}
                  className={`flex w-full items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                    libraryCategory === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-[#141b26] hover:text-foreground'
                  }`}
                >
                  <span>⚡ Semua Indikator</span>
                  <span className="font-mono text-[10px] opacity-80">{catalog.indicators.length}</span>
                </button>
                <button
                  onClick={() => setLibraryCategory('builtin')}
                  className={`flex w-full items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                    libraryCategory === 'builtin'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-[#141b26] hover:text-foreground'
                  }`}
                >
                  <span>🌟 Bawaan Teknikal</span>
                  <span className="font-mono text-[10px] opacity-80">
                    {catalog.indicators.filter((i) => i.builtin).length}
                  </span>
                </button>
                <button
                  onClick={() => setLibraryCategory('custom')}
                  className={`flex w-full items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                    libraryCategory === 'custom'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-[#141b26] hover:text-foreground'
                  }`}
                >
                  <span>📜 Script Saya (Pine)</span>
                  <span className="font-mono text-[10px] opacity-80">
                    {catalog.indicators.filter((i) => !i.builtin).length}
                  </span>
                </button>
                <button
                  onClick={() => setLibraryCategory('fav')}
                  className={`flex w-full items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
                    libraryCategory === 'fav'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-[#141b26] hover:text-foreground'
                  }`}
                >
                  <span>⭐ Favorit</span>
                  <span className="font-mono text-[10px] opacity-80">{favorites.length}</span>
                </button>
              </div>

              {/* Right: Indicator Results List */}
              <div className="overflow-y-auto p-4 space-y-2 bg-[#0d121a]">
                {filteredIndicators.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
                    <Search className="size-8 text-muted-foreground/40 mb-2" />
                    <p className="font-medium text-foreground">Tidak ada indikator yang cocok</p>
                    <p className="text-[11px] mt-0.5">Coba kata kunci pencarian lain atau buat script baru.</p>
                  </div>
                ) : (
                  filteredIndicators.map((ind) => {
                    const isFav = favorites.includes(ind.id)
                    const isCurrent = selected?.id === ind.id

                    return (
                      <div
                        key={ind.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-all ${
                          isCurrent
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/60 bg-[#111722] hover:border-primary/30 hover:bg-[#141b26]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <button
                            onClick={() => toggleFavorite(ind.id)}
                            className="text-muted-foreground hover:text-amber-400 transition-colors p-1"
                            title={isFav ? 'Hapus dari favorit' : 'Tambahkan ke favorit'}
                          >
                            <Star
                              className={`size-4 ${
                                isFav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/60'
                              }`}
                            />
                          </button>

                          <div
                            onClick={() => {
                              choose(ind)
                              setLibraryModalOpen(false)
                            }}
                            className="cursor-pointer min-w-0 flex-1"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-foreground hover:text-primary transition-colors">
                                {ind.name}
                              </span>
                              <span className="rounded bg-primary/10 px-1.5 py-0.2 font-mono text-[10px] text-primary">
                                {ind.spec.kind?.toUpperCase()}
                              </span>
                              {ind.builtin && (
                                <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] text-muted-foreground">
                                  Bawaan
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {ind.spec.description || 'Indikator teknikal deterministik AURUM Studio'}
                            </p>
                          </div>
                        </div>

                        {/* Quick action buttons on each indicator */}
                        <div className="flex items-center gap-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              choose(ind)
                              setLibraryModalOpen(false)
                              setSettingsModalOpen(true)
                            }}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            title="Pengaturan Inputs"
                          >
                            <Sliders className="size-3.5" />
                          </Button>

                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              choose(ind)
                              setLibraryModalOpen(false)
                              setViewMode('editor')
                            }}
                            className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                            title="Buka di Pine Editor"
                          >
                            <Code2 className="size-3.5" />
                          </Button>

                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              choose(ind)
                              setLibraryModalOpen(false)
                              setViewMode('chart')
                              void applyIndicatorToChart()
                            }}
                            className="h-7 px-2 text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                          >
                            Pilih
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border/80 bg-[#121824] px-5 py-3 text-xs">
              <span className="text-muted-foreground text-[11px]">
                {filteredIndicators.length} indikator ditampilkan
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => setLibraryModalOpen(false)}
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. TradingView Settings Dialog */}
      {selected && (
        <IndicatorSettingsDialog
          item={selected}
          schema={catalog.schemas[engine]}
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          onSave={handleSettingsSave}
          onOpenPineEditor={() => {
            setViewMode('editor')
          }}
          onApplyToChart={() => {
            void applyIndicatorToChart()
          }}
        />
      )}
    </div>
  )
}
