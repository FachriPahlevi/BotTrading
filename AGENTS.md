# AI Trading Engineering Guide

## Baca sebelum bekerja

1. Baca `PROJECT_CONTEXT.md`, bagian Current Handoff di `WORKLOG.md`, dan tahap relevan di `IMPROVEMENT_PLAN.md`.
2. Pastikan direktori kerja dan file target. Jika tersedia Git, periksa branch dan `git status --short`. Saat panduan ini dibuat, folder ini belum merupakan repository Git; jangan menginisialisasi Git hanya untuk memenuhi pemeriksaan.
3. Telusuri pemanggil, model, konfigurasi, penyimpanan, dan pengujian terkait sebelum mengubah fungsi. Cari implementasi yang sudah ada sebelum menambah engine atau dashboard baru.
4. Perlakukan perubahan yang sudah ada sebagai pekerjaan pengguna. Jangan menimpa, menghapus, atau meresetnya tanpa instruksi yang sesuai.

## Pembagian dokumentasi

- `AGENTS.md`: aturan pengerjaan yang berlaku lintas sesi.
- `PROJECT_CONTEXT.md`: fakta implementasi, peta sistem, batasan, dan arah arsitektur.
- `IMPROVEMENT_PLAN.md`: backlog, urutan dependensi, dan kriteria selesai.
- `WORKLOG.md`: pekerjaan aktual, verifikasi, blocker, dan langkah berikutnya.
- `TDS_v1.0.md`: referensi desain awal, bukan bukti fitur sudah berjalan.
- `LOCAL_EXECUTION_LOG.md`: catatan historis; klaim kelulusannya harus dibandingkan dengan kode dan bukti pengujian terbaru.

Instruksi pengguna saat ini didahulukan. Bedakan fakta terverifikasi, laporan pengguna, target desain, dan asumsi. Bila sumber bertentangan, catat perbedaannya; jangan diam-diam menganggap desain atau log sebagai perilaku aktual.

## Aturan implementasi

- Kerjakan perubahan terkecil yang menyelesaikan kebutuhan secara utuh. Hindari pembaruan dependency, redesign, formatting massal, atau refactor yang tidak diperlukan.
- Pertahankan gaya file yang disentuh. Gunakan `apply_patch` untuk edit manual dan hindari churn pada file lain.
- Jangan menambah duplikasi perhitungan indikator, strategi, risiko, atau konfigurasi. Gunakan satu implementasi domain yang dapat dipanggil worker, API, dan backtest.
- Validasi kontrak request/response dan seluruh alur data sebelum mengubah API atau UI. Data kosong, kedaluwarsa, belum tersedia, dan error harus dapat dibedakan dari nilai nol yang sah.
- Gunakan model bertipe pada batas antarkomponen. Validasi symbol, timeframe, timestamp, angka finite, dan konsistensi OHLC pada penerimaan data.
- Jangan mengubah strategi, ambang risiko, broker, atau mode akun secara diam-diam sebagai bagian dari perbaikan UI/infrastruktur.
- Pertahankan koneksi MT5 yang sudah bekerja. Uji perubahan bridge secara terpisah dan catat metode koneksi yang diuji.
- Permintaan review tidak otomatis berarti mengubah kode. Roadmap adalah rencana, bukan izin menjalankan seluruh backlog sekaligus.

## Invarian trading yang harus ditegakkan

Bagian ini adalah persyaratan; beberapa belum dipenuhi kode saat dokumen dibuat. Lihat P0 pada roadmap.

- PAPER boleh membaca data MT5, tetapi tidak boleh memanggil pengiriman order terminal. Penyedia market data dan pelaksana order harus dapat dipilih secara terpisah.
- Eksekusi DEMO memerlukan ARM eksplisit pada sesi berjalan dan pemeriksaan akun aktual sebelum submit. Restart tidak boleh otomatis mengaktifkan ARM. Pemblokiran REAL/CONTEST pada MVP tetap dipertahankan.
- Order UNKNOWN/SUBMITTING yang belum terselesaikan harus menghalangi order baru; status PAUSED tidak boleh tertimpa oleh inisialisasi atau ARM.
- Bedakan penolakan pasti, hasil submit yang ambigu, dan partial fill. Rekonsiliasi harus mencegah pengiriman ulang order yang mungkin sudah diterima broker.
- Kegagalan membaca posisi/akun/history tidak boleh dianggap sebagai hasil kosong yang valid untuk meloloskan eksekusi.
- Keputusan strategi memakai candle tertutup, data cukup, dan identitas akun/server/symbol yang tepat. Marker indikator tidak boleh dipresentasikan sebagai order aktual.
- Risk check harus menjalankan pemeriksaan nyata, bukan flag kelulusan tetap. Lot mengikuti spesifikasi broker; data risiko yang tidak valid harus menolak order.
- Gunakan UTC yang eksplisit pada data internal dan clock yang dapat dikendalikan dalam simulasi. Konversi zona waktu hanya secara sengaja.
- Jangan menaruh kredensial, token, atau data akun sensitif dalam dokumentasi, fixture, maupun log.

## Verifikasi dan definition of done

- Setelah perubahan perilaku, jalankan pengujian relevan. Untuk eksekusi/risk/backtest, sertakan regresi yang membuktikan skenario gagal sebelumnya dan hasil yang diharapkan.
- Pengujian otomatis harus memakai mock/fake atau simulator, tanpa mengirim order terminal. Pengujian terminal yang mengirim order hanya dijalankan bila diminta pengguna, dengan pembatasan akun DEMO tetap aktif.
- Jangan mengklaim pengujian mock membuktikan integrasi Windows/MT5. Laporkan lingkungan, perintah, hasil aktual, dan pemeriksaan yang belum dilakukan.
- Untuk dokumentasi saja, periksa konsistensi fakta, tautan lokal, status roadmap, dan file yang berubah; tidak perlu menjalankan worker atau test trading.
- Jika Git tersedia, periksa `git diff --check`, diff, dan status akhir. Jika tidak, periksa file yang dibuat/diubah secara langsung dan laporkan keterbatasannya.
- Perbarui `WORKLOG.md` setelah pekerjaan bermakna. Ubah status roadmap hanya dengan bukti; perbarui konteks bila arsitektur/kontrak berubah.
- Laporan akhir mencakup hasil, file utama, verifikasi, dan keterbatasan penting. Jangan menyebut tugas selesai bila acceptance criteria belum terpenuhi.

## Operasi dan batas lingkup

- Jangan menyalakan worker trading, melakukan ARM, memigrasikan/menghapus data, mengganti akun terminal, atau melakukan deployment sebagai efek samping tugas dokumentasi/review.
- Jangan stage, commit, push, atau membuat repository kecuali diminta atau termasuk lingkup tugas yang jelas.
- Gunakan kembali otorisasi pengguna yang sudah diberikan untuk pekerjaan yang sama; tidak perlu meminta persetujuan ulang untuk edit lokal yang sudah diminta.
