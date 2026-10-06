# Audit Teknis BotTrading

**Repo:** `FachriPahlevi/BotTrading`, commit `15bbf62` ("improve feature"), diaudit 2026-10-06.
**Cakupan:** backend Python (`app/`, `src/trading_agent/`), jalur eksekusi order, keamanan permukaan API, dependensi, test, kualitas kode, frontend (analisis statis ringan).
**Tingkat keparahan:** **Critical** = dapat menyebabkan transaksi yang dilarang atau kerugian uang nyata; **High** = risiko besar pada keselamatan/integritas; **Medium** = risiko nyata dengan kondisi tertentu; **Low** = kebersihan dan pemeliharaan.

## 1. Ringkasan eksekutif

Kode di `app/lab/` dan `src/trading_agent/` (dataset, backtest, state machine, risk) tergolong baik: terstruktur, ada test, dan memuat pengaman yang sengaja dirancang. Masalah terkonsentrasi di **jalur uang di `app/`**: `app/api/trade.py` dan `app/engines/ai_autopilot.py`. Dua berkas itu mengirim order langsung ke MT5, melewati state machine, risk engine, dan aturan di `AGENTS.md`.

Lima hal yang paling perlu ditangani:

1. **F1 (Critical).** Autopilot dapat berjalan di akun **REAL/CONTEST**; pengaman DEMO-only-nya tertelan `except Exception`. Sudah direproduksi (bagian 3).
2. **F2 (High).** Order dari jalur langsung dapat terkirim **tanpa stop loss** (`sl=0.0`), tanpa pemanggilan risk engine, dan tanpa normalisasi volume per simbol.
3. **F3 (High).** Ada dua jalur eksekusi paralel tanpa idempotency; `ExecutionStateMachine` tidak dipakai sama sekali oleh `app/`.
4. **F4 (High).** 43 endpoint tanpa autentikasi, termasuk membuka order dan menutup semua posisi; Docker mem-publish API dan Postgres (kredensial bawaan) ke semua interface.
5. **F6 (Medium).** Autopilot menganalisis candle dari interval yang salah (mengabaikan `interval` yang diminta).

Angka kunci: 67 test lulus (dependensi sesuai pin), cakupan total **58%**, tetapi `trade.py` hanya **36%** dan adapter MT5 **16%**. Satu fungsi (`submit_trade_order`) berkompleksitas **73**, dan 37 fungsi/kelas berkompleksitas >= 11.

## 2. Metode dan batas verifikasi

**Dijalankan:** clone repo; `pytest` + coverage di venv dengan `requirements.txt` terkunci (Python 3.12.3); `ruff` (konfigurasi bawaan dan usulan); `radon cc`; `pyright`; `pip-audit`; pemindaian pola rahasia pada HEAD dan riwayat yang tersedia; pembacaan kode jalur order, autopilot, lab, dan konfigurasi Docker; simulasi autopilot dengan modul `MetaTrader5` palsu.

**Catatan pengukuran:** semua angka diukur pada checkout bersih commit `15bbf62` (`git archive HEAD`). Pengukuran awal sempat tercampur tiga draf dari asisten AI (`ai_agent.py`, `ai_gate.py`, `ai_features.py`) yang ada di clone kerja tetapi **bukan bagian repo**, dan hitungan radon awal terpotong (`head`). Keduanya sudah dikoreksi; draf itu tidak dinilai di sini.

**Tidak diverifikasi (jangan dianggap aman):**
- Perilaku dengan **terminal MT5 asli** (hanya simulasi dengan modul palsu).
- Build dan e2e **frontend** (`tsc`, `vite build`, Playwright tidak dijalankan).
- Runtime Postgres/Docker, beban, dan kinerja.
- Riwayat git **dangkal** (clone `--depth` terpotong; 8 commit tersedia). Pemindaian rahasia hanya mencakup commit tersebut.
- `pip-audit` dijalankan dengan `--no-deps`, jadi paket transitif (mis. Starlette) **tidak** ikut dipindai; hasilnya tidak lengkap.
- `pyright` dijalankan di lingkungan saya; sebagian error mungkin akibat paket opsional yang tidak terpasang.

## 3. Temuan

### F1 [Critical] Autopilot dapat trading di akun REAL/CONTEST
**Bukti:** `app/engines/ai_autopilot.py::start()` memeriksa `acc.trade_mode != DEMO` dan melempar `PermissionError`, tetapi pemeriksaan itu berada di dalam `try ... except Exception as exc:` yang hanya mencatat WARN. Eksekusi lanjut dengan `initial_balance = 587.35` (nilai bawaan). `_execute_mt5_order()` **tidak** memeriksa mode akun. `app/api/autopilot.py` tidak menambah pengaman.

**Reproduksi (simulasi, modul `MetaTrader5` palsu dengan `trade_mode=REAL`, saldo 5000):**
```
status after start() on REAL account: RUNNING
start balance used: 587.35 (account balance is 5000.0)
order_send calls on REAL account: 1 | sl sent: 0.0
```
Skrip: `repro_F1_autopilot_real_account.py` (jalankan dengan `PYTHONPATH=.:src`).

**Dampak:** melanggar invarian `AGENTS.md` (REAL/CONTEST diblokir). Prasyarat: terminal login ke akun REAL dan autopilot dijalankan; tetapi pengamannya fail-open.
**Perbaikan:** satu fungsi guard (`assert_demo_account()`) yang **fail-closed**, dipanggil sebelum setiap `order_send` (bukan hanya saat `start()`); `PermissionError` tidak boleh ditelan; gagal membaca akun berarti menolak, bukan memakai nilai pura-pura. Tambah test regresi memakai modul MT5 palsu seperti skrip bukti. **Usaha: S.**

### F2 [High] Order tanpa SL dan tanpa kontrol risiko pada jalur langsung
**Bukti:** autopilot mengirim `sl: round(sl, digits) if sl else 0.0` (terbukti `sl=0.0` pada simulasi). Di `trade.py`, `sl`/`tp` opsional. `volume` dibulatkan `round(x, 2)` tanpa memeriksa `volume_step/min/max` simbol. `risk_engine` hanya diimpor oleh `signal_engine` (yang sendiri tidak dipakai), `src/`, dan test; **tidak** dipanggil dari `trade.py` maupun autopilot. Volume autopilot boleh sampai 5,0 lot. Tidak ada filter spread, sesi, atau volatilitas.
**Perbaikan:** SL wajib (tolak bila kosong); normalisasi volume terhadap spesifikasi simbol; risk engine dipanggil sebelum kirim; batas lot maksimum dari konfigurasi. **Usaha: M.**

### F3 [High] Dua jalur eksekusi paralel, tanpa idempotency, state di memori
**Bukti:** `order_send` dipanggil di `trade.py` (3 tempat) dan `ai_autopilot.py` (2 tempat), selain adapter `src/trading_agent/adapters/mt5.py`. `ExecutionStateMachine` tidak diimpor oleh `app/` sama sekali. Tidak ada idempotency key (klik ganda atau retry = dua order). `ticket` bisa berasal dari `int(time.time()*1000) % 1_000_000_000`. Posisi dan riwayat disimpan di list global `_active_positions` dan `_orders_history` (hilang saat restart). `mt5.initialize()` tersebar di 11 tempat di `app/`.
**Konflik dokumen:** `trade.py` menormalkan `paper` menjadi `demo` ("paper mode is removed per user request"), sedangkan `AGENTS.md` menyatakan PAPER tidak boleh memanggil `order_send` dan eksekusi lewat state machine.
**Perbaikan:** satu service eksekusi dan satu adapter MT5; semua endpoint memanggil service itu. **Perlu keputusan pemilik** (lihat bagian 6) tentang mode PAPER sebelum dikerjakan. **Usaha: L.**

### F4 [High] Tidak ada autentikasi; port terbuka ke semua interface
**Bukti:** 43 endpoint, tanpa dependency autentikasi (hanya API key untuk panggilan keluar ke penyedia AI). Termasuk `POST /trade/order`, `/trade/positions/close-all`, `/autopilot/start`, `/lab/*`. `Dockerfile` menjalankan `--host 0.0.0.0`; `docker-compose.yml` mem-publish `8000:8000` dan `5432:5432` tanpa pembatasan loopback, dengan Postgres `postgres/postgres`. `run_api.bat` aman (`127.0.0.1`). Pengaman yang ada: jalur manual memeriksa akun DEMO.
**Konteks:** penggunaan lokal pribadi, jadi risiko bergantung jaringan. Namun di laptop dengan Docker bawaan, layanan terjangkau dari LAN.
**Perbaikan:** publish `127.0.0.1:8000:8000` dan `127.0.0.1:5432:5432`; kredensial dari `.env`; untuk endpoint yang mengubah state/uang, tambah token header sederhana dan validasi `Host`/`Origin` (melindungi dari halaman web yang menembak localhost). **Usaha: S.**

### F5 [Medium] Mode simulasi dipilih oleh klien
**Bukti:** `trade.py`: `is_test_mode = mode == "test" or os.getenv("TRADING_TEST_MODE") == "1"`; `mode` berasal dari payload. Komentar menyebut jalur itu "digunakan eksklusif oleh unit test", tetapi di produksi ia menambahkan posisi palsu ke `_active_positions` dan riwayat berstatus `FILLED`.
**Perbaikan:** pilih simulasi dari konfigurasi server atau dependency injection (adapter palsu), bukan payload; hapus cabang simulasi dari kode produksi. **Usaha: S.**

### F6 [Medium] Autopilot memakai candle dari interval yang salah
**Bukti:** `_evaluate_market_and_open()` mengiterasi `market_cache.items()` dengan `for (c_sym, c_inv), entry in ...` dan **berhenti pada entri pertama** yang simbolnya cocok; `c_inv` tidak dibandingkan dengan `self.interval`. Analisis berlabel `1h` dapat berjalan pada candle `1m`. Analisis memakai `analyze_market_chart` lama (minimum 20 candle) dan ambang `confidence >= 60`, tanpa gerbang validasi.
**Perbaikan:** ambil kunci `(simbol, interval)` secara tepat; gunakan EMA/ATR dengan riwayat memadai (EMA 200 butuh >= 600 bar); lewatkan keputusan melalui gerbang deterministik. **Usaha: M.**

### F7 [Medium] Nilai pengganti fail-open
**Bukti:** saldo awal `587.35` bila MT5 tidak terbaca; SL/TP `2680.0`/`2720.0` hardcoded pada jalur uji autopilot; spread `0.20` hardcoded untuk emas pada jalur simulasi.
**Dampak:** target profit dan batas rugi autopilot dihitung dari saldo palsu sehingga tidak bermakna.
**Perbaikan:** gagal membaca = berhenti dengan status eksplisit, bukan nilai bawaan. **Usaha: S.**

### F8 [Medium] State global tanpa kunci
**Bukti:** `market_cache = {}` (`app/api/endpoints.py:22`) ditulis oleh request dan diiterasi (`endpoints.py:138,159` dan thread autopilot) tanpa lock. Menambah kunci baru saat iterasi dapat memicu `RuntimeError: dictionary changed size during iteration`.
**Perbaikan:** kelas `MarketCache` dengan lock dan baca-salinan, disuntikkan lewat dependency. **Usaha: S.**

### F9 [Medium] Fungsi terlalu kompleks dan sulit dites
**Bukti (radon, 37 fungsi/kelas dengan kompleksitas >= 11):** `submit_trade_order` **F (73)** (~260 baris), `get_finance_overview` F (54), `run_research_backtest` F (50, `src/trading_agent/backtest.py`), `close_position` E (34), `main` E (32, `ui/app.py`), `BacktestEngine.run_backtest` D (29), `analyze_market_chart` D (23), `save` D (22, `app/lab/service.py`), `get_market_chart` D (21), `_execute_mt5_order` C (19). Kompleksitas tinggi **tidak terbatas pada jalur uang**; `src/trading_agent` pun memilikinya.
**Perbaikan:** pecah per tahap (validasi, cek keselamatan akun, bangun request, kirim, simpan, respons) dengan characterization test lebih dulu. **Usaha: M-L.**

### F10 [Medium] Cakupan test tidak mengikuti risiko
**Bukti:** total **58%** (3984 pernyataan, 1660 tidak tercakup). Terendah di area uang: `app/api/trade.py` 36%, adapter MT5 16%, `ai_autopilot` 48%, `execution.py` 63%, `cli.py` dan `ui/app.py` 0%. Bagian lab/backtest bagus: `datasets` 87%, `backtest` 88%, `lab_indicators` 96%.
**Catatan lingkungan:** dengan Starlette terbaru (bukan pin), `test_diagnostics` gagal (`'/account' != '/api/account'`); dengan pin lulus. Versi dependensi memengaruhi perilaku test.
**Perbaikan:** target cakupan per modul (jalur uang >= 80%); test arsitektur (lihat `CODE_QUALITY.md`); lockfile penuh. **Usaha: M.**

### F11 [Medium] Dependensi usang dan tidak terkunci penuh
**Bukti:** `fastapi==0.104.1` terkena `PYSEC-2024-38` (perbaikan di 0.109.1); `uvicorn==0.24.0`, `pydantic==2.5.2`, Starlette 0.27.0 turunan. `requirements.txt` tanpa hash/lockfile; `requirements-mt5-bridge.txt` terpisah. Pemindaian tidak mencakup paket transitif (lihat batas verifikasi).
**Perbaikan:** naikkan FastAPI/Starlette bertahap (jalankan test tiap langkah), tambah lockfile (mis. `pip-compile`/`uv`), jalankan `pip-audit` penuh di CI. **Usaha: M.**

### F12 [Low-Medium] Kode mati dan berkas berantakan
**Bukti:** `app/engines/signal_engine.py` dan `ai_decision_engine.py` tidak diimpor oleh siapa pun (0% cakupan); `confluence_engine.py` hanya dipakai oleh `ai_decision_engine`, jadi ikut tidak terjangkau. Di root: `scratch_test.py`, `scratch_test_rsi.py`, dan `pandas_ta.py` (modul sendiri dengan nama yang sama seperti pustaka `pandas_ta`, berisiko membayangi paket asli), plus folder `typings/`.
**Perbaikan:** hapus atau pindahkan ke `scratch/` yang di-ignore; ganti nama modul indikator; putuskan nasib `signal_engine`, `ai_decision_engine`, dan `confluence_engine` (hubungkan dan uji, atau hapus). **Usaha: S.**

### F13 [Low] Kebersihan repo dan kebocoran pesan
**Bukti:** 43 berkas `.pyc`/`.db` masih terlacak walau `.gitignore` benar. `trading_agent.db` yang terlacak **sudah diperiksa: skema kosong, 0 baris** (tidak ada data akun/trade). Pemindaian pola rahasia (kunci AI, token, kunci privat) pada HEAD dan riwayat yang tersedia: **tidak ditemukan**. `.env.example` terlacak (wajar). Dua tempat memakai `detail=str(e)` pada respons HTTP (membocorkan teks internal). Sebelas berkas `.md` dengan potensi tumpang-tindih (risiko dokumen saling bertentangan, seperti kasus PAPER di F3).
**Perbaikan:** `git rm --cached`; ganti `str(e)` dengan pesan terkontrol dan log detail; konsolidasi dokumen. **Usaha: S.**

### F14 [Low] Tooling kualitas belum ada
**Bukti:** hanya `pyright` yang terkonfigurasi (72 error di 66 berkas pada lingkungan saya: `cli.py` 20, `tests/test_account_api.py` 17, `backtest.py` 9, `lab/jobs.py` 8). `ruff` bawaan: 477 pelanggaran; dengan konfigurasi usulan 869 (369 dapat diperbaiki otomatis). Tidak ada CI, pre-commit, ESLint, atau Prettier.
**Perbaikan:** lihat bagian *Tooling baseline* di `CODE_QUALITY.md`. **Usaha: S.**

### F15 [Low] Angka ajaib dan duplikasi inisialisasi MT5
**Bukti:** magic number `998877` dan `889900`, `deviation=25`, filling-mode, dan inisialisasi MT5 diulang di `trade.py`, `ai_autopilot.py`, `finance.py`; pesan error bercampur bahasa.
**Perbaikan:** satu modul konstanta/konfigurasi dan satu adapter. **Usaha: S.**

### F16 [Low-Medium] Frontend
**Bukti:** TypeScript `strict` aktif dan hanya 1 `any`; tidak ada `dangerouslySetInnerHTML`/`eval`. Namun komponen besar: `market-chart.tsx` 1054 baris, `tradingview-indicator-studio.tsx` 922, `finance-page.tsx` 572, `trade-panel.tsx` 540; 14 pemakaian `refetchInterval` (polling) dan 9 `localStorage`. Build dan e2e **tidak dijalankan**.
**Perbaikan:** pecah per tanggung jawab (hook data, logika murni, tampilan); ESLint + Prettier; verifikasi `tsc` dan e2e di CI. **Usaha: M.**

## 4. Yang sudah baik (pertahankan dan tiru)

- **Lab/dataset:** ID dataset berupa SHA-256, penulisan atomik (`tempfile` + `os.replace`), candle masa depan ditolak, candle berjalan dibuang, ID divalidasi heksadesimal sebelum membaca berkas, `np.load(..., allow_pickle=False)`.
- **Lab/Pine:** sumber Pine disimpan sebagai versi tidak berubah dan **tidak pernah dieksekusi**; tidak ada `eval/exec/subprocess/pickle` di kode aplikasi; tidak ada SQL mentah.
- **Jalur manual** (`submit_trade_order`) memblokir akun non-DEMO dan memvalidasi sisi SL/TP terhadap harga pasar.
- **`src/trading_agent`:** state machine, rekonsiliasi, risk, dan backtest dengan cakupan 63-88%. Catatan: ada fungsi kompleks di sana (`run_research_backtest` F 50, `BacktestEngine.run_backtest` D 29); tiru **pola**, bukan ukuran fungsinya.
- **`MT5_BRIDGE_URL`** hanya dari environment (bukan masukan pengguna), jadi tidak ada SSRF dari klien.
- Dokumentasi proyek lengkap; ada `pyright`; 67 test lulus dengan dependensi terkunci.

## 5. Rencana perbaikan berurutan

| Tahap | Isi | Temuan | Hasil yang dapat diperiksa |
|---|---|---|---|
| 0 (hari ini) | Guard DEMO fail-closed di semua jalur order; test regresi dari skrip bukti. Bind Docker ke loopback | F1, F4 | Skrip bukti berubah menjadi: start ditolak, `order_send` 0 kali |
| 1 | Hygiene: `git rm --cached` `.pyc`/`.db`, hapus scratch, ruff + pre-commit + CI, `ruff --fix` dan `ruff format` sebagai commit terpisah | F12-F14 | CI hijau; tidak ada berkas terlacak yang di-ignore |
| 2 | Kontrol dasar order: SL wajib, normalisasi volume, risk engine dipanggil, batas lot | F2, F7 | Test per aturan; tidak ada `sl=0.0` |
| 3 | Satukan eksekusi: satu service + adapter; idempotency; hapus `_active_positions` global; simulasi lewat DI | F3, F5 | `order_send` hanya di adapter (test arsitektur) |
| 4 | Pecah `submit_trade_order`/`close_position`; autopilot memakai kunci `(simbol, interval)` yang tepat dan gerbang | F6, F9 | Kompleksitas <= 10; cakupan jalur uang >= 80% |
| 5 | `MarketCache` ber-lock; naikkan dependensi + lockfile + `pip-audit` penuh | F8, F10, F11 | Test lulus pada versi baru |
| 6 | Frontend: pecah komponen, ESLint/Prettier, `tsc` dan e2e di CI | F16 | Build dan e2e hijau |

## 6. Keputusan yang diperlukan dari pemilik

1. **Mode PAPER:** dihapus (sesuai komentar di kode) atau dipertahankan (sesuai `AGENTS.md`)? Salah satu dokumen/kode harus diubah; agent tidak boleh memilih.
2. **Autopilot:** tetap ada sebagai jalur terpisah, atau dilebur ke service eksekusi tunggal (rekomendasi)?
3. **Nasib `signal_engine`, `ai_decision_engine`, dan `confluence_engine`** (tidak terpakai): diuji dan dihubungkan, atau dihapus.
4. **Autentikasi:** token sederhana cukup, atau perlu lebih?
5. Apakah Docker dipakai untuk menjalankan harian? Jika ya, F4 lebih mendesak.

## 7. Lampiran: cara mereproduksi

```
python -m venv .venv && .venv/bin/pip install -r requirements.txt pytest pytest-cov httpx python-dotenv
.venv/bin/python -m pytest -q --cov=app --cov=src --cov-report=term       # 67 lulus, total 58%
pip install ruff radon pip-audit pyright
ruff check .                                                              # 477 (bawaan)
radon cc app src -s -n C                                                  # 37 entri >= 11
pip-audit -r requirements.txt --no-deps --disable-pip                     # fastapi PYSEC-2024-38
PYTHONPATH=.:src python repro_F1_autopilot_real_account.py                # bukti F1
```
