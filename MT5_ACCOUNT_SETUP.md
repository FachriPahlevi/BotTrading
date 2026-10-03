# Data akun MT5 pada dashboard

Dashboard membaca akun yang sedang login di terminal: nama, login tersamar, broker, server, DEMO/REAL/CONTEST, mata uang, leverage, balance, equity, floating profit, credit, margin, free margin, margin level, dan jumlah posisi terbuka. Data REAL berarti tipe akun terminal, bukan aktivasi eksekusi REAL. Tidak ada perubahan akun, ARM, atau pengiriman order.

## Koneksi EA yang sudah digunakan

1. Salin versi terbaru `AurumMarketBridge.mq5` (v1.3) ke folder EA terminal MT5, lalu compile melalui MetaEditor.
2. Pasang ulang EA hasil compile pada chart dengan `ApiUrl` yang sama seperti koneksi candle sebelumnya. Pastikan alamat API tetap masuk daftar WebRequest yang diizinkan di MT5.
3. Biarkan `AccountApiUrl` kosong: EA otomatis mengganti akhiran `/api/mt5/candles` menjadi `/api/mt5/account`. Jika URL candle memakai pola lain, isi URL akun secara eksplisit.
4. Tunggu siklus timer 15 detik. Buka dashboard dan klik **Perbarui semua data**. Metadata dan saldo harus cocok dengan terminal, termasuk satuan mata uang akun.

EA tetap mengirim candle lewat jalur sebelumnya. Kiriman akun independen dari ketersediaan candle; kode tidak memakai `OrderSend`. Pastikan hanya satu terminal/akun mengirim data akun ke satu instance API, karena MVP ini menampilkan satu akun aktif dan cache terakhir menggantikan snapshot sebelumnya.

## Alternatif bridge Python

Jika sebelumnya memakai `MT5_BRIDGE_URL`, perbarui `mt5_bridge.py` pada mesin Windows yang sama lalu restart proses bridge dengan perintah yang sudah digunakan. Endpoint baru `GET /account` membaca `account_info`, `terminal_info`, dan `positions_get`. Kegagalan membaca posisi tidak dihitung sebagai nol posisi. API mengambil data dari bridge yang dikonfigurasi dan tidak fallback ke akun cache EA.

## Kontrak dan keterbatasan

Buka **Log sistem** di sidebar untuk melihat jalur koneksi, usia cache akun/candle dan status HTTP kiriman EA. `GET /health` yang sukses hanya membuktikan API berjalan. Jika candle M5 ada tetapi tua sementara akun/timeframe lain kosong, periksa EA yang terpasang dan timer, gunakan v1.3, pastikan `ApiUrl` menunjuk mesin API yang benar serta diizinkan WebRequest. EA v1.3 langsung mengirim M1/M5/M15/H1/H4/D1 ketika dipasang dan menulis hasil tiap timeframe di tab **Experts**. Respons EA berisi `instance_id`; cocokkan nilainya dengan **Instance API** di Log sistem. Nilai yang berbeda membuktikan EA dan dashboard menggunakan backend berbeda. Server hanya bisa mencatat request yang berhasil mencapai API; jika tidak ada POST sama sekali, lihat tab Experts/Journal MT5 untuk error jaringan/izin. Pada terminal di mesin berbeda, `127.0.0.1` menunjuk mesin terminal itu sendiri, bukan mesin API.

- `POST /api/mt5/account`: snapshot bertipe, angka finite, timestamp UTC eksplisit. Identitas dan field wajib tidak boleh hilang.
- `GET /api/account`: snapshot terbaru, `Cache-Control: no-store`; HTTP 503 bila belum ada data, terputus, atau lebih tua dari 60 detik. Timestamp lebih dari 10 detik di masa depan juga ditolak; sinkronkan jam kedua mesin.
- Polling akun tiap 15 detik. Saat refresh gagal atau snapshot usang, UI menyembunyikan nilai lama dan menonaktifkan hasil kalkulator risiko.
- Anggaran risiko = balance terminal × input persentase lokal. Bukan konfigurasi engine, ukuran lot, atau izin submit order. Currency broker seperti USC ditampilkan apa adanya tanpa diasumsikan USD.
- Cache akun hanya di memori satu proses dan hilang saat API restart. Tidak ada data akun yang ditulis ke dokumentasi/log. Integrasi ini mengikuti akses jaringan API lokal yang sudah ada; belum ada sistem login multi-user atau pemisahan akun per pengguna.
- Python bridge diuji dengan fake MT5; EA harus dicompile/diperiksa di Windows. Pengujian Linux tidak membuktikan koneksi terminal aktual.

Referensi field: [MetaQuotes account properties](https://www.mql5.com/en/docs/constants/environment_state/accountinformation), [terminal_info Python](https://www.mql5.com/en/docs/python_metatrader5/mt5terminalinfo_py).
