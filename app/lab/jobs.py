"""Bounded local research worker. Durable records; restart marks unfinished work interrupted."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib

from app.db.session import SessionLocal
from app.lab.models import LabRun
from app.lab.datasets import load_dataset
from trading_agent.backtest import run_research_backtest

POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix='lab-research')


def code_version():
    root = Path(__file__).resolve().parents[2]
    files = [root/'src/trading_agent'/name for name in
             ('backtest.py', 'models.py', 'indicators.py', 'lab_indicators.py', 'lab_rules.py', 'boswaves.py')]
    return hashlib.sha256(b''.join(p.read_bytes() for p in files)).hexdigest()


def recover(db):
    db.query(LabRun).filter(LabRun.status.in_(['running', 'queued'])).update(
        {'status': 'interrupted', 'error': 'API restart sebelum run selesai. Buat run baru untuk mengulang.'}, synchronize_session=False)
    db.commit()


def execute(run_id):
    with SessionLocal() as db:
        run = db.get(LabRun, run_id)
        if not run or run.cancel_requested:
            if run:
                run.status = 'cancelled'; db.commit()
            return
        run.status = 'running'; db.commit()
        snapshot = run.snapshot
    def progress(value):
        with SessionLocal() as db:
            run = db.get(LabRun, run_id)
            if run.cancel_requested:
                return False
            run.progress = value; db.commit()
            return True
    try:
        frame = load_dataset(snapshot['dataset'])
        result = run_research_backtest(frame, snapshot['strategy'], snapshot['settings'], progress)
        with SessionLocal() as db:
            run = db.get(LabRun, run_id)
            run.result = result
            run.status = 'cancelled' if run.cancel_requested else result['status']
            run.progress = 100
            db.commit()
    except Exception as exc:
        with SessionLocal() as db:
            run = db.get(LabRun, run_id)
            run.status = 'failed'
            run.error = str(exc)[:250] if isinstance(exc, ValueError) else 'Run gagal membaca/mengolah dataset. Periksa penyimpanan dataset.'
            db.commit()
