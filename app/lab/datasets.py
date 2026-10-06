"""Immutable compressed NumPy snapshots; repeated imports merge by candle time."""
import hashlib
import io
import json
import os
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, cast

import numpy as np
import pandas as pd

SECONDS = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400}
ROOT = Path(os.getenv('LAB_DATA_DIR', str(Path(__file__).resolve().parent.parent.parent / "lab-data")))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def parse_csv(text, interval, as_of=None):
    raw = pd.read_csv(io.StringIO(text))
    if not isinstance(raw, pd.DataFrame):
        raise ValueError('CSV tidak valid.')
    columns = ['time', 'open', 'high', 'low', 'close', 'volume']
    if not set(columns).issubset(raw.columns) or len(raw) > 200000:
        raise ValueError('CSV memerlukan time,open,high,low,close,volume; maksimal 200.000 baris.')
    frame = raw[columns].copy()
    time_series = pd.Series(frame['time'])
    if pd.api.types.is_numeric_dtype(time_series):
        times = cast(pd.Series, pd.to_numeric(time_series, errors='raise'))
        if not np.isfinite(times.to_numpy()).all() or bool(np.any(times % 1 != 0)):
            raise ValueError('Timestamp harus integer milidetik UTC.')
        frame['time'] = times.astype('int64')
    else:
        if not time_series.astype(str).str.contains(r'(?:Z|[+-]00:00)$', regex=True).all():
            raise ValueError('Timestamp teks wajib UTC eksplisit (Z atau +00:00).')
        dt_series = cast(pd.Series, pd.to_datetime(time_series, utc=True, format='mixed'))
        frame['time'] = dt_series.astype('int64') // 1000000
    for key in columns[1:]:
        col_series = cast(pd.Series, pd.to_numeric(frame[key], errors='raise'))
        frame[key] = col_series.astype(float)
    if not np.isfinite(frame.to_numpy()).all():
        raise ValueError('Data NaN/Infinity tidak diizinkan.')
    max_oc = np.maximum(frame['open'], frame['close'])
    min_oc = np.minimum(frame['open'], frame['close'])
    if (bool(np.any(frame['low'] <= 0)) or bool(np.any(frame['volume'] < 0)) or bool(np.any(frame['high'] < frame['low']))
        or bool(np.any(frame['high'] < max_oc))
        or bool(np.any(frame['low'] > min_oc))):
        raise ValueError('OHLC atau volume tidak konsisten.')
    step = SECONDS[interval]*1000
    if bool(np.any(frame['time'] < 946684800000)) or bool(np.any(frame['time'] % step != 0)):
        raise ValueError('Waktu candle tidak sejajar interval UTC atau di luar rentang.')
    cutoff = int((as_of or datetime.now(timezone.utc)).timestamp()*1000)
    if bool(np.any(frame['time'] > cutoff)):
        raise ValueError('Candle masa depan ditolak.')
    dropped_open = int(np.sum(frame['time'] + step > cutoff))
    duplicates = int(np.sum(pd.Series(frame['time']).duplicated()))
    mask = frame['time'] + step <= cutoff
    filtered = cast(pd.DataFrame, frame.loc[mask])
    frame = filtered.drop_duplicates(subset=['time'], keep='last').sort_values('time').reset_index(drop=True)
    if len(frame) < 2:
        raise ValueError('Minimal dua candle tertutup diperlukan.')
    return frame, {'duplicates_replaced': duplicates, 'open_bars_removed': dropped_open}


def save_dataset(frame, identity, quality=None):
    ROOT.mkdir(parents=True, exist_ok=True)
    checksum = hashlib.sha256(frame.to_csv(index=False, float_format='%.17g').encode()).hexdigest()
    meta = {**identity, 'start': int(frame.time.iloc[0]), 'end': int(frame.time.iloc[-1]),
            'rows': len(frame), 'checksum': checksum, 'format_version': 1}
    dataset_id = digest(meta)
    path = ROOT / f'{dataset_id}.npz'
    if not path.exists():
        fd, name = tempfile.mkstemp(dir=ROOT, suffix='.tmp')
        os.close(fd)
        try:
            with open(name, 'wb') as target:
                np.savez_compressed(target, **{
                    column: frame[column].to_numpy(dtype='int64' if column == 'time' else 'float64')
                    for column in ('time', 'open', 'high', 'low', 'close', 'volume')
                })
            os.replace(name, path)
        finally:
            if os.path.exists(name):
                os.unlink(name)
    step = SECONDS[identity['interval']]*1000
    deltas = frame.time.diff().dropna()
    return {**meta, 'dataset_id': dataset_id, 'gap_count': int((deltas > step).sum()),
            'gap_note': 'Jeda termasuk sesi tutup/weekend; bukan bukti seluruh jeda adalah data hilang.',
            'quality': quality or {}, 'timezone': 'UTC', 'storage': 'npz'}


def load_dataset(spec):
    key = spec['dataset_id']
    if len(key) != 64 or any(c not in '0123456789abcdef' for c in key):
        raise ValueError('Dataset ID tidak valid.')
    path = ROOT / f'{key}.npz'
    if not path.is_file():
        raise ValueError('Berkas dataset tidak ditemukan.')
    with np.load(path, allow_pickle=False) as source:
        required = ('time', 'open', 'high', 'low', 'close', 'volume')
        if set(source.files) != set(required):
            raise ValueError('Format dataset tidak valid.')
        lengths = {len(source[column]) for column in required}
        if len(lengths) != 1:
            raise ValueError('Kolom dataset tidak konsisten.')
        frame = pd.DataFrame({column: source[column] for column in required})
    checksum = hashlib.sha256(frame.to_csv(index=False, float_format='%.17g').encode()).hexdigest()
    if checksum != spec['checksum']:
        raise ValueError('Checksum dataset berubah; backtest ditolak.')
    return frame


def resample(frame, interval):
    step = SECONDS[interval]*1000
    work = frame.copy()
    work['bucket'] = work.time//step*step
    groups = work.groupby('bucket', sort=True)
    values = groups.agg(time=('time', 'min'), open=('open', 'first'), high=('high', 'max'),
                        low=('low', 'min'), close=('close', 'last'), volume=('volume', 'sum'), count=('time', 'size'))
    # Require a complete consecutive M1 bucket. Never synthesize missing bars.
    values = values[(values['count'] == SECONDS[interval]//60) & (values.time == values.index)]
    return values.drop(columns='count').reset_index(drop=True)
