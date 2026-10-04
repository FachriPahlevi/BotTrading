import hashlib
import re
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.lab.models import LabItem, LabVersion, LabAudit, LabRun
from app.lab.datasets import digest
from app.lab.schemas import StrategyConfig
from trading_agent.lab_indicators import REGISTRY, parameters
from trading_agent.lab_rules import validate_rules

SOURCE_PATH = Path(__file__).parent / 'sources' / 'trend_target_ribbon.pine'


def serialize(item, version, db):
    versions = db.query(LabVersion).filter_by(item_id=item.id).order_by(LabVersion.number.desc()).all()
    ids = {v.id for v in versions}
    usage = sum(1 for run in db.query(LabRun).all() if run.snapshot.get('strategy_version_id') in ids
                or run.snapshot.get('dataset_version_id') in ids
                or any(i.get('version_id') in ids for i in run.snapshot.get('strategy', {}).get('instances', [])))
    return dict(id=item.id, kind=item.kind, name=item.name, archived=item.archived, builtin=item.builtin,
                version_id=version.id, version=version.number, config_hash=version.config_hash, spec=version.spec,
                created_at=version.created_at.isoformat(), usage=usage,
                versions=[dict(id=v.id, number=v.number, config_hash=v.config_hash, spec=v.spec,
                               created_at=v.created_at.isoformat()) for v in versions])


def get_version(db, version_id, kind=None, allow_archived=False):
    version = db.get(LabVersion, version_id)
    item = db.get(LabItem, version.item_id) if version else None
    if not item or (kind and item.kind != kind):
        raise HTTPException(404, 'Versi tidak ditemukan.')
    if item.archived and not allow_archived:
        raise HTTPException(409, 'Item diarsipkan; pulihkan sebelum apply.')
    return item, version


def resolve_instances(db, instances):
    resolved, aliases = [], set()
    for instance in instances:
        value = instance.model_dump() if hasattr(instance, 'model_dump') else instance
        _, version = get_version(db, value['version_id'], 'indicators')
        spec = version.spec
        if spec['kind'] not in REGISTRY:
            raise ValueError('Source Pine ini belum memiliki adaptasi yang didukung.')
        alias = value['alias']
        if alias in aliases:
            raise ValueError('Alias indikator tidak boleh duplikat.')
        aliases.add(alias)
        params = parameters(spec['kind'], {**spec.get('params', {}), **value['params']})
        resolved.append(dict(alias=alias, version_id=version.id, kind=spec['kind'], params=params,
                             status=spec.get('status', 'draft'), provenance=spec.get('provenance')))
    return resolved


def validate_spec(db, kind, spec):
    if kind == 'strategies':
        parsed = StrategyConfig.model_validate({k: v for k, v in spec.items() if k != 'instances'})
        normalized = parsed.model_dump()
        normalized['instances'] = resolve_instances(db, parsed.indicators)
        validate_rules(normalized)
        return normalized
    if kind == 'indicators':
        if set(spec)-{'kind', 'params', 'description'}:
            raise ValueError('Gunakan importer untuk source dan provenance; status verified tidak dapat disetel manual.')
        engine = spec.get('kind')
        return dict(kind=engine, params=parameters(engine, spec.get('params', {})),
                    description=str(spec.get('description', ''))[:2000], status='draft')
    raise HTTPException(400, 'Jenis item tidak didukung.')


def save(db, kind, name, spec, item_id=None, builtin=False, trusted=False):
    name = name.strip()
    if not name:
        raise ValueError('Nama wajib diisi.')
    if not trusted:
        spec = validate_spec(db, kind, spec)
    item = db.get(LabItem, item_id) if item_id else None
    if item_id and (not item or item.kind != kind):
        raise HTTPException(404, 'Item tidak ditemukan.')
    if item and (item.builtin or item.archived):
        raise HTTPException(409, 'Bawaan read-only atau item diarsipkan. Buat duplikat dahulu.')
    if not item:
        item = LabItem(kind=kind, name=name, name_key=name.casefold(), builtin=builtin)
        db.add(item)
    else:
        # Serialize concurrent version creation for the same item.
        item = db.query(LabItem).filter_by(id=item.id).with_for_update().one()
        item.name, item.name_key = name, name.casefold()
    try:
        db.flush()
        latest = db.query(LabVersion).filter_by(item_id=item.id).order_by(LabVersion.number.desc()).first()
        if latest and kind == 'indicators' and not trusted:
            for key in ('source', 'provenance', 'unsupported'):
                if key in latest.spec:
                    spec[key] = latest.spec[key]
        config_hash = digest(spec)
        if latest and latest.config_hash == config_hash:
            db.commit()
            return serialize(item, latest, db)
        version = LabVersion(item_id=item.id, number=latest.number+1 if latest else 1, config_hash=config_hash, spec=spec)
        db.add(version)
        db.add(LabAudit(item_id=item.id, action='version_created', config_hash=config_hash))
        db.commit()
        return serialize(item, version, db)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, 'Nama sudah digunakan atau versi sedang diperbarui. Muat ulang.') from exc


def seed(db):
    for key, schema in REGISTRY.items():
        name = schema['label']
        if db.query(LabItem).filter_by(kind='indicators', name_key=name.casefold()).first():
            continue
        spec = dict(kind=key, params=parameters(key, {}), status='draft' if key == 'boswaves_core' else 'builtin',
                    description='Numerical adaptation; source Pine drawing/position lifecycle unsupported. TradingView parity not verified.' if key == 'boswaves_core' else 'Implementasi numerik bawaan.')
        if key == 'boswaves_core':
            source = SOURCE_PATH.read_text()
            spec['provenance'] = dict(author='BOSWaves', license='MPL-2.0', source_hash=hashlib.sha256(source.encode()).hexdigest(), translator='manual-numeric-v1')
        save(db, 'indicators', name, spec, builtin=True, trusted=True)


def import_pine(db, payload):
    source = payload.source.replace('\r\n', '\n')
    blocked = [token for token in ['strategy.', 'lookahead_on', 'request.security', 'line.', 'box.', 'label.', 'array.', 'matrix.', 'import '] if token in source]
    provenance = dict(author=payload.author, license=payload.license, source_url=payload.source_url,
                      source_hash=hashlib.sha256(source.encode()).hexdigest(), translator='manual-numeric-v1')
    spec = dict(kind='source_only', params={}, status='unsupported', source=source, provenance=provenance,
                unsupported=blocked, description='Source disimpan untuk review; Pine tidak dieksekusi. Tidak ada penerjemah umum otomatis.')
    if payload.adaptation == 'boswaves_numeric':
        known = SOURCE_PATH.read_text().replace('\r\n', '\n')
        if source.strip() != known.strip() or payload.license != 'MPL-2.0':
            raise ValueError('Adaptasi BOSWaves hanya untuk source contoh persis dan lisensi MPL-2.0. Source lain perlu review.')
        spec.update(kind='boswaves_core', params=parameters('boswaves_core', {}), status='draft',
                    description='Adaptasi numerik: ALMA/deviation/trend flip/risk distance. Gambar Pine, target-hit lifecycle, gradient dan alerts tidak diterjemahkan; belum diverifikasi TradingView.')
    return save(db, 'indicators', payload.name, spec, trusted=True)
