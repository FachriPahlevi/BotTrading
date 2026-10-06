import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Field,ItemList,Params,selectClass} from './shared'
import {request,download,type Catalog,type Item,type Instance,type Preview,type Spec} from './api'
import {LabChart} from './lab-chart'

export function LibraryPanel({
  catalog,
  act,
  onlyKind,
  forcedKind,
  hideDataset,
}: {
  catalog: Catalog
  act: (fn: () => Promise<unknown>) => Promise<void>
  onlyKind?: 'indicators' | 'strategies'
  forcedKind?: 'indicators' | 'strategies'
  hideDataset?: boolean
}) {
  const [kind, setKind] = useState<'indicators' | 'strategies'>(onlyKind ?? forcedKind ?? 'indicators')
  const [selected, setSelected] = useState<Item | null>(null)
  const [name, setName] = useState('Indikator saya')
  const [engine, setEngine] = useState('ema')
  const [params, setParams] = useState<Record<string, number>>({})
  const [description, setDescription] = useState('')
  const [source, setSource] = useState('')
  const [author, setAuthor] = useState('BOSWaves')
  const [license, setLicense] = useState('MPL-2.0')
  const [adaptation, setAdaptation] = useState('source_only')
  const [instances, setInstances] = useState<Instance[]>([])
  const [definition, setDefinition] = useState('')
  const [dataset, setDataset] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
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

  function choose(item: Item) {
    setSelected(item)
    setName(item.name)
    setDescription(item.spec.description ?? '')
    setEngine(item.spec.kind ?? 'ema')
    setParams(item.spec.params ?? {})
    setSource(item.spec.source ?? '')
    setAuthor(item.spec.provenance?.author ?? '')
    setLicense(item.spec.provenance?.license ?? '')
    setInstances(item.spec.indicators ?? [])
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

  function add() {
    if (!definition) return
    const item = catalog.indicators.find((d) => d.versions.some((v) => v.id === definition))
    const ver = item?.versions.find((v) => v.id === definition)
    if (item && ver) {
      setInstances([
        ...instances,
        { alias: `ind_${instances.length + 1}`, version_id: definition, params: { ...ver.spec.params } },
      ])
    }
  }

  async function save() {
    const spec: Spec =
      kind === 'indicators'
        ? { kind: engine, params, description }
        : { ...JSON.parse(rules), description, indicators: instances, status: 'idea' }
    const item = await request<Item>(
      selected ? `/items/${kind}/${selected.id}` : `/items/${kind}`,
      selected ? 'PUT' : 'POST',
      { name, spec },
    )
    choose(item)
  }

  return (
    <div className="space-y-5">
      {!onlyKind && !forcedKind && (
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
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <ItemList
          items={catalog[kind]}
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
        />
        <div className="min-w-0 space-y-4 rounded-lg border border-border p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-medium">{selected ? `Editor · v${selected.version}` : 'Buat baru'}</h3>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setSelected(null)
                setName('Item baru')
              }}
            >
              Baru
            </Button>
          </div>
          <Field label="Nama">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Deskripsi">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {kind === 'indicators' ? (
            <>
              <Field label="Mesin indikator">
                <select
                  className={selectClass}
                  value={engine}
                  onChange={(e) => {
                    setEngine(e.target.value)
                    setParams({})
                  }}
                >
                  {Object.entries(catalog.schemas).map(([k, s]) => (
                    <option key={k} value={k}>
                      {s.label}
                    </option>
                  ))}
                  {engine === 'source_only' && <option value="source_only">Source tersimpan · belum didukung</option>}
                </select>
              </Field>
              <Params schema={catalog.schemas[engine]} values={params} onChange={setParams} />
              {selected?.spec.provenance && (
                <p className="break-all text-xs text-muted-foreground">
                  {selected.spec.provenance.author} · {selected.spec.provenance.license} ·{' '}
                  {selected.spec.provenance.source_hash}
                </p>
              )}
              {selected?.spec.unsupported?.length ? (
                <p className="text-xs text-amber-200">
                  Belum diterjemahkan: {selected.spec.unsupported.join(', ')}
                </p>
              ) : null}
              <details className="space-y-3" open={engine === 'source_only'}>
                <summary className="cursor-pointer text-sm">Editor Pine Script</summary>
                <p className="text-xs text-muted-foreground">
                  Source dapat diedit dan disimpan sebagai versi baru. Source Pine disimpan untuk review dan tidak
                  dijalankan langsung. Adaptasi numerik perlu implementasi domain yang didukung.
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
                <Field label={`Source Pine · ${source.split('\n').length} baris`}>
                  <textarea
                    aria-label="Source Pine"
                    spellCheck={false}
                    className={`${selectClass} min-h-[420px] resize-y font-mono text-xs leading-relaxed`}
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder={'//@version=6\nindicator("Indikator saya")'}
                  />
                </Field>
                <select
                  aria-label="Mode impor"
                  className={selectClass}
                  value={adaptation}
                  onChange={(e) => setAdaptation(e.target.value)}
                >
                  <option value="source_only">Simpan source untuk review</option>
                  <option value="boswaves_numeric">Adaptasi numerik contoh BOSWaves (draft)</option>
                </select>
                <Button
                  disabled={!source || !author || !license || !!selected?.builtin}
                  onClick={() =>
                    void act(async () =>
                      choose(
                        await request<Item>(
                          selected ? `/indicators/${selected.id}/source` : '/indicators/import',
                          selected ? 'PUT' : 'POST',
                          { name, source, author, license, adaptation },
                        ),
                      ),
                    )
                  }
                >
                  {selected ? 'Simpan versi script' : 'Impor script'}
                </Button>{' '}
                <a className="text-xs underline" href="/api/lab/example-source" download>
                  Unduh source contoh berlisensi
                </a>
              </details>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Susun instance indikator, lalu referensikan alias.output pada aturan. Maksimal 32 instance per
                strategi/pratinjau.
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
                <Button variant="outline" onClick={add} disabled={!definition || instances.length >= 32}>
                  Tambah
                </Button>
              </div>
              {instances.map((i, index) => {
                const item = catalog.indicators.find((d) => d.versions.some((v) => v.id === i.version_id))
                const spec = item?.versions.find((v) => v.id === i.version_id)?.spec
                return (
                  <div key={index} className="space-y-2 rounded border border-border p-3">
                    <div className="flex gap-2">
                      <Input
                        aria-label={`Alias indikator ${index + 1}`}
                        value={i.alias}
                        onChange={(e) =>
                          setInstances(instances.map((v, n) => (n === index ? { ...v, alias: e.target.value } : v)))
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInstances(instances.filter((_, n) => n !== index))}
                      >
                        Hapus
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item?.name} · output: {catalog.schemas[spec?.kind ?? '']?.outputs.join(', ')}
                    </p>
                    <Params
                      schema={catalog.schemas[spec?.kind ?? '']}
                      values={i.params}
                      onChange={(p) => setInstances(instances.map((v, n) => (n === index ? { ...v, params: p } : v)))}
                    />
                  </div>
                )
              })}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const bos = catalog.indicators.find((i) => i.spec.kind === 'boswaves_core' && !i.archived)
                  if (bos) {
                    setInstances([{ alias: 'ribbon', version_id: bos.version_id, params: { ...bos.spec.params } }])
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
                Operator: gt, lt, crossover, crossunder; gabungan all/any dengan rules. Buy dan sell bersamaan berarti
                WAIT. Source kode tidak dieksekusi.
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
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
                        ? { kind: engine, params, description }
                        : { ...JSON.parse(rules), description, indicators: instances, status: 'idea' },
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
              <summary className="cursor-pointer text-xs">Riwayat versi & perbandingan konfigurasi</summary>
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
                {[selected.versions.find((v) => v.id === compare)?.spec, selected.spec].map((v, n) => (
                  <pre key={n} className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-[10px]">
                    {JSON.stringify(v, null, 2)}
                  </pre>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
      {!hideDataset && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="font-medium">Pratinjau indikator pada histori</h3>
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
    </div>
  )
}
