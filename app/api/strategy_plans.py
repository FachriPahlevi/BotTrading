import json
import uuid
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.trading import StrategyPlanRecord

router = APIRouter(prefix="/strategy-plans", tags=["strategy-plans"])


class StrategyPlanPayload(BaseModel):
    id: str | None = None
    title: str = Field(..., max_length=150)
    symbol: str = Field(..., max_length=20)
    interval: str = Field("1d", max_length=10)
    bias: str = Field("BEARISH", max_length=20)
    status: str = Field("active", max_length=20)
    payload: dict[str, Any]


def get_default_xauusd_strategy_payload() -> dict[str, Any]:
    """Default high-conviction deep analysis strategy plan matching the reference HTML/PDF."""
    candles_sample = [
        ["7 Sep", 4427.79, 4436.03, 4381.08, 4405.07],
        ["8 Sep", 4406.55, 4443.10, 4346.07, 4355.65],
        ["9 Sep", 4360.40, 4434.18, 4341.44, 4401.55],
        ["10 Sep", 4404.82, 4433.00, 4313.71, 4317.30],
        ["11 Sep", 4319.31, 4402.70, 4295.55, 4348.72],
        ["14 Sep", 4332.70, 4355.65, 4253.30, 4298.80],
        ["15 Sep", 4299.35, 4318.08, 4261.39, 4294.00],
        ["16 Sep", 4294.50, 4368.04, 4235.08, 4263.50],
        ["17 Sep", 4263.97, 4382.63, 4257.55, 4341.30],
        ["18 Sep", 4342.73, 4399.77, 4334.34, 4378.17],
        ["21 Sep", 4383.44, 4387.51, 4322.63, 4343.56],
        ["22 Sep", 4343.57, 4378.25, 4291.42, 4355.48],
        ["23 Sep", 4357.02, 4371.45, 4274.73, 4287.51],
        ["24 Sep", 4287.38, 4304.95, 4244.63, 4278.52],
        ["25 Sep", 4279.12, 4316.81, 4254.45, 4287.25],
        ["28 Sep", 4277.90, 4280.56, 4110.95, 4115.27],
        ["29 Sep", 4113.87, 4185.42, 4113.57, 4182.80],
        ["30 Sep", 4182.80, 4219.46, 4147.47, 4157.34],
        ["1 Okt", 4157.35, 4193.03, 4139.29, 4178.86],
        ["2 Okt", 4175.31, 4225.62, 4125.25, 4142.96],
        ["4 Okt", 4141.79, 4148.39, 4132.83, 4142.70],
        ["5 Okt", 4144.15, 4170.51, 4122.90, 4134.47],
        ["6 Okt", 4134.39, 4152.29, 4103.70, 4131.97],
    ]

    plans = [
        {
            "id": "plan_a",
            "name": "A. Sell retest (utama)",
            "direction": "SELL",
            "trigger": "Tunggu penolakan candle H1/H4 di zona 4.200–4.230",
            "entry": 4215.0,
            "stop_loss": 4265.0,
            "take_profit_1": 4110.0,
            "take_profit_2": 4000.0,
            "take_profit_3": 3950.0,
            "rr_ratio": "1 : 2.1 / 4.3 / 5.3",
            "is_main": True,
            "notes": "Skenario utama sell on rally saat harga retest neckline Head & Shoulders.",
            "price_path": [
                [22, 4132],
                [23.3, 4215],
                [24.8, 4170],
                [25.5, 4210],
                [27, 4110],
                [29, 4000],
                [30.5, 3950],
            ],
            "path_labels": [
                {"step": 1, "text": "1. Retest", "x_idx": 23.3, "y": 4215},
                {"step": 2, "text": "2. Breakdown", "x_idx": 27.0, "y": 4110},
            ],
        },
        {
            "id": "plan_b",
            "name": "B. Sell breakdown",
            "direction": "SELL",
            "trigger": "Close H4 di bawah 4.098",
            "entry": 4095.0,
            "stop_loss": 4150.0,
            "take_profit_1": 4000.0,
            "take_profit_2": 3950.0,
            "take_profit_3": 3900.0,
            "rr_ratio": "1 : 1.7 / 2.6 / 3.5",
            "is_main": False,
            "notes": "Entri momentum sell saat support valid 4.098 tertembus ke bawah.",
            "price_path": [
                [22, 4132],
                [23.5, 4105],
                [25, 4095],
                [27, 4000],
                [29, 3950],
                [30.5, 3900],
            ],
            "path_labels": [
                {"step": 1, "text": "1. Break 4.098", "x_idx": 25.0, "y": 4095},
                {"step": 2, "text": "2. Run to TP", "x_idx": 29.0, "y": 3950},
            ],
        },
        {
            "id": "plan_c",
            "name": "C. Buy bounce (counter-trend, risiko tinggi)",
            "direction": "BUY",
            "trigger": "Hanya jika ada candle reversal jelas di 4.100–4.110",
            "entry": 4115.0,
            "stop_loss": 4070.0,
            "take_profit_1": 4175.0,
            "take_profit_2": 4230.0,
            "take_profit_3": 4265.0,
            "rr_ratio": "1 : 1.3 / 2.6",
            "is_main": False,
            "notes": "Counter-trend buy memanfaatkan rejection ekor panjang di zona support.",
            "price_path": [
                [22, 4132],
                [23, 4105],
                [24, 4115],
                [26, 4175],
                [28, 4230],
            ],
            "path_labels": [
                {"step": 1, "text": "1. Reversal wick", "x_idx": 23.0, "y": 4105},
                {"step": 2, "text": "2. Bounce to 4.230", "x_idx": 28.0, "y": 4230},
            ],
        },
        {
            "id": "plan_d",
            "name": "D. Buy breakout",
            "direction": "BUY",
            "trigger": "Close harian di atas 4.240",
            "entry": 4250.0,
            "stop_loss": 4190.0,
            "take_profit_1": 4315.0,
            "take_profit_2": 4440.0,
            "take_profit_3": 4500.0,
            "rr_ratio": "1 : 1.1 / 3.2",
            "is_main": False,
            "notes": "Pembatalan struktur bearish jika buyers mampu menutup candle harian di atas neckline.",
            "price_path": [
                [22, 4132],
                [24, 4235],
                [25.5, 4250],
                [27.5, 4315],
                [30, 4440],
            ],
            "path_labels": [
                {"step": 1, "text": "1. Close > 4.240", "x_idx": 25.5, "y": 4250},
                {"step": 2, "text": "2. Target 4.440", "x_idx": 30.0, "y": 4440},
            ],
        },
    ]

    return {
        "title": "XAUUSD – Analisis Mendalam & Skenario H&S",
        "symbol": "XAUUSD",
        "interval": "1d",
        "date_str": "Snapshot Selasa, 6 Oktober 2026 (sesi Asia/London awal). Data harian OHLC dari Investing.com.",
        "last_price": 4132.0,
        "bias": "BEARISH",
        "confidence": 84,
        "key_resistance": "4.230",
        "key_support": "4.100–4.110",
        "record_change": "−26% dari rekor 5.595 (29 Jan)",
        "conclusion": (
            "Emas dalam tren turun dan berkonsolidasi tepat di atas support 4.100–4.110. "
            "Harga gagal merebut kembali neckline 4.230, dan lingkungan makro (Fed hawkish, "
            "yield 10 tahun di atas 5,3%, dolar di level tertinggi sekitar 17 bulan) masih menekan. "
            "Skenario utama: sell on rally di area 4.200–4.230, atau sell saat breakdown valid "
            "di bawah 4.098. Skenario alternatif bullish baru valid jika harian close di atas 4.240."
        ),
        "fundamental": [
            "Fed hawkish. Di bawah Ketua Kevin Warsh, Fed menaikkan suku bunga 25 bps pada 16 Sep dan memberi sinyal pengetatan lanjutan. Emas tidak memberi imbal hasil, jadi suku bunga riil tinggi adalah beban terbesar.",
            "NFP lemah (2 Okt) menurunkan peluang kenaikan di Oktober menjadi sekitar 20% (dari 30% seminggu sebelumnya), tetapi peluang kenaikan Desember hampir tidak berubah. Efeknya: emas sempat memantul, lalu tertahan.",
            "Yield & dolar. US10Y sekitar 5,32%, US30Y 5,68%, DXY sekitar 102. Aksi jual obligasi global dan krisis utang Prancis mendorong dolar sebagai safe haven, bukan emas.",
            "Energi & inflasi. Brent sekitar 100 USD memperkuat inflasi, sehingga Fed sulit melonggarkan. Secara teori ini mendukung emas, tetapi saat ini efek suku bunga lebih dominan.",
            "Risiko pembalik (bullish): kekhawatiran fiskal AS / premi term yang tinggi bisa melemahkan dolar bersamaan dengan obligasi, geopolitik Iran, pembelian bank sentral, dan CPI 14 Okt yang lebih lunak dari perkiraan.",
        ],
        "technical": [
            "Struktur: lower high berurutan sejak 4.443 (8 Sep) → 4.399 (18 Sep) → 4.316 (25 Sep) → 4.225 (2 Okt). Harga di bawah EMA 10, dan di bawah neckline Head & Shoulders 4.230 yang disebut FXStreet.",
            "28 Sep: candle bearish besar (open 4.278 → close 4.115, sekitar −4%). Ini candle breakdown yang menembus support 4.250 dan membuat low 4.111.",
            "29 Sep: rebound +1,6% ke 4.185 = retest bawah zona yang gagal.",
            "2 Okt: candle dengan upper wick panjang (high 4.226, close 4.143) di neckline, mirip shooting star. Penolakan jelas di resistance.",
            "5–6 Okt: body kecil (spinning top/doji) di dekat 4.104–4.110. Pasar ragu di support; bullish divergence di H4 (RSI/MACD) ada tetapi lemah.",
            "Fibonacci: pivot dan retracement (Barchart) menunjukkan 4.143 sebagai support pivot, yang kini sudah tertembus tipis.",
            "Target turun: 4.000 (psikologis, low akhir Juli), lalu 3.950 (low tahun ini, sekitar 3.945 pada 30 Jun).",
        ],
        "volume": (
            "XAUUSD spot tidak punya volume terpusat; yang tersedia hanya tick volume broker, "
            "dan saya tidak mendapatkan seri yang andal untuk periode ini. Sebagai pengganti, "
            "saya memakai ekspansi range: candle 28 Sep punya range terbesar (sekitar 170 poin) "
            "yang menandakan partisipasi besar pada breakdown, sedangkan range 5–6 Okt menyempit "
            "(sekitar 50 poin) = momentum mereda. Untuk konfirmasi, buka futures COMEX GC1! di "
            "TradingView dan pasang Volume Profile. Perhatikan apakah volume naik saat harga menembus "
            "4.100 (breakdown valid) atau saat menolak 4.230."
        ),
        "seasonality_and_timing": {
            "seasonality": (
                "Secara historis emas cenderung kuat dari Agustus hingga Februari (permintaan fisik "
                "menjelang Diwali, pernikahan India, dan Tahun Baru Imlek), dengan September sering "
                "menjadi bulan terkuat. Oktober cenderung campuran. Tahun ini faktor makro mengalahkan "
                "pola musiman: September justru turun tajam."
            ),
            "trading_hours_wib": (
                "London buka sekitar 14.00, rilis data AS 19.30, NY buka sekitar 20.30. Volatilitas "
                "tertinggi biasanya 19.30–23.30 WIB. Sesi Asia (sekarang) cenderung sempit, jadi breakout "
                "di jam ini rawan palsu."
            ),
            "economic_calendar": (
                "Kalender penting: notulen FOMC 7 Okt (sekitar 01.00 WIB 8 Okt), CPI 14 Okt, "
                "retail sales & PPI 15 Okt, FOMC 27–28 Okt (keputusan 29 Okt sekitar 01.00 WIB), "
                "PCE 29 Okt. Hindari entri baru 15 menit sebelum dan sesudah rilis."
            ),
        },
        "plans": plans,
        "invalidation": (
            "Invalidasi bias bearish: close harian di atas 4.265–4.315. Risiko per trade sebaiknya "
            "1% modal atau kurang. Geser SL ke break-even setelah TP1 tercapai, dan tutup sebagian "
            "posisi di tiap TP."
        ),
        "disclaimer": (
            "Angka level adalah interpretasi dari data harian; feed broker Anda bisa berbeda "
            "5–15 poin. Cek ulang di TradingView sebelum eksekusi. Ini analisis edukatif, bukan nasihat investasi."
        ),
        "visual_data": {
            "zones": [
                {
                    "label": "Resistance / neckline H&S 4.230–4.265",
                    "high": 4265.0,
                    "low": 4230.0,
                    "start_idx": 7,
                    "color": "#ef5350",
                    "opacity": 0.18,
                },
                {
                    "label": "Support 4.098–4.111",
                    "high": 4111.0,
                    "low": 4098.0,
                    "start_idx": 15,
                    "color": "#26a69a",
                    "opacity": 0.20,
                },
            ],
            "horizontal_levels": [
                {"price": 4315.0, "label": "R 4.315 (high 25 Sep)", "color": "#ef5350", "style": "dashed"},
                {"price": 4440.0, "label": "R 4.440 (high 8 Sep)", "color": "#ef5350", "style": "dashed"},
                {"price": 4000.0, "label": "S 4.000 (psikologis)", "color": "#26a69a", "style": "dashed"},
                {"price": 3950.0, "label": "S 3.950 (low tahun ini)", "color": "#26a69a", "style": "dashed"},
            ],
            "pattern_labels": [
                {"x_idx": 8, "y": 4375, "text": "Lower highs →", "color": "#d1d4dc"},
                {"x_idx": 15, "y": 4144, "text": "28 Sep: −4% breakdown", "color": "#ef5350"},
                {"x_idx": 19, "y": 4218, "text": "Penolakan 4.226", "color": "#ef5350"},
                {"x_idx": 21, "y": 4138, "text": "Doji di support", "color": "#d1d4dc"},
            ],
            "candles_sample": candles_sample,
        },
    }


def seed_default_plans_if_needed(db: Session):
    existing = db.query(StrategyPlanRecord).first()
    if not existing:
        default_payload = get_default_xauusd_strategy_payload()
        rec = StrategyPlanRecord(
            id="plan-xauusd-hs-retest",
            title=default_payload["title"],
            symbol=default_payload["symbol"],
            interval=default_payload["interval"],
            bias=default_payload["bias"],
            status="active",
            payload=json.dumps(default_payload),
        )
        db.add(rec)
        db.commit()


@router.get("")
def list_strategy_plans(db: Session = Depends(get_db)):
    seed_default_plans_if_needed(db)
    records = db.query(StrategyPlanRecord).order_by(StrategyPlanRecord.created_at.desc()).all()
    results = []
    for r in records:
        try:
            parsed_payload = json.loads(r.payload)
        except Exception:
            parsed_payload = {}
        results.append({
            "id": r.id,
            "title": r.title,
            "symbol": r.symbol,
            "interval": r.interval,
            "bias": r.bias,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            "payload": parsed_payload,
        })
    return results


@router.post("")
def create_strategy_plan(data: StrategyPlanPayload, db: Session = Depends(get_db)):
    plan_id = data.id or f"plan-{uuid.uuid4().hex[:10]}"
    payload_dict = data.payload or {}
    if "title" not in payload_dict:
        payload_dict["title"] = data.title
    if "symbol" not in payload_dict:
        payload_dict["symbol"] = data.symbol
    if "interval" not in payload_dict:
        payload_dict["interval"] = data.interval
    if "bias" not in payload_dict:
        payload_dict["bias"] = data.bias

    record = db.query(StrategyPlanRecord).filter(StrategyPlanRecord.id == plan_id).first()
    if record:
        record.title = data.title
        record.symbol = data.symbol
        record.interval = data.interval
        record.bias = data.bias
        record.status = data.status
        record.payload = json.dumps(payload_dict)
    else:
        record = StrategyPlanRecord(
            id=plan_id,
            title=data.title,
            symbol=data.symbol,
            interval=data.interval,
            bias=data.bias,
            status=data.status,
            payload=json.dumps(payload_dict),
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return {
        "id": record.id,
        "title": record.title,
        "symbol": record.symbol,
        "interval": record.interval,
        "bias": record.bias,
        "status": record.status,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        "payload": payload_dict,
    }


@router.get("/{plan_id}")
def get_strategy_plan(plan_id: str, db: Session = Depends(get_db)):
    record = db.query(StrategyPlanRecord).filter(StrategyPlanRecord.id == plan_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Strategy plan tidak ditemukan")
    return {
        "id": record.id,
        "title": record.title,
        "symbol": record.symbol,
        "interval": record.interval,
        "bias": record.bias,
        "status": record.status,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        "payload": json.loads(record.payload),
    }


@router.delete("/{plan_id}")
def delete_strategy_plan(plan_id: str, db: Session = Depends(get_db)):
    record = db.query(StrategyPlanRecord).filter(StrategyPlanRecord.id == plan_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Strategy plan tidak ditemukan")
    db.delete(record)
    db.commit()
    return {"status": "ok", "message": f"Strategy plan {plan_id} berhasil dihapus"}
