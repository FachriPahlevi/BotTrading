import os
from datetime import datetime, timezone

from fastapi import APIRouter, Response

from app import diagnostics
from app.api import account, endpoints

router = APIRouter()


@router.get('/diagnostics')
def get_diagnostics(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    now = datetime.now(timezone.utc)
    python_bridge = bool(os.getenv('MT5_BRIDGE_URL'))
    account_age = (now-account.account_cache.updated_at).total_seconds() if account.account_cache else None
    markets = []
    # Copy keys to avoid iteration errors when the ingest thread adds a market.
    for (symbol, interval), entry in list(endpoints.market_cache.items()):
        age = now.timestamp() - entry['timestamp_received']
        markets.append(dict(symbol=symbol, interval=interval, age_seconds=round(age, 1),
                            fresh=0 <= age <= 60))
    if python_bridge:
        explanation = 'API membaca bridge Python. Lihat hasil request akun/chart untuk status koneksi upstream.'
    elif not markets and account_age is None:
        explanation = 'Belum ada data EA diterima sejak API dimulai. Periksa EA terpasang, URL API dan izin WebRequest di MT5.'
    elif account_age is None:
        explanation = 'Cache candle tersedia, tetapi data akun belum diterima. Periksa usia candle; gunakan EA v1.3 untuk mengirim akun dan semua timeframe.'
    else:
        explanation = 'Kiriman EA sudah tercatat. Periksa usia data akun dan setiap timeframe; cache lama tidak berarti koneksi masih aktif.'
    return {**diagnostics.snapshot(), 'generated_at': now.isoformat(),
            'connection': dict(mode='PYTHON_BRIDGE' if python_bridge else 'EA_PUSH',
                               account_age_seconds=round(account_age, 1) if account_age is not None else None,
                               account_fresh=account_age is not None and -10 <= account_age <= 60,
                               markets=markets, explanation=explanation)}
