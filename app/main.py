import time
from contextlib import asynccontextmanager
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from app.api.endpoints import router as api_router
from app.api.account import router as account_router
from app.api.diagnostics import router as diagnostics_router
from app.api.lab import router as lab_router
from app.api.trade import router as trade_router
from app.api.autopilot import router as autopilot_router
from app.api.finance import router as finance_router
from app.lab import jobs as lab_jobs
from app.db.session import SessionLocal
from app.diagnostics import DiagnosticMiddleware, record
from app.core.config import settings
from app.db.session import Base, engine
from app.models.trading import TradeRecord  # noqa: F401

STATIC_DIR = Path(__file__).parent / "static"
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    for attempt in range(1, 31):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except OperationalError:
            if attempt == 30:
                raise
            time.sleep(1)
    record('INFO', 'system', 'API siap menerima request')
    with SessionLocal() as db:
        lab_jobs.recover(db)
    yield


app = FastAPI(title="AI Trading System API", version="1.0.0", lifespan=lifespan)
app.add_middleware(DiagnosticMiddleware)


@app.exception_handler(StarletteHTTPException)
async def diagnostic_http_error(request: Request, exc: StarletteHTTPException):
    # Classify known failures without copying exception messages or payload values.
    detail = exc.detail.lower() if isinstance(exc.detail, str) else str(exc.detail).lower()
    if 'belum ada data akun' in detail:
        reason = 'Akun belum diterima dari EA. Compile/pasang EA v1.3 dan periksa URL WebRequest.'
    elif 'no mt5 candles' in detail:
        reason = 'Candle belum diterima dari EA untuk instrumen/timeframe yang diminta.'
    elif 'currently arriving' in detail:
        reason = 'Timeframe yang diminta belum tersedia di cache. Periksa daftar timeframe dan usia data.'
    elif 'stale' in detail or 'kedaluwarsa' in detail:
        reason = 'Data kedaluwarsa atau jam terminal tidak sesuai. Periksa timer EA dan sinkronisasi waktu.'
    elif 'terputus' in detail:
        reason = 'Terminal melaporkan koneksi terputus.'
    elif 'bridge' in detail:
        reason = 'Bridge upstream gagal dihubungi atau responsnya tidak valid.'
    else:
        reason = 'Request ditolak oleh API; periksa parameter dan status layanan.'
    request.state.diagnostic_reason = reason
    if exc.__cause__ is not None:
        request.state.diagnostic_upstream = type(exc.__cause__).__name__
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def diagnostic_validation_error(request: Request, exc: RequestValidationError):
    # Log field names/types only. Never log validation input (contains account data).
    safe_fields = {'login', 'name', 'company', 'server', 'currency', 'trade_mode', 'leverage',
                   'balance', 'equity', 'profit', 'credit', 'margin', 'margin_free', 'margin_level',
                   'positions_count', 'connected', 'updated_at', 'symbol', 'interval'}
    fields = sorted({str(part) for error in exc.errors() for part in error['loc'] if part in safe_fields})
    request.state.diagnostic_reason = 'Payload tidak valid. Periksa field: ' + (', '.join(fields) or 'format request')
    return await request_validation_exception_handler(request, exc)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
if FRONTEND_DIR.is_dir():
    app.mount("/workspace", StaticFiles(directory=FRONTEND_DIR, html=True), name="workspace")


@app.get("/", include_in_schema=False)
def dashboard():
    if (FRONTEND_DIR / "index.html").is_file():
        return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-store"})
    return FileResponse(STATIC_DIR / "dashboard.html", headers={"Cache-Control": "no-store"})


@app.get("/health")
def health():
    return {"status": "ok", "message": "AI Trading System API is running.", "config_loaded": bool(settings)}


app.include_router(api_router, prefix="/api")
app.include_router(account_router, prefix="/api")
app.include_router(diagnostics_router, prefix="/api")
app.include_router(lab_router, prefix="/api")
app.include_router(trade_router, prefix="/api")
app.include_router(autopilot_router, prefix="/api")
app.include_router(finance_router, prefix="/api")

