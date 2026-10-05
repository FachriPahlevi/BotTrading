import io
import json
import os
from datetime import datetime, timezone, timedelta
from urllib.request import urlopen
from urllib.parse import urlencode
from urllib.error import URLError, HTTPError

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field

from app.db.session import get_db
from app.lab.models import LabItem, LabVersion, LabRun, LabAudit
from app.lab.schemas import ItemInput, DatasetInput, ImportSource, RunInput, PreviewInput, HistoryRequest
from app.lab import datasets, service, jobs
from trading_agent.lab_indicators import REGISTRY
from trading_agent.lab_rules import evaluate_indicators, signals

router = APIRouter(prefix='/lab')


def checked(call):
    try:
        return call()
    except ValueError as exc:
        # Validation text only; no full source or candle payload goes into diagnostics.
        raise HTTPException(422, str(exc)[:600]) from exc


@router.get('/catalog')
def catalog(db: Session = Depends(get_db)):
    service.seed(db)
    items = {}
    for kind in ('indicators', 'strategies', 'datasets'):
        items[kind] = [service.serialize(item, db.query(LabVersion).filter_by(item_id=item.id).order_by(LabVersion.number.desc()).first(), db)
                       for item in db.query(LabItem).filter_by(kind=kind).order_by(LabItem.created_at).all()]
    runs = db.query(LabRun).order_by(LabRun.created_at.desc()).limit(200).all()
    return {**items, 'schemas': REGISTRY, 'runs': [run_summary(r) for r in runs],
            'run_count': db.query(LabRun).count(), 'history_bridge_configured': bool(os.getenv('MT5_BRIDGE_URL'))}


@router.post('/indicators/import')
def import_indicator(payload: ImportSource, db: Session = Depends(get_db)):
    return checked(lambda: service.import_pine(db, payload))


@router.get('/example-source')
def example_source():
    return Response(service.SOURCE_PATH.read_text(encoding='utf-8'), media_type='text/plain', headers={'Content-Disposition': 'attachment; filename="BOSWaves.pine"'})


@router.post('/items/{kind}')
def create_item(kind: str, payload: ItemInput, db: Session = Depends(get_db)):
    return checked(lambda: service.save(db, kind, payload.name, payload.spec))


@router.put('/items/{kind}/{item_id}')
def update_item(kind: str, item_id: str, payload: ItemInput, db: Session = Depends(get_db)):
    return checked(lambda: service.save(db, kind, payload.name, payload.spec, item_id))


@router.post('/items/{item_id}/clone')
def clone_item(item_id: str, payload: ItemInput, db: Session = Depends(get_db)):
    item = db.get(LabItem, item_id)
    if not item: raise HTTPException(404, 'Item tidak ditemukan.')
    version = db.query(LabVersion).filter_by(item_id=item.id).order_by(LabVersion.number.desc()).first()
    return checked(lambda: service.save(db, item.kind, payload.name, version.spec, trusted=True))


@router.post('/items/{item_id}/archive')
def archive(item_id: str, db: Session = Depends(get_db)):
    item = db.get(LabItem, item_id)
    if not item: raise HTTPException(404, 'Item tidak ditemukan.')
    if item.builtin: raise HTTPException(409, 'Definisi bawaan tidak dapat diarsipkan.')
    item.archived = not item.archived
    db.add(LabAudit(item_id=item.id, action='archived' if item.archived else 'restored'))
    db.commit()
    return {'archived': item.archived}


def ingest_dataset(db, payload):
    frame, quality = datasets.parse_csv(payload.csv, payload.interval)
    identity = dict(broker=payload.broker, server=payload.server, symbol=payload.symbol,
                    interval=payload.interval, role=payload.role)
    existing = db.query(LabItem).filter_by(kind='datasets', name_key=payload.name.strip().casefold()).first()
    if existing:
        latest = db.query(LabVersion).filter_by(item_id=existing.id).order_by(LabVersion.number.desc()).first()
        if any(latest.spec[k] != identity[k] for k in identity):
            raise ValueError('Identitas dataset berbeda. Gunakan nama dataset baru.')
        if payload.role == 'holdout':
            raise ValueError('Holdout immutable; gunakan nama baru untuk dataset holdout baru.')
        prior = datasets.load_dataset(latest.spec)
        frame = pd.concat([prior, frame]).drop_duplicates('time', keep='last').sort_values('time').reset_index(drop=True)
        if len(frame) > 200000:
            raise ValueError('Batas dataset awal 200.000 candle; gunakan rentang/nama lain.')
    spec = datasets.save_dataset(frame, identity, quality)
    return service.save(db, 'datasets', payload.name, spec, existing.id if existing else None, trusted=True)


@router.post('/datasets/import')
def import_dataset(payload: DatasetInput, db: Session = Depends(get_db)):
    return checked(lambda: ingest_dataset(db, payload))


@router.post('/datasets/{version_id}/derive')
def derive(version_id: str, db: Session = Depends(get_db)):
    item, version = service.get_version(db, version_id, 'datasets')
    if version.spec['interval'] != '1m' or version.spec['role'] != 'research':
        raise HTTPException(422, 'Turunan hanya dari dataset M1 research.')
    frame = datasets.load_dataset(version.spec)
    results = []
    for interval in ('5m', '15m', '1h', '4h', '1d'):
        bars = datasets.resample(frame, interval)
        if len(bars) >= 2:
            payload = DatasetInput(name=f'{item.name[:80]} {interval}', broker=version.spec['broker'], server=version.spec['server'],
                                   symbol=version.spec['symbol'], interval=interval, csv=bars.to_csv(index=False))
            results.append(checked(lambda: ingest_dataset(db, payload)))
    return results


@router.post('/history/sync')
def sync_history(payload: HistoryRequest, db: Session = Depends(get_db)):
    bridge = os.getenv('MT5_BRIDGE_URL', '').rstrip('/')
    if not bridge:
        raise HTTPException(503, 'Bridge Python histori belum dikonfigurasi. Jalankan mt5_bridge.py di lingkungan MT5 atau impor CSV UTC.')
    chunks, identity = [], None
    start = payload.start
    while start < payload.end:
        end = min(start+timedelta(days=7), payload.end)
        query = urlencode(dict(symbol=payload.symbol, start=start.isoformat(), end=end.isoformat()))
        try:
            with urlopen(f'{bridge}/history?{query}', timeout=15) as response:
                part = json.load(response)
            if not isinstance(part.get('candles'), list) or len(part['candles']) > 11000:
                raise ValueError('History response invalid')
            meta = {k: part[k] for k in ('broker', 'server', 'symbol')}
            if identity is not None and identity != meta:
                raise ValueError('Account/server changed')
            identity = meta
            chunks.extend(part['candles'])
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, TypeError) as exc:
            raise HTTPException(503, 'Histori gagal dibaca atau identitas terminal berubah. Tidak ada dataset parsial disimpan.') from exc
        start = end
    if not chunks or identity is None:
        raise HTTPException(503, 'Terminal tidak menyediakan histori pada rentang ini. Periksa Max bars in chart.')
    request = DatasetInput(name=payload.name, **identity, interval='1m', csv=pd.DataFrame(chunks).to_csv(index=False))
    return checked(lambda: ingest_dataset(db, request))


@router.post('/preview')
def preview(payload: PreviewInput, db: Session = Depends(get_db)):
    _, dataset = service.get_version(db, payload.dataset_version_id, 'datasets')
    if dataset.spec['role'] == 'holdout':
        raise HTTPException(409, 'Holdout terkunci untuk pratinjau/tuning.')
    def calculate():
        frame = datasets.load_dataset(dataset.spec)
        instances = service.resolve_instances(db, payload.indicators)
        outputs, required = evaluate_indicators(frame, instances)
        if len(frame) <= required:
            raise ValueError(f'Butuh lebih dari {required} candle; tersedia {len(frame)}.')
        start = max(0, len(frame)-2000)
        lines = {key: [None if pd.isna(v) else float(v) for v in series.iloc[start:]]
                 for key, series in outputs.items() if '.' in key}
        return dict(candles=frame.iloc[start:].to_dict('records'), lines=lines, instances=instances, warmup_bars=required,
                    dataset_id=dataset.spec['dataset_id'], symbol=dataset.spec['symbol'], interval=dataset.spec['interval'],
                    note='Pratinjau dataset historis; bukan feed live. Maksimal 2.000 bar terakhir; perhitungan memakai seluruh dataset.')
    return checked(calculate)


def run_summary(run):
    return dict(id=run.id, name=run.name, status=run.status, progress=run.progress,
                created_at=run.created_at.isoformat(), error=run.error,
                metrics={k: v for k, v in (run.result or {}).items() if k not in ('trades', 'equity_curve')},
                strategy_version_id=run.snapshot['strategy_version_id'], dataset_version_id=run.snapshot['dataset_version_id'])


@router.post('/runs')
def create_run(payload: RunInput, db: Session = Depends(get_db)):
    if db.query(LabRun).filter(LabRun.status.in_(['queued', 'running'])).count() >= 20:
        raise HTTPException(409, 'Antrean maksimal 20 run. Tunggu atau batalkan run sebelumnya.')
    strategy_item, strategy = service.get_version(db, payload.strategy_version_id, 'strategies')
    dataset_item, dataset = service.get_version(db, payload.dataset_version_id, 'datasets')
    for instance in strategy.spec['instances']:
        service.get_version(db, instance['version_id'], 'indicators')
    if not payload.name.strip():
        raise HTTPException(422, 'Nama run wajib diisi.')
    if not payload.research_ack:
        raise HTTPException(422, 'Konfirmasi run penelitian/experimental dan asumsi biaya sebelum menjalankan.')
    if dataset.spec['role'] == 'holdout' and not payload.unlock_holdout:
        raise HTTPException(409, 'Holdout terkunci. Buka secara eksplisit untuk evaluasi, akses akan diaudit.')
    required = checked(lambda: signals(datasets.load_dataset(dataset.spec), strategy.spec)[2])
    settings = payload.model_dump()
    snapshot = dict(strategy=strategy.spec, dataset=dataset.spec, settings=settings,
                    strategy_name=strategy_item.name, dataset_name=dataset_item.name,
                    strategy_version_id=strategy.id, dataset_version_id=dataset.id,
                    config_hash=strategy.config_hash, dataset_id=dataset.spec['dataset_id'],
                    code_version=jobs.code_version(), seed=payload.seed, warmup_bars=required, experimental=True)
    run = LabRun(name=payload.name.strip(), status='queued', snapshot=snapshot)
    db.add(run)
    if payload.unlock_holdout and dataset.spec['role'] == 'holdout':
        db.add(LabAudit(item_id=dataset.item_id, action='holdout_opened', config_hash=dataset.config_hash))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback(); raise HTTPException(409, 'Nama run sudah digunakan.') from exc
    jobs.POOL.submit(jobs.execute, run.id)
    return run_summary(run)


@router.get('/runs/{run_id}')
def run_detail(run_id: str, db: Session = Depends(get_db)):
    run = db.get(LabRun, run_id)
    if not run: raise HTTPException(404, 'Run tidak ditemukan.')
    return {**run_summary(run), 'snapshot': run.snapshot, 'result': run.result}


@router.post('/runs/{run_id}/cancel')
def cancel_run(run_id: str, db: Session = Depends(get_db)):
    run = db.get(LabRun, run_id)
    if not run: raise HTTPException(404, 'Run tidak ditemukan.')
    if run.status not in ('queued', 'running'):
        raise HTTPException(409, 'Run sudah berhenti.')
    run.cancel_requested = True
    db.commit()
    return {'status': 'cancel_requested'}


@router.get('/items/{item_id}/audit')
def audit(item_id: str, db: Session = Depends(get_db)):
    return [dict(action=a.action, config_hash=a.config_hash, created_at=a.created_at.isoformat())
            for a in db.query(LabAudit).filter_by(item_id=item_id).order_by(LabAudit.created_at.desc()).all()]
