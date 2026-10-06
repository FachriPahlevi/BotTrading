# AI Trading Project Context

Tanggal peninjauan awal: 2026-10-03. Dokumen ini mencatat kode yang diperiksa; status runtime harus diverifikasi secara terpisah.

## Tujuan dan status

- Tujuan produk: platform analisis AI dengan kartu sinyal dan chart live beranotasi, scanner multi-timeframe/lintas pasar, profil modal/risiko, serta eksekusi manual atau otomatis. Rincian kebutuhan dan acceptance criteria berada di `IMPROVEMENT_PLAN.md`; fitur ini masih target, bukan kondisi implementasi saat ini.
- Pengguna melaporkan koneksi MT5 sudah berhasil. Sesi dokumentasi ini tidak menguji ulang terminal atau mengirim order.
- Terdapat dua jalur aplikasi yang belum menyatu. Jangan menganggap chart yang menerima data berarti worker trading dan dashboard menggunakan state yang sama.
- Pengguna telah mengonfirmasi broker **Exness Ltd**. Label lama bridge/TDS masih menyebut HFM; perlu diselaraskan saat implementasi. Server, jenis akun, symbol/suffix, dan metode bridge aktif belum diverifikasi; baca metadata terminal, bukan label tetap.
- Folder kerja belum merupakan repository Git pada saat pemeriksaan.

## Peta implementasi

| Area | Lokasi | Perilaku yang ditemukan |
| --- | --- | --- |
| Web/API | `app/main.py`, `app/api/endpoints.py` | FastAPI, REST API, static dashboard |
| Dashboard utama | `frontend/` | React/TypeScript/Vite, Tailwind v4, shadcn/ui Base UI, TanStack Query, KLineChart; chart polling 15 detik |
| Dashboard lama | `app/static/` | Dipertahankan sebagai fallback jika frontend belum dibuild; bukan sumber fitur baru |
| Engine analisis web | `app/engines/` | Regime, confluence, decision, risk, calibration; beberapa bagian masih placeholder |
| Database web | `app/db/`, `app/models/` | SQLAlchemy dan PostgreSQL |
| Bridge EA | `AurumMarketBridge.mq5` | v2.0: Initial Sync 800 candle per timeframe saat aktif, lalu Incremental Sync 2 candle terbaru setiap 15 detik; bukan pelaksana order |
| Bridge Python | `mt5_bridge.py` | FastAPI pada mesin MT5; menyediakan `/chart` melalui package MetaTrader5 |
| Core trading | `src/trading_agent/` | Strategi EMA/ATR, risiko, execution state machine, rekonsiliasi, SQLite |
| Adapter | `src/trading_agent/adapters/` | Mock dan MT5; adapter MT5 juga memiliki fungsi submit order |
| Simulasi | `src/trading_agent/backtest.py`, `src/trading_agent/brokers/paper.py` | Backtest dan PaperBroker |
| Strategy Lab | `app/lab/`, `app/api/lab.py`, `frontend/src/components/lab/` | Registry indikator, strategi terversi, dataset historis immutable, pratinjau chart, dan run backtest research |
| UI/CLI core | `src/trading_agent/ui/app.py`, `src/trading_agent/cli.py` | Streamlit dan CLI terpisah dari dashboard web |
| Test | `tests/` | unittest untuk strategi/risk, eksekusi/rekonsiliasi, backtest export, indikator kompatibilitas |

## Alur data saat ini

Diagnostik: `app/diagnostics.py` mencatat request `/api/*` dan health (kecuali polling diagnostik) dalam ring buffer 1.000 event per proses, dengan request ID, status, durasi, alasan aman dan lokasi exception tanpa payload. `GET /api/diagnostics` mengembalikan log sesi dan usia cache EA akun/candle. Sidebar **Log sistem** menyediakan filter, pencarian, jeda dan export JSON. Ini bukan akses Journal Windows atau log worker/Docker historis; restart mengosongkan log.

Pembaruan akun: `app/api/account.py` menyediakan `GET /api/account` dan ingest `POST /api/mt5/account`. Bridge EA v2.0 mengirim metadata/account snapshot terpisah dari candle dan meminta M1/M5/M15/H1/H4/D1; bridge Python menyediakan `/account`. Pemilihan sumber mengikuti `MT5_BRIDGE_URL`. Frontend membaca snapshot 15 detik, menampilkan nama/broker/server/jenis akun, balance/equity/profit/margin, mata uang, leverage, kredit, dan jumlah posisi. Kalkulator memakai balance tersebut, bukan input simulasi. Snapshot usang (>60 detik), disconnected, atau gagal baca ditolak; UI tidak memakai saldo lama. Ini satu akun aktif per instance API, belum multi-user. Setup terminal ada di `MT5_ACCOUNT_SETUP.md`; penerimaan akun live tetap membutuhkan pembaruan bridge di mesin MT5.

Pembaruan frontend 2026-10-03: FastAPI menyajikan `frontend/dist` pada `/` dan `/workspace/` ketika build tersedia saat startup. Dockerfile memakai build Node terpisah. Frontend hanya membaca API chart/summary/health/account; tidak melakukan mutasi, ARM, atau submit. News, AI, worker, dan eksekusi yang belum didukung endpoint tampil unavailable. Kalkulator risiko memakai balance akun MT5 dengan persentase lokal, bukan konfigurasi engine. Detail setup ada di `frontend/README.md`.

Strategy Lab 2026-10-04: sidebar memisahkan **Manajemen indikator** dari **Strategi & backtest**. Manajemen indikator menyediakan CRUD terversi (hapus berupa arsip), clone, impor/ekspor JSON, diff versi, editor source Pine, provenance, dan pratinjau historis. Dashboard memiliki dialog indikator bergaya workflow TradingView untuk pencarian, favorit, beberapa instance, visibilitas, dan konfigurasi parameter; pilihan chart/favorit tersimpan per browser. Perhitungan chart memanggil implementasi domain yang sama dengan backtest. Metadata/versi/run disimpan di PostgreSQL; candle dataset disimpan sebagai snapshot NPZ terkompresi dan ber-checksum pada volume `lab_data`. Pine yang diedit disimpan sebagai versi baru dan tidak dieksekusi. Adaptasi BOSWaves memiliki renderer khusus untuk ribbon, flip, entry, SL, target T1–T4, zona, dan posisi historis. Statusnya tetap `draft`: target-hit styling, candle gradient, alert, dan parity terhadap TradingView pada candle identik belum diverifikasi. Jalur ini tidak mengirim order terminal dan belum menjadi sinyal live/PAPER/DEMO.

Gambar chart 2026-10-04: workspace menyediakan garis tren/ray/horizontal/vertikal, zona harga, penggaris harga/persen/bar, Fibonacci retracement, channel, garis paralel, kuas bebas, dan anotasi teks. Objek manual memakai grup overlay terpisah dari sinyal dan overlay AI. Layout dapat dibuat, dipilih, dinamai ulang, diduplikat, dikunci, disembunyikan, dikosongkan, diekspor, dan diimpor; perubahan objek disimpan otomatis di `localStorage` per browser dengan scope simbol/timeframe serta batas 24 layout dan 200 objek. Belum ada identitas pengguna web, sehingga layout belum tersinkron antarbrowser/perangkat.

Catatan bukti: WORKLOG/roadmap telah memuat klaim pekerjaan P0/P1 dari sesi lain sebelum migrasi frontend ini. Status tersebut tidak divalidasi ulang dalam tugas UI; temuan review awal di bawah merupakan baseline historis. Kode API saat ini sudah memiliki TTL cache 60 detik dan perbaikan RSI, tetapi masih memiliki endpoint placeholder. Jangan menganggap pengujian frontend membuktikan P0/P1 tuntas.

1. EA mengirim candle ke `/api/mt5/candles` (Initial Sync 800 bar, lalu Incremental Sync 2 bar setiap 15 detik); API menyimpan dan menggabungkan hasilnya secara thread-safe via `app/services/candle_cache.py` (`CandleCacheService`) dengan batasan maksimal 800 candle per simbol+timeframe.
2. Jika `MT5_BRIDGE_URL` disetel, `/api/market/chart` mengambil data dari bridge Python. Jika tidak, endpoint membaca data dari `CandleCacheService` (`candles[-limit:]`).
3. Dashboard mengambil chart tersebut dan summary dari tabel PostgreSQL. Tidak ditemukan integrasi yang menjadikan ledger SQLite worker sebagai sumber summary ini.
4. Worker core memilih `MockAdapter` atau `MT5Adapter` berdasarkan `data_source`; strategi worker menggunakan EMA/ATR.
5. Marker BUY/SELL pada chart web dihitung dari crossover MACD. Marker tersebut bukan bukti strategi worker menghasilkan sinyal atau broker mengeksekusi order.

## Konfigurasi dan lingkungan

- `requirements.txt` memuat FastAPI, Uvicorn, Pydantic, SQLAlchemy, psycopg2, pandas, numpy, dan PyYAML dengan versi terkunci. Daftar ini belum mencakup semua kebutuhan UI Streamlit/core.
- Dockerfile memakai Python 3.11; Compose menjalankan API dan PostgreSQL 15.
- Container memakai `PYTHONPATH=/app:/app/src`, sehingga domain indikator/backtest di `src/trading_agent` dapat dipanggil API Strategy Lab.
- `config.yaml` memiliki struktur nested untuk engine web/TDS. `AppConfig` core menerima field flat. Jangan menganggap YAML tersebut mengatur worker dengan nilai yang sama; field ekstra dapat diabaikan oleh model saat ini.
- Default core mencakup PAPER/mock, risk per trade 0.5%, daily loss 2%, drawdown 5%. YAML web mencantumkan nilai berbeda. Ini catatan implementasi, bukan persetujuan untuk mengganti parameter risiko.
- Worker mengimpor `fcntl`, sehingga kompatibilitas Windows belum terpenuhi walaupun adapter MT5 ditujukan untuk Windows.

## Temuan Terbuka dan Hasil Audit Senior (2026-10-06)

Referensi lengkap: [AUDIT_REPORT.md](AUDIT_REPORT.md) dan [CODE_QUALITY.md](CODE_QUALITY.md) (menggantikan panduan lama).

### Temuan Kunci Audit (F1 - F16)
1. **F1 [Critical] Autopilot Fail-Open di Akun REAL/CONTEST**: `app/engines/ai_autopilot.py::start()` memeriksa `trade_mode != DEMO` tetapi berada dalam `try...except Exception` yang menelan `PermissionError` dan fallback ke saldo bawaan `587.35`. `_execute_mt5_order()` tidak memeriksa mode akun.
2. **F2 [High] Order Tanpa SL dan Kontrol Risiko**: Autopilot mengirim `sl: round(sl, digits) if sl else 0.0`. Jalur `trade.py` menjadikan SL/TP opsional, volume tidak dinormalisasi ke `volume_step/min/max` simbol, dan `risk_engine` tidak dipanggil dari `trade.py` maupun autopilot.
3. **F3 [High] Dua Jalur Eksekusi Paralel Tanpa Idempotency**: `order_send` dipanggil di `trade.py`, `ai_autopilot.py`, dan adapter `mt5.py`. `ExecutionStateMachine` tidak dipakai oleh `app/`. Tidak ada idempotency key (klik ganda = order ganda). Posisi tersimpan di memori global (`_active_positions`, `_orders_history`).
4. **F4 [High] Ketiadaan Autentikasi & Exposure Network**: 43 endpoint terbuka tanpa autentikasi (termasuk submit order & close-all). Dockerfile & Compose mem-publish `0.0.0.0:8000` dan Postgres `postgres/postgres` ke semua interface.
5. **F5 [Medium] Mode Simulasi Ditentukan Klien**: `trade.py` memakai `mode == "test"` dari payload request yang memasukkan posisi simulasi ke memory list produksi.
6. **F6 [Medium] Autopilot Memakai Candle Interval Salah**: `_evaluate_market_and_open()` mengiterasi `market_cache` dan berhenti pada entri pertama yang cocok simbolnya tanpa memeriksa kecocokan `interval`.
7. **F7 [Medium] Nilai Pengganti Fail-Open**: Saldo default `587.35` saat MT5 gagal dibaca, SL/TP hardcoded `2680.0/2720.0`, spread `0.20` hardcoded.
8. **F8 [Medium] State Global Tanpa Kunci**: `market_cache = {}` dimutasi dan diiterasi tanpa lock lintas thread.
9. **F9 [Medium] Kompleksitas Siklomatik Tinggi**: 37 fungsi/kelas bernilai radon CC >= 11 (tertinggi `submit_trade_order` CC 73, `get_finance_overview` CC 54, `run_research_backtest` CC 50).
10. **F10 [Medium] Cakupan Test Tidak Seimbang**: Cakupan keseluruhan 58%, namun jalur uang rendah (`trade.py` 36%, adapter MT5 16%, autopilot 48%).
11. **F11 [Medium] Dependensi Rentan**: `fastapi==0.104.1` (PYSEC-2024-38), belum ada lockfile ber-hash.
12. **F12 [Low-Medium] Kode Mati & Modul Bayangan**: `signal_engine.py`, `ai_decision_engine.py`, `confluence_engine.py` tidak terpakai; modul lokal `pandas_ta.py` membayangi paket pustaka resmi.
13. **F13 - F16**: Kebersihan cache git (`.pyc`/`.db`), bocoran `detail=str(e)`, inisialisasi MT5 berulang, dan komponen frontend yang terlalu besar (>500-1000 baris).

### Aturan Keras Jalur Uang (M1 - M12)
Sesuai [CODE_QUALITY.md](CODE_QUALITY.md), aturan berikut mengikat setiap perubahan pada kode yang dapat mengirim, mengubah, atau menutup order:
* **M1 (Fail-closed)**: Gagal membaca akun/terminal/data berarti **menolak aksi**, dilarang memakai nilai pengganti palsu.
* **M2 (Guard DEMO Tunggal)**: Satu fungsi guard (`assert_demo_account()`) fail-closed dipanggil sebelum **setiap** `order_send`.
* **M3 (Satu Jalur Eksekusi)**: `import MetaTrader5`, `mt5.initialize()`, dan `order_send` hanya ada di adapter (`src/trading_agent/adapters/mt5.py`).
* **M4 (Stop Loss Wajib)**: Order tanpa SL ditolak. Validasi SL/TP terhadap arah order dan harga pasar.
* **M5 (Normalisasi Volume & Risk Engine)**: Volume disesuaikan `volume_step/min/max` simbol dan dibatasi `max_lot`. `risk_engine` wajib dipanggil sebelum kirim.
* **M6 (Idempotency)**: Setiap order wajib membawa idempotency key. Dilarang membuat ID dari `time.time()`.
* **M7 (Simulasi via Server/DI)**: Mode simulasi ditentukan konfigurasi server/dependency injection, tidak pernah dari payload klien.
* **M8 (No Swallowing Exceptions)**: Dilarang `except Exception` yang menelan kegagalan di jalur uang; kembalikan status eksplisit (`REJECTED`, `UNKNOWN`).
* **M9 (Kunci Data Pasar Penuh)**: Pengambilan candle wajib mencocokkan tuple `(simbol, interval)` secara tepat.
* **M10 (Bebas Magic Number)**: Parameter deviasi, lot, ambang risiko diambil dari modul konfigurasi tunggal.
* **M11 (Test-First & Anti-Regresi)**: Perubahan jalur uang wajib didahului test, scope sekecil mungkin, dan dilarang melonggarkan pengaman.
* **M12 (Endpoint Terproteksi & Loopback)**: Mutasi uang/posisi harus diproteksi token + validasi Host/Origin; service hanya bind ke `127.0.0.1`.

### Standar Pengembangan dan Protokol Refactor
1. **Arsitektur Berlapis**: `router -> service -> adapter/repository`. Router hanya validasi input HTTP; Service melempar exception domain; Adapter menangani I/O eksternal.
2. **Karakteristik Fungsi**: Fungsi baru <= 40 baris, kompleksitas radon CC <= 10, satu tanggung jawab, early return.
3. **Protokol Strangler**: Jangan big-bang rewrite. Buat jalur aman baru, alihkan pemanggil bertahap, hapus jalur lama.
4. **Ratchet Rule**: Kualitas kode dan test coverage jalur uang harus meningkat (target >= 80%), tidak boleh menambah pengecualian lint/kompleksitas baru.
5. **Frontend**: Komponen dipecah menjadi data hook (`react-query`), logika murni, dan tampilan presentasional (target <= 300 baris).

### Keputusan Tertunda dari Pemilik
1. **Mode PAPER**: Dihapus permanen (sesuai komentar di `trade.py`) atau dipertahankan simulasi (sesuai `AGENTS.md`)?
2. **Autopilot**: Tetap jalur terpisah atau dilebur ke service eksekusi tunggal?
3. **Engine Menganggur**: Nasib `signal_engine`, `ai_decision_engine`, `confluence_engine` (diintegrasikan atau dibersihkan).
4. **Autentikasi**: Format token header yang diinginkan.
5. **Penggunaan Docker**: Apakah dipakai harian atau pengujian lokal via batch script.

## Arah arsitektur yang diusulkan

- Pertahankan dashboard web sebagai antarmuka yang sudah menerima data MT5.
- Gunakan satu domain strategi/risk/execution yang dapat dipanggil worker, API, dan backtest. Core yang ada menjadi kandidat awal, setelah perbaikan P0.
- Pisahkan market data provider dari execution broker agar PAPER dengan data live tetap simulasi.
- Buat dashboard membaca keputusan dan ledger dari layanan domain yang sama.
- Pilihan penyimpanan akhir dan migrasi PostgreSQL/SQLite belum diputuskan. Jangan menghapus salah satu sebelum kontrak data dan migrasi disiapkan.
- Peran AI yang diminta: analisis pasar, skenario LONG/SHORT, penjelasan/gambar, rekomendasi peluang, dan keputusan pada mode otomatis. AI menghasilkan rencana terstruktur; risk engine memvalidasi dan execution manager mengirim order.
- Urutan implementasi selaras dengan **Rencana Perbaikan Berurutan** di [AUDIT_REPORT.md](AUDIT_REPORT.md): Tahap 0 (Guard DEMO fail-closed & loopback bind), Tahap 1 (Hygiene & Tooling), Tahap 2 (Kontrol Dasar Order), Tahap 3 (Unifikasi Eksekusi), Tahap 4 (Refactor Kompleksitas & Autopilot), Tahap 5 (Cache & Dependensi), Tahap 6 (Refactor Frontend).

## Perintah referensi

Jalankan dari root project dengan environment dependency yang sesuai.

```bash
# Seluruh unittest offline
PYTHONPATH=src:. python -m unittest discover -s tests -v

# Uji coverage (target ratchet >= 58% baseline)
.venv/Scripts/python -m pytest -q --cov=app --cov=src --cov-report=term

# Pengecekan Pyright & Ruff
npx pyright
ruff check .

# Frontend build & E2E Playwright
cd frontend && npm run build
npx playwright test
```
