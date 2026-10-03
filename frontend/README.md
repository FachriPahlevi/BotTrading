# Aurum Trading Workspace

Frontend React + TypeScript + Vite, Tailwind CSS v4, komponen shadcn/ui (Base UI, dibuat melalui CLI resmi), TanStack Query, dan KLineChart. Font Geist dibundel lokal. Tidak ada koneksi langsung browser ke AI provider atau broker.

## Development

Gunakan Node 20.19+ atau 22.12+ yang didukung Vite, lalu dari folder `frontend/`:

```bash
npm ci
npm run dev
```

Buka `http://127.0.0.1:5173/workspace/`. Dev server meneruskan `/api` dan `/health` ke FastAPI `http://127.0.0.1:8000`; backend/database harus sudah berjalan. Tidak perlu mengubah URL EA MT5.

## Build dan penyajian

```bash
npm run build
```

Build menghasilkan `frontend/dist`. FastAPI menyajikan hasilnya pada `/` dan `/workspace/` setelah startup ketika folder build tersedia. `/static/` tetap tersedia untuk aset/dashboard lama. Bila belum ada build, route `/` tetap memakai dashboard lama.

Dockerfile membangun frontend dengan Node lalu menyalin aset ke image Python. Dari root project, setelah memeriksa service lokal yang aktif:

```bash
docker compose build ai-trading
docker compose up -d --no-deps ai-trading
```

Restart API mengosongkan cache candle in-memory; tunggu kiriman EA berikutnya. Perintah tersebut tidak menjalankan worker trading atau melakukan ARM.

## Fitur yang terhubung

- GET `/api/market/chart`: chart candle, pilihan symbol/timeframe, polling 15 detik, indikator visual MA/EMA/BOLL/VOL/RSI/MACD, zoom/pan, garis/zona manual.
- GET `/api/dashboard/summary`: metrik sinyal, event risiko, regime, confluence, dan daftar sinyal. Klik sinyal menampilkan entry/SL yang disediakan API pada chart.
- GET `/health`: status API, bukan bukti koneksi terminal atau status worker.
- GET `/api/diagnostics`: menu sidebar **Log sistem**, polling 5 detik, diagnosis jalur EA/Python, usia cache per timeframe, event API/bridge, filter level/sumber/pencarian, detail request ID/status/durasi/alasan dan unduhan JSON hasil filter. Jeda menghentikan polling UI, bukan pencatatan server.
- GET `/api/account`: identitas akun, broker/server, jenis akun, saldo/equity/profit/margin, mata uang, leverage, kredit, dan jumlah posisi. Polling 15 detik; data gagal/stale disembunyikan.
- Kalkulator memakai balance MT5 × persen risiko lokal; tidak menyimpan konfigurasi, menghitung lot, atau mengirim order. Tidak ada modal simulasi bawaan.

Chart memakai library indikator untuk visualisasi; hasilnya bukan keputusan strategi backend. Angka confluence tidak disebut confidence AI. API belum memberi timeframe/timestamp sinyal, sehingga overlay sinyal ditampilkan pada timeframe pilihan dengan keterangan eksplisit. Tidak ada TP yang dikarang dari payload entry/SL.

Anotasi manual sementara dan hilang ketika chart diganti/reload. Analisis AI, kuota aktual provider, rincian posisi terminal, eksekusi, kalender, dan berita belum memiliki integrasi frontend-backend; kontrolnya dinonaktifkan atau ditandai belum tersedia. Data contoh hanya ada pada fixture pengujian, tidak ada fallback harga/news/sinyal palsu di aplikasi. Aktivasi kiriman akun dijelaskan pada [panduan akun MT5](../MT5_ACCOUNT_SETUP.md).

## Status dan kegagalan

Log sistem menyimpan 1.000 event terbaru dalam memori per proses API. Event lama terbuang saat batas tercapai dan seluruh log hilang saat restart; jumlah event terbuang dan waktu mulai sesi ditampilkan. Tidak mengimpor log Docker historis, worker terpisah, atau Journal/Experts Windows. Body/header/query request, saldo/identitas akun, URL bridge dan pesan exception mentah tidak dicatat. Error internal hanya memuat jenis exception dan lokasi kode tanpa nilai variabel. Endpoint log tidak mencatat pollingnya sendiri.

Request memiliki timeout 12 detik. Data chart divalidasi, dideduplikasi, dan diurutkan. Timestamp payload lebih dari 60 detik atau error refresh ditandai stale; data terakhir boleh tetap terlihat dengan penjelasan. Ini pemeriksaan freshness payload, belum pemeriksaan umur tick atau kepastian pasar sedang terbuka.

Polling chart 15 detik dan summary/health 30 detik mengikuti API saat ini; belum WebSocket. Pemilihan symbol tidak menyatakan discovery seluruh instrumen akun.

## Verifikasi

```bash
npx playwright install chromium
npm run test:e2e -- --workers=2
```

Test menjalankan Vite pada port 5178 dan memakai fixture API terisolasi untuk desktop/mobile: render chart, pilihan timeframe/symbol, indikator/overlay, calculator, tab, dialog/navigation, empty/error/stale, dan recovery. Test memastikan alur UI utama tidak membuat mutasi API. Screenshot pengujian memakai candle sintetis, bukan hasil trading atau feed Exness.

Konfigurasi shadcn ada di `components.json`; komponen di `src/components/ui/`. CLI bukan dependency runtime. CSS menggunakan variant Base UI yang diperlukan komponen ini; jika menambah komponen lewat CLI resmi, tinjau dependency dan perubahan CSS yang dihasilkan.
