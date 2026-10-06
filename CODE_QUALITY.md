# Code Quality Guide untuk Agent

Aturan kualitas kode untuk agent dan developer di repo ini. **Menggantikan `AGENTS_CODE_QUALITY.md`.** Urutan prioritas: instruksi pengguna saat ini > `AGENTS.md` > berkas ini. Setiap aturan bertanda `[F#]` merujuk temuan di `AUDIT_REPORT.md` yang melatarbelakanginya. Aturan yang dapat diperiksa mesin lebih diutamakan; bila ragu, berhenti dan tanyakan.

## 0. Sebelum menulis kode

1. Baca `AGENTS.md`, `PROJECT_CONTEXT.md`, Current Handoff di `WORKLOG.md`, lalu bagian yang relevan di berkas ini.
2. Cari kode yang sudah ada (fungsi, konstanta, adapter) **sebelum** menulis yang baru. Satu implementasi per konsep.
3. Tentukan lapisan perubahan: tampilan, API (router), service/logika, adapter (I/O luar). Jangan mencampur.
4. Tiru gaya modul rujukan (bagian 6), bukan modul legacy.
5. Kerjakan **satu masalah per perubahan**. Jangan refactor sambil menambah fitur.

## 1. Aturan keras jalur uang (order, posisi, akun, risiko, autopilot)

Berlaku untuk semua kode yang dapat mengirim, mengubah, atau menutup order. Pelanggaran = perubahan ditolak.

| # | Aturan | Alasan |
|---|---|---|
| M1 | **Fail-closed.** Gagal membaca akun/terminal/data berarti **menolak aksi**, bukan memakai nilai pengganti. Dilarang saldo, SL, TP, atau spread bawaan palsu | [F1][F7] |
| M2 | Pengecekan **mode akun** (hanya DEMO) ada di **satu guard** yang dipanggil sebelum **setiap** pengiriman order. Pengecualian dari guard tidak boleh ditelan | [F1] |
| M3 | **Satu jalur eksekusi.** `import MetaTrader5`, `mt5.initialize()`, dan `order_send` hanya di adapter (`src/trading_agent/adapters/mt5.py`). Router dan engine memanggil service eksekusi | [F3][F15] |
| M4 | **Stop loss wajib.** Order tanpa SL ditolak. SL/TP divalidasi terhadap sisi dan harga pasar | [F2] |
| M5 | **Volume dinormalisasi** terhadap `volume_step/min/max` simbol dan dibatasi `max_lot` dari konfigurasi. Risk engine dipanggil sebelum kirim | [F2] |
| M6 | **Idempotency.** Setiap order membawa idempotency key; permintaan ulang tidak membuat order kedua. ID/ticket tidak boleh dibuat dari `time.time()` | [F3] |
| M7 | **Mode simulasi dipilih oleh konfigurasi server atau dependency injection**, tidak pernah oleh payload klien. Kode simulasi tidak menulis ke state produksi | [F5] |
| M8 | Tidak ada `except Exception` yang menelan error di jalur uang. Catat log dan kembalikan status eksplisit (`REJECTED`, `UNKNOWN`) | [F1] |
| M9 | Data pasar diambil berdasarkan kunci **lengkap** `(simbol, interval)`. Fungsi yang meminta interval X tidak boleh memakai data interval lain | [F6] |
| M10 | Tidak ada angka ajaib di jalur uang (magic number, deviation, batas lot, ambang): konstanta bernama dari satu modul konfigurasi | [F15] |
| M11 | Perubahan jalur uang: **test lebih dulu**, perubahan sekecil mungkin, review manusia. Dilarang melonggarkan pengaman (blokir REAL/CONTEST, batas lot/rugi, SL wajib) sebagai bagian tugas lain | [F1][F2] |
| M12 | Aksi yang mengubah uang atau state hanya tersedia lewat endpoint yang dilindungi (token + validasi Host/Origin) dan layanan hanya bind ke loopback kecuali diputuskan lain | [F4] |

## 2. Standar Python

**Struktur**
- Lapisan: `router -> service -> adapter/repository`. Router hanya parse input, panggil service, petakan hasil/error ke HTTP. Service melempar **exception domain**, bukan `HTTPException`.
- Konfigurasi dari satu objek settings (mis. `pydantic-settings`); `os.getenv` tidak tersebar di dalam fungsi.
- State bersama (cache, riwayat) dibungkus kelas dengan lock dan disuntikkan lewat `Depends`; **tanpa mutable global di level modul** dan tanpa iterasi dict yang dapat dimutasi thread lain [F8].
- Waktu dan acak disuntikkan (clock/seed) pada logika yang perlu dites.

**Fungsi dan keterbacaan**
- Fungsi baru: <= 40 baris, kompleksitas <= 10, satu tanggung jawab. Early return; ekstrak tahap bernama (validasi, bangun request, kirim, simpan, respons) [F9].
- Aturan berbentuk daftar (mis. gate/validasi) ditulis sebagai **daftar aturan yang diiterasi**, bukan rantai `if` panjang.
- Tipe lengkap pada fungsi publik; model Pydantic/dataclass untuk data terstruktur, bukan `dict` bebas lintas lapisan. `Any` hanya di batas I/O dengan alasan di komentar.
- Nama menjelaskan maksud. Komentar menjelaskan **kenapa**. Docstring untuk kontrak yang tidak jelas (satuan, zona waktu, efek samping).
- Satu pernyataan per baris. Konstanta bernama untuk nilai yang punya arti.

**Error dan log**
- Pesan untuk pengguna dipisah dari detail teknis. **Dilarang** `detail=str(e)` pada respons HTTP; log detail, kirim pesan terkontrol [F13].
- Gunakan `logging` terstruktur, bukan `print`. Jangan mencatat rahasia. Satu bahasa untuk pesan ke pengguna.
- Bedakan "kosong", "gagal", dan "tidak diketahui". Jangan mengembalikan daftar kosong untuk menyatakan kegagalan baca.

**Data dan waktu**
- Waktu internal UTC dan timezone-aware (`datetime.now(timezone.utc)`, bukan `utcnow()`).
- Hanya candle tertutup untuk indikator dan keputusan. EMA 200 butuh >= 600 bar; sebelum warm-up terpenuhi, nilai ditandai belum valid.

## 3. Standar frontend (TypeScript/React)

- Komponen <= 300 baris, dipisah menjadi hook data (`react-query`), logika turunan murni, dan tampilan [F16].
- Tipe respons API didefinisikan sekali di `lib/api` per domain. Tanpa `any`/`@ts-ignore`/`as any` tanpa alasan tertulis.
- Tidak ada fetch di komponen presentasi; tidak ada angka/URL ajaib; polling (`refetchInterval`) diberi alasan dan interval bernama.
- ESLint (React hooks + TypeScript) dan Prettier otomatis; `tsc --noEmit` bersih.
- Logika grafik/overlay yang kompleks menjadi modul murni yang dapat dites.

## 4. Anti-pattern yang ditolak (contoh nyata di repo)

| Jangan | Gantikan dengan | Contoh di repo |
|---|---|---|
| `try: guard() ... except Exception: log` pada pengaman | Biarkan pengecualian naik; guard fail-closed | `ai_autopilot.start()` [F1] |
| Fallback nilai palsu | Berhenti dengan status eksplisit | saldo `587.35` [F7] |
| `sl if sl else 0.0` saat kirim order | Tolak order tanpa SL | autopilot, `trade.py` [F2] |
| Pilih mode uji dari payload | Pilih lewat konfigurasi/DI | `mode == "test"` di `trade.py` [F5] |
| Loop `break` pada kecocokan pertama dan abaikan kunci | Ambil kunci `(simbol, interval)` tepat | `_evaluate_market_and_open` [F6] |
| `order_send` di router/engine | Panggil service eksekusi | `trade.py`, `ai_autopilot.py` [F3] |
| List global sebagai database | Repository + DB; state tidak di memori | `_active_positions` [F3] |
| Satu fungsi 260 baris | Tahap bernama <= 40 baris | `submit_trade_order` [F9] |
| `detail=str(e)` | Pesan terkontrol + log | `app/api/autopilot.py` [F13] |
| Modul bernama sama dengan pustaka | Nama unik (`aurum_indicators`) | `pandas_ta.py` [F12] |
| Kode tak dipanggil dan tak dites | Hapus atau uji dan hubungkan | `signal_engine`, `ai_decision_engine` [F12] |

## 5. Protokol refactor

1. **Perilaku tetap kecuali diminta.** Tidak mengubah status HTTP, pesan, atau return tanpa test yang menyatakannya.
2. **Characterization test dulu** sebelum menyentuh kode berisiko tinggi.
3. **Strangler, bukan big-bang:** bangun jalur baru, alihkan pemanggil satu per satu, hapus yang lama setelah tidak ada pemanggil.
4. **Ratchet:** tidak boleh menambah pelanggaran lint/kompleksitas; daftar pengecualian legacy hanya boleh menyusut.
5. Commit format ulang massal **terpisah** dari perubahan logika.
6. Jangan menghapus atau melemahkan test yang gagal untuk membuat hijau. Jangan menambah dependensi tanpa alasan.
7. Laporkan metrik sebelum/sesudah (`ruff`, `radon cc`, cakupan) untuk berkas yang disentuh.
8. Konflik antara aturan, dokumen, dan kode (mis. mode PAPER) **tidak diputuskan agent**; catat di `WORKLOG.md` dan tanyakan.

## 6. Peta modul

**Tiru pola** (ID hash, penulisan atomik, validasi masukan, state machine), **bukan ukuran fungsinya:** `app/lab/datasets.py`, `src/trading_agent/{execution,reconciliation,storage}.py`, `src/trading_agent/lab_indicators.py`.
**Jangan tiru, dan sentuh seminimal mungkin:** `app/api/trade.py`, `app/engines/ai_autopilot.py`, `app/api/finance.py`, `app/api/endpoints.py` (state global), `scratch_test*.py`.
**Pecah bila disentuh (kompleksitas tinggi):** `get_finance_overview` (F 54), `run_research_backtest` (F 50), `ui/app.py::main` (E 32), `BacktestEngine.run_backtest` (D 29).
**Status belum dipakai (jangan dikembangkan sebelum diputuskan):** `signal_engine`, `ai_decision_engine`, `confluence_engine`.

## 7. Tooling baseline

`pyproject.toml` (konfigurasi sudah dijalankan pada repo ini; `E501` diabaikan karena penataan baris diserahkan ke `ruff format`):

```toml
[tool.ruff]
line-length = 100
target-version = "py311"
extend-exclude = ["frontend", "lab-data"]

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "SIM", "C90", "RET"]
ignore = ["E501", "B008"]   # B008: Depends() sebagai default argumen itu idiomatik di FastAPI

[tool.ruff.lint.mccabe]
max-complexity = 10

[tool.ruff.lint.per-file-ignores]
# Legacy: hanya boleh menyusut. Hapus entri begitu berkas dirapikan.
"app/api/trade.py" = ["C901"]
"app/api/endpoints.py" = ["C901"]
"app/api/finance.py" = ["C901"]
"app/engines/ai_autopilot.py" = ["C901"]
"app/lab/service.py" = ["C901"]
"app/lab/datasets.py" = ["C901"]
"src/trading_agent/backtest.py" = ["C901"]
"src/trading_agent/risk.py" = ["C901"]
"src/trading_agent/lab_rules.py" = ["C901"]
"src/trading_agent/brokers/paper.py" = ["C901"]
"src/trading_agent/ui/app.py" = ["C901"]
```

**Test arsitektur** (`tests/test_architecture.py`): menegakkan M3. Daftar `LEGACY` hanya boleh menyusut; test gagal bila ada pelanggar baru.

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ADAPTER = {"src/trading_agent/adapters/mt5.py"}
LEGACY = {"app/api/trade.py", "app/engines/ai_autopilot.py"}  # hapus saat dimigrasikan (F3)


def test_order_send_only_in_adapter():
    offenders = {
        path.relative_to(ROOT).as_posix()
        for base in ("app", "src")
        for path in (ROOT / base).rglob("*.py")
        if "order_send(" in path.read_text(encoding="utf-8")
    }
    assert offenders <= ADAPTER | LEGACY, f"order_send di luar adapter: {sorted(offenders - ADAPTER - LEGACY)}"
```

Catatan: radon (lebih ketat, menghitung operator boolean) melaporkan 37 entri >= 11, sedangkan `C901` ruff melaporkan 14. Pakai radon untuk laporan metrik dan ruff sebagai gerbang.

**CI minimal** (setiap push): `ruff check`, `ruff format --check`, `pyright`, `pytest --cov`, `pip-audit`; frontend: `tsc --noEmit`, ESLint, Prettier check, build. CI mencegah pelanggaran baru; ia tidak menggantikan review manusia.

**Ambang cakupan (ratchet):** jalur uang (`trade`, adapter MT5, autopilot, execution) menuju >= 80%; cakupan total tidak boleh turun dari baseline 58%.

## 8. Definition of done

- `ruff check` dan `ruff format --check` bersih pada berkas yang diubah; `pyright` dan `tsc --noEmit` tidak menambah error.
- Test baru/diperbarui untuk perilaku yang disentuh; seluruh test lulus dengan dependensi terkunci. Laporkan perintah dan hasil aktual.
- Tidak ada fungsi baru dengan kompleksitas > 10 atau > 40 baris; tidak ada pelanggaran lint baru; cakupan berkas yang disentuh tidak turun.
- Perubahan jalur uang memenuhi M1-M12; test arsitektur lulus.
- Tidak ada `.pyc`, `.db`, `.env`, atau rahasia yang ikut berubah.
- Perilaku eksternal (HTTP, format data, pesan penting) tidak berubah tanpa disebutkan dan dites.
- `WORKLOG.md` diperbarui; laporan memuat metrik sebelum/sesudah, keterbatasan, dan hal yang **tidak** diverifikasi. Jangan menyatakan "selesai" atau "teruji" bila belum dijalankan; pengujian dengan modul MT5 palsu tidak membuktikan integrasi terminal asli.

## 9. Larangan untuk agent

- Jangan mengubah `AGENTS.md`, aturan keselamatan, atau mode akun tanpa instruksi eksplisit pemilik.
- Jangan menyalakan autopilot/worker, ARM, atau mengirim order saat menguji; gunakan adapter palsu.
- Jangan stage, commit, push, atau membuat repository kecuali diminta.
- Jangan menambah fitur sambil membersihkan, dan jangan membersihkan di luar lingkup tugas.
- Jangan memilih sendiri saat aturan, dokumen, dan kode bertentangan: berhenti dan tanyakan.
