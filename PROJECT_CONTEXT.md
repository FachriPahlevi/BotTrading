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
| Bridge EA | `AurumMarketBridge.mq5` | POST candle M5/M15/H1/H4/D1 setiap timer 15 detik; bukan pelaksana order |
| Bridge Python | `mt5_bridge.py` | FastAPI pada mesin MT5; menyediakan `/chart` melalui package MetaTrader5 |
| Core trading | `src/trading_agent/` | Strategi EMA/ATR, risiko, execution state machine, rekonsiliasi, SQLite |
| Adapter | `src/trading_agent/adapters/` | Mock dan MT5; adapter MT5 juga memiliki fungsi submit order |
| Simulasi | `src/trading_agent/backtest.py`, `src/trading_agent/brokers/paper.py` | Backtest dan PaperBroker |
| UI/CLI core | `src/trading_agent/ui/app.py`, `src/trading_agent/cli.py` | Streamlit dan CLI terpisah dari dashboard web |
| Test | `tests/` | unittest untuk strategi/risk, eksekusi/rekonsiliasi, backtest export, indikator kompatibilitas |

## Alur data saat ini

Diagnostik: `app/diagnostics.py` mencatat request `/api/*` dan health (kecuali polling diagnostik) dalam ring buffer 1.000 event per proses, dengan request ID, status, durasi, alasan aman dan lokasi exception tanpa payload. `GET /api/diagnostics` mengembalikan log sesi dan usia cache EA akun/candle. Sidebar **Log sistem** menyediakan filter, pencarian, jeda dan export JSON. Ini bukan akses Journal Windows atau log worker/Docker historis; restart mengosongkan log.

Pembaruan akun: `app/api/account.py` menyediakan `GET /api/account` dan ingest `POST /api/mt5/account`. Bridge EA v1.3 mengirim metadata/account snapshot terpisah dari candle dan meminta M1/M5/M15/H1/H4/D1; bridge Python menyediakan `/account`. Pemilihan sumber mengikuti `MT5_BRIDGE_URL`. Frontend membaca snapshot 15 detik, menampilkan nama/broker/server/jenis akun, balance/equity/profit/margin, mata uang, leverage, kredit, dan jumlah posisi. Kalkulator memakai balance tersebut, bukan input simulasi. Snapshot usang (>60 detik), disconnected, atau gagal baca ditolak; UI tidak memakai saldo lama. Ini satu akun aktif per instance API, belum multi-user. Setup terminal ada di `MT5_ACCOUNT_SETUP.md`; penerimaan akun live tetap membutuhkan pembaruan bridge di mesin MT5.

Pembaruan frontend 2026-10-03: FastAPI menyajikan `frontend/dist` pada `/` dan `/workspace/` ketika build tersedia saat startup. Dockerfile memakai build Node terpisah. Frontend hanya membaca API chart/summary/health/account; tidak melakukan mutasi, ARM, atau submit. News, AI, worker, dan eksekusi yang belum didukung endpoint tampil unavailable. Kalkulator risiko memakai balance akun MT5 dengan persentase lokal, bukan konfigurasi engine. Detail setup ada di `frontend/README.md`.

Catatan bukti: WORKLOG/roadmap telah memuat klaim pekerjaan P0/P1 dari sesi lain sebelum migrasi frontend ini. Status tersebut tidak divalidasi ulang dalam tugas UI; temuan review awal di bawah merupakan baseline historis. Kode API saat ini sudah memiliki TTL cache 60 detik dan perbaikan RSI, tetapi masih memiliki endpoint placeholder. Jangan menganggap pengujian frontend membuktikan P0/P1 tuntas.

1. EA mengirim candle ke `/api/mt5/candles`; API menyimpan hasilnya dalam dictionary `market_cache` per proses.
2. Jika `MT5_BRIDGE_URL` disetel, `/api/market/chart` mengambil data dari bridge Python. Jika tidak, endpoint membaca cache EA.
3. Dashboard mengambil chart tersebut dan summary dari tabel PostgreSQL. Tidak ditemukan integrasi yang menjadikan ledger SQLite worker sebagai sumber summary ini.
4. Worker core memilih `MockAdapter` atau `MT5Adapter` berdasarkan `data_source`; strategi worker menggunakan EMA/ATR.
5. Marker BUY/SELL pada chart web dihitung dari crossover MACD. Marker tersebut bukan bukti strategi worker menghasilkan sinyal atau broker mengeksekusi order.

## Konfigurasi dan lingkungan

- `requirements.txt` memuat FastAPI, Uvicorn, Pydantic, SQLAlchemy, psycopg2, pandas, numpy, dan PyYAML dengan versi terkunci. Daftar ini belum mencakup semua kebutuhan UI Streamlit/core.
- Dockerfile memakai Python 3.11; Compose menjalankan API dan PostgreSQL 15.
- Container memakai `PYTHONPATH=/app`; package core berada di `src/`, sehingga perintah core memerlukan path package yang sesuai.
- `config.yaml` memiliki struktur nested untuk engine web/TDS. `AppConfig` core menerima field flat. Jangan menganggap YAML tersebut mengatur worker dengan nilai yang sama; field ekstra dapat diabaikan oleh model saat ini.
- Default core mencakup PAPER/mock, risk per trade 0.5%, daily loss 2%, drawdown 5%. YAML web mencantumkan nilai berbeda. Ini catatan implementasi, bukan persetujuan untuk mengganti parameter risiko.
- Worker mengimpor `fcntl`, sehingga kompatibilitas Windows belum terpenuhi walaupun adapter MT5 ditujukan untuk Windows.

## Temuan terbuka dari pembacaan kode

| ID | Temuan | Bukti utama |
| --- | --- | --- |
| F01 | Jalur PAPER tetap memanggil adapter submit; kombinasi PAPER + data MT5 dapat mencapai `order_send` | `execution.py`, `engine.py`, `adapters/mt5.py` di core |
| F02 | PAUSED karena rekonsiliasi dapat ditimpa saat initialize; ARM juga belum menjaga kondisi unresolved | `src/trading_agent/engine.py` |
| F03 | Sejumlah risk check web selalu lolos; confidence/entry/SL/TP decision memakai angka tetap | `app/engines/risk_engine.py`, `ai_decision_engine.py` |
| F04 | Endpoint regime memakai frame kosong; calibration/grading memakai contoh; walk-forward/Monte Carlo mengembalikan task ID tetap | `app/api/endpoints.py` |
| F05 | Cache candle tidak persisten dan tidak memeriksa umur data sebelum dikembalikan | `app/api/endpoints.py` |
| F06 | Perhitungan indikator terduplikasi; RSI saat losses nol dapat menjadi 50 pada jalur ingest | `app/api/endpoints.py`, `mt5_bridge.py` |
| F07 | Backtest memakai risk engine dengan wall clock; pending signal berpotensi menggeser entry satu bar tambahan | `src/trading_agent/backtest.py`, `risk.py` |
| F08 | Parameter spread/slippage PaperBroker belum diterapkan pada harga fill | `src/trading_agent/brokers/paper.py` |
| F09 | Config, database, strategi marker, dan label broker tidak konsisten antarjalur | File konfigurasi, bridge, API, dan core |
| F10 | Worker memakai lock khusus Unix | `src/trading_agent/engine.py` |

Temuan ini belum diperbaiki atau dibuktikan dengan regresi pada sesi dokumentasi. `LOCAL_EXECUTION_LOG.md` mencatat kelulusan lama; jangan menggunakannya untuk menutup temuan di atas.

## Arah arsitektur yang diusulkan

- Pertahankan dashboard web sebagai antarmuka yang sudah menerima data MT5.
- Gunakan satu domain strategi/risk/execution yang dapat dipanggil worker, API, dan backtest. Core yang ada menjadi kandidat awal, setelah perbaikan P0.
- Pisahkan market data provider dari execution broker agar PAPER dengan data live tetap simulasi.
- Buat dashboard membaca keputusan dan ledger dari layanan domain yang sama.
- Pilihan penyimpanan akhir dan migrasi PostgreSQL/SQLite belum diputuskan. Jangan menghapus salah satu sebelum kontrak data dan migrasi disiapkan.
- Peran AI yang diminta: analisis pasar, skenario LONG/SHORT, penjelasan/gambar, rekomendasi peluang, dan keputusan pada mode otomatis. AI menghasilkan rencana terstruktur; risk engine memvalidasi dan execution manager mengirim order. Strategi/model/provider belum dipilih; confidence tetap pada kode sekarang bukan AI tervalidasi.
- Go adalah opsi yang dibahas, belum keputusan migrasi. Usulan hybrid: Go untuk backend utama, Python atau EA MQL5 untuk bridge, Python untuk eksperimen/training bila diperlukan. Jangan memulai rewrite hanya berdasarkan diskusi ini.
- Frontend telah dipilih dan diimplementasikan: React/TypeScript/Vite + Tailwind/shadcn, KLineChart. Backend Python dan bridge yang ada dipertahankan. Panggilan AI baru tidak termasuk scope implementasi frontend ini.
- Mode operasi Analisis/Manual/Otomatis terpisah dari PAPER/DEMO/REAL. Tahap implementasi awal mempertahankan blokir REAL dan koneksi MT5 yang sudah bekerja.
- Anotasi chart dirancang sebagai objek harga/waktu terversi, bukan gambar statis. Input modal $100 adalah contoh kebutuhan alokasi/simulasi, bukan bukti saldo pengguna.
- MVP cloud yang diusulkan memakai Gemini API sebagai kandidat awal untuk analisis/anotasi dan keputusan, dengan risk/execution lokal. Berita terbaru berasal dari sumber terverifikasi; kalender event mendatang direncanakan melalui MQL5. Belum ada integrasi tersebut yang diaktifkan.
- Pengguna menyatakan memiliki Gemini Pro serta ChatGPT/Codex. Manfaat kredit Google AI Pro dan opsi resmi ChatGPT plan usage hanya kandidat yang perlu pemeriksaan entitlement, biaya, dan batas akun. Paket pengguna belum diverifikasi; jangan menganggap langganan menyediakan API unlimited.
- Rincian MVP cloud, kontrak news/calendar, kontrol kuota, dan kriteria penerimaan terpusat di `IMPROVEMENT_PLAN.md`.
- Urutan rekomendasi terbaru berada pada Prioritas 1–7 di awal roadmap; checklist #1–#33 mempertahankan nomor dari percakapan, sementara P0–P8 adalah ID kelompok teknis. Scope awal yang disarankan: fondasi lalu analisis satu simbol dengan chart beranotasi. Ini belum keputusan pengguna untuk memulai implementasi.

## Perintah referensi

Jalankan dari root project dengan environment dependency yang sesuai. Perintah berikut adalah referensi, bukan catatan bahwa sudah dijalankan atau lulus.

```bash
# Seluruh unittest offline; src diperlukan agar package core dapat ditemukan
PYTHONPATH=src:. python -m unittest discover -s tests -v

# Subset regresi execution/reconciliation
PYTHONPATH=src:. python -m unittest discover -s tests -p 'test_execution_reconciliation.py' -v
```

Perintah startup API/worker ada dalam README dan CLI, tetapi perlu disesuaikan dengan database, dependency, serta konfigurasi aktif. Jangan menjalankan worker hanya untuk memeriksa dokumentasi.

## Hal yang perlu diverifikasi saat implementasi

- Metode koneksi aktif: EA push atau bridge Python; OS dan lokasi terminal.
- Server/jenis akun/symbol sebenarnya pada Exness Ltd dan dukungan timeframe yang diperlukan.
- Dependency runtime core/Streamlit dan hasil test aktual pada environment yang dipakai.
- Target produk mencakup analisis, manual, dan otomatis; prioritas rilis berikutnya mengikuti roadmap, dimulai dari fondasi lalu PAPER sebelum DEMO otomatis.
- Kontrak penyatuan config/storage dan strategi yang akan menjadi sumber sinyal utama.
