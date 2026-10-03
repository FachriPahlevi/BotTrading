# Local Trading Agent untuk MT5 + Exness (MVP v1.0)

## Frontend Aurum terbaru

Dashboard baru memakai **React + TypeScript + Vite, Tailwind CSS, shadcn/ui, dan KLineChart**. Menyediakan chart interaktif, gambar manual, level entry/SL dari sinyal tersimpan, ringkasan aktivitas, data akun MT5, kalkulator berdasarkan saldo terminal, serta status loading/error/stale. Analisis AI dan pengiriman order belum diaktifkan melalui frontend ini. Untuk mengirim informasi pengguna/saldo dari terminal, ikuti [panduan akun MT5](MT5_ACCOUNT_SETUP.md).

Panduan development, build, dan browser test: [frontend/README.md](frontend/README.md). Build Docker menyertakan frontend; FastAPI menyajikannya pada `/` dan `/workspace/`. Frontend development dapat diakses pada `http://127.0.0.1:5173/workspace/` melalui `npm run dev` dari folder `frontend/`.

## Dokumentasi Pengerjaan

- [AGENTS.md](AGENTS.md): aturan kerja dan verifikasi untuk setiap sesi.
- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md): peta aplikasi, fakta implementasi, dan temuan terbuka.
- [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md): kumpulan kebutuhan dan desain AI trading, chart live beranotasi, scanner, profil modal/risiko, eksekusi manual/otomatis, serta roadmap P0–P8 dan kriteria selesai.
- [WORKLOG.md](WORKLOG.md): status pekerjaan dan kelanjutan sesi.

Untuk memilih pekerjaan berikutnya, gunakan **Prioritas 1–7 dan checklist #1–#33** pada awal `IMPROVEMENT_PLAN.md`. Rekomendasi awal adalah fondasi sistem, kemudian analisis AI pada chart aktif dengan gambar; P0–P8 tetap menjadi kelompok teknis untuk rincian pengujian.

Rancangan MVP cloud di `IMPROVEMENT_PLAN.md` mencakup kandidat Gemini API, pemanfaatan langganan yang perlu diverifikasi, anotasi chart, eksekusi manual/AI, serta berita terbaru dan kalender ekonomi. Ini rencana pengembangan; provider belum diaktifkan.

**Catatan review 2026-10-03:** uraian MVP di bawah dan `LOCAL_EXECUTION_LOG.md` memuat klaim implementasi terdahulu. Review sumber menemukan pemisahan PAPER/MT5, pause rekonsiliasi, dan beberapa fitur analisis belum memenuhi perilaku yang dinyatakan. Lihat konteks dan roadmap sebelum menjadikan klaim tersebut jaminan eksekusi. Koneksi MT5 dilaporkan berhasil oleh pengguna; integrasi terminal tidak diuji ulang dalam review ini.

Aplikasi lokal trading otomatis terjelaskan (*explainable automated trading agent*) yang terintegrasi dengan MetaTrader 5 (MT5) dan broker Exness.

> **Status Safety & Otomatisasi**: Mode default aplikasi adalah **PAPER** (simulasi mock offline). Eksekusi ke akun **DEMO** Exness hanya aktif setelah pengguna melakukan `ARM DEMO` secara eksplisit melalui UI/CLI. Akun **REAL / CONTEST** diblokir secara mutlak pada MVP ini.

---

## 🚀 Fitur Utama

- **Zero Cloud & Zero API Cost**: 100% berjalan di mesin lokal Anda. Tidak membutuhkan API LLM berbayar atau database server eksternal.
- **Offline Mock & Paper Broker**: Dapat diuji dan dijalankan sepenuhnya di Linux/macOS/Windows tanpa membutuhkan instalasi MT5 terminal atau koneksi internet.
- **Strategi Deterministik (EMA Crossover + ATR Filter)**:
  - BUY jika `EMA20(t-1) <= EMA50(t-1)`, `EMA20(t) > EMA50(t)`, dan `close(t) > EMA200(t)`.
  - SELL jika `EMA20(t-1) >= EMA50(t-1)`, `EMA20(t) < EMA50(t)`, dan `close(t) < EMA200(t)`.
  - HOLD selain kondisi di atas.
- **Risk Engine Ketat**:
  - Ukuran posisi otomatis berdasarkan alokasi risiko **0.5% equity**.
  - Lot dibulatkan ke bawah (*round down*) sesuai `volume_step`. Jika di bawah `volume_min`, order ditolak (*SKIP*).
  - Stop Loss berjarak 2 ATR; Take Profit berjarak 2x jarak risiko aktual.
  - Filter Spread: Menolak order jika $(\text{Ask} - \text{Bid}) / \text{ATR} > 0.10$.
  - **Persistent Daily Loss Guard (2%)** & **Drawdown Guard (5%)** dengan kunci (*risk lock*) otomatis tersimpan di SQLite.
- **State Machine & Idempotensi**:
  - Mencegah *double ordering* saat koneksi terputus atau restart menggunakan *idempotency key* unik di SQLite.
  - Single-worker process lock (`trading_agent.lock`) untuk mencegah pembentukan dua pengirim order simultaneously.
- **Dashboard Streamlit & CLI Lengkap**.

---

## 🛠️ Panduan Instalasi & Penggunaan

### 1. Prasyarat System
- Python 3.11 atau lebih tinggi
- Linux / macOS (untuk Mock & Backtest) atau Windows x64 (untuk koneksi MT5 Desktop)

### 2. Quick Start (Paper Mode / Offline)
Jalankan pemeriksaan kesehatan sistem (*doctor check*):
```bash
python3 -m trading_agent.cli doctor
```

Jalankan backtest historis sintetis:
```bash
python3 -m trading_agent.cli backtest
```

Jalankan worker trading dalam mode **PAPER**:
```bash
python3 -m trading_agent.cli run --mode paper
```

Jalankan Dashboard Streamlit Lokal:
```bash
python3 -m streamlit run src/trading_agent/ui/app.py --server.address 127.0.0.1
```
Akses dashboard di browser melalui: `http://127.0.0.1:8501`

---

## 💻 Panduan Integrasi MetaTrader 5 (Windows)

Untuk menghubungkan agent ke terminal MT5 Exness nyata di Windows:

1. **Buka Terminal MT5 Desktop**:
   - Login ke Akun **DEMO** Exness Anda.
   - Pastikan opsi **Allow Algo Trading** (Izinkan Trading Otomatis) diaktifkan di menu `Tools -> Options -> Expert Advisors`.
2. **Instalasi Package MetaTrader5 (Windows)**:
   ```cmd
   pip install MetaTrader5
   ```
3. **Pilih Symbol**:
   - Pastikan symbol sesuai suffix akun Exness Anda (misal `XAUUSDm` atau `XAUUSD`).
4. **Jalankan Agent**:
   ```cmd
   python -m trading_agent.cli doctor --config config.yaml
   python -m trading_agent.cli run --mode demo --config config.yaml
   ```

---

## 📊 Perintah CLI

- `python -m trading_agent.cli doctor`: Memeriksa kemampuan environment, permission, dan status koneksi terminal.
- `python -m trading_agent.cli symbols`: Menampilkan spesifikasi instrumen pasar dari terminal/mock.
- `python -m trading_agent.cli backtest --csv data.csv --export trades.csv`: Menjalankan backtest historis dari file CSV dan mengekspor hasilnya.
- `python -m trading_agent.cli run --mode paper`: Menjalankan worker agent dalam mode simulasi paper.

---

## 🛡️ Audit & Keamanan (Safety Guarantees)

1. **Dilarang Menulis Kredensial**: Password akun tidak pernah disimpan ke YAML, database, atau log. Kredensial dibaca langsung dari sesi terminal MT5 aktif.
2. **Strict Account Filter**: Apabila akun bernilai `REAL` atau `CONTEST`, seluruh fungsi submit order akan langsung melemparkan error `PermissionError`.
3. **Audit Trail**: Seluruh pergeseran state order dan event eksekusi dicatat secara *append-only* di SQLite (`execution_events`).
