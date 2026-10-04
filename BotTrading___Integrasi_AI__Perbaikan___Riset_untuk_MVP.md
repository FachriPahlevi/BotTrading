# BotTrading — Integrasi AI, Perbaikan & Riset untuk MVP

Oct 4, 2026 · @fachri

## Ringkasan

Jadikan AI sebagai **penyaring dan penjelas** atas sinyal deterministik yang sudah ada, bukan penentu arah buy/sell. Riset terbaru (StockBench 2025 dan benchmark look-ahead 2026) menunjukkan agen LLM yang memutuskan arah jarang mengalahkan strategi sederhana, dan backtest-nya mudah menipu. Pengurangan loss yang realistis datang dari filter (sesi, spread, news, regime), SL dan ukuran posisi yang disiplin, serta validasi yang jujur, bukan dari model yang "lebih pintar".

Tiga hal harus beres sebelum AI dinyalakan:

1. **Satu sumber kebenaran data dan status.** Dokumen repo saling bertentangan soal P0/P1, dan per 3 Okt 2026 endpoint akun serta chart H1 masih 503 karena EA belum mengirim data.
2. **Backtest yang bisa dipercaya.** P2 belum dimulai; tanpa ini tidak ada cara membuktikan AI memperbaiki hasil.
3. **Angka baseline.** Belum ada win rate, expectancy, atau drawdown strategi EMA dasar di dokumen mana pun.

**MVP yang disarankan:** analisis satu simbol (XAUUSD) → AI memberi verdict TAKE / SKIP / WAIT atas sinyal EMA beserta alasan dan anotasi chart → risk engine tetap berwenang penuh → hanya mode PAPER. DEMO otomatis baru dibuka setelah forward test PAPER lulus kriteria yang ditetapkan *sebelum* melihat hasil.

Di samping AI, MVP juga memuat modul notifikasi momentum tanpa AI: detektor aturan untuk candle dan indikator, gambar otomatis di chart, dan penyimpanan gambar yang bisa dipilih untuk ditampilkan (lihat bagian "Notifikasi momentum dan gambar otomatis"). Modul ini hanya memberi tahu; entry tetap diputuskan sinyal primer dan risk engine.

Tidak ada desain yang bisa menjamin tidak minus. Target yang bisa diukur: lebih sedikit trade buruk, drawdown terkendali, dan bukti statistik sebelum uang nyata dipakai.

## Kondisi repo saat ini

Repo sudah punya fondasi yang berguna (risk engine, state machine order, frontend), tetapi status sebenarnya tertinggal dari yang tertulis di checklist. Penilaian ini berdasar README, PROJECT\_CONTEXT, IMPROVEMENT\_PLAN, WORKLOG, dan config.yaml; saya belum membaca kode sumber baris per baris, jadi klaim tentang perilaku kode mengikuti dokumen itu.

| Area | Kondisi menurut dokumen repo | Dampak ke MVP AI |
| --- | --- | --- |
| Strategi inti | EMA20/50 crossover dengan filter EMA200, SL 2 ATR, TP 2R, tolak order jika spread/ATR > 0,10 | Strategi trend-following sederhana. Di pasar sideways biasanya banyak sinyal palsu (dugaan saya, harus dibuktikan backtest). Cocok dijadikan sinyal primer untuk filter AI |
| Parameter risiko | Core: 0,5% per trade, 2% rugi harian, 5% drawdown. config.yaml web: 1% per trade, 3% harian, 5% mingguan, 20% drawdown | Dua set angka berbeda; drawdown 20% terlalu longgar untuk tahap uji. Satukan jadi satu sumber |
| Dua jalur belum menyatu | Web (FastAPI + PostgreSQL, marker dari MACD) dan worker core (SQLite, EMA/ATR) | Dashboard bisa menampilkan sinyal yang bukan berasal dari worker |
| Data live | Per 3 Okt: /api/account 503, chart H1 503, cache hanya M5. EA v1.3 belum dikompilasi/dipasang di MT5 | AI tidak punya data masuk. Ini blocker nomor satu |
| Status klaim | IMPROVEMENT\_PLAN mencentang P0/P1 selesai, tetapi README dan PROJECT\_CONTEXT menyatakan klaim itu belum diverifikasi ulang. Bukti P0 hanya 7 unit test offline | Anggap F01–F10 belum tertutup sampai ada regresi dengan fake MT5 dan uji DEMO |
| Backtest | P2 belum dimulai: entry t+1, spread, slippage, komisi belum benar (F07, F08) | Angka backtest saat ini tidak boleh dipakai menilai AI |
| Hasil performa | Tidak ada win rate, expectancy, atau drawdown di dokumen mana pun | Tidak ada baseline pembanding |
| AI | Belum ada. Engine web memakai bobot confluence (fundamental 0,15, sentimen 0,10) tanpa sumber data, dan ambang confidence 60/90 | Bobot dan ambang itu bukan hasil kalibrasi; jangan dibaca sebagai probabilitas menang |
| Frontend | React + KLineChart selesai, 18 tes browser lulus dengan fixture; tombol AI belum aktif | Siap menerima anotasi; tinggal kontrak datanya |
| Higiene repo | trading\_agent.db, **pycache**, scratch\_test\*.py, dan pandas\_ta.py ada di repo publik (1 commit) | Periksa isi file .db (bisa memuat data order/akun), tambah .gitignore, pindahkan shim pandas\_ta |

## Apa kata riset tentang AI untuk trading

Bukti yang ada mendukung AI sebagai filter dan penjelas, bukan peramal arah. Sebagian besar studi memakai saham atau data harian, jadi bukti untuk XAUUSD intraday bersifat tidak langsung; anggap ini arah desain, bukan jaminan.

| Temuan | Sumber | Implikasi untuk bot ini |
| --- | --- | --- |
| Agen LLM yang trading saham harian umumnya gagal mengalahkan buy-and-hold, dan skor tanya-jawab finansial tidak berarti untung. Studi ini tidak memodelkan biaya dan slippage, jadi hasil nyata bisa lebih buruk | [StockBench (arXiv 2510.02209)](https://arxiv.org/abs/2510.02209) | Jangan beri LLM wewenang menentukan arah. Selalu bandingkan dengan baseline EMA tanpa AI |
| Backtest LLM pada periode sebelum tanggal cutoff model menggelembung karena model "mengingat" hasil; return runtuh setelah cutoff. Satu studi melaporkan koreksi menurunkan return in-sample hingga 67,1% pada tanggal yang dihafal | [Look-Ahead-Bench (arXiv 2601.13770)](https://arxiv.org/pdf/2601.13770), [FinCAD (arXiv 2605.24564)](https://www.emergentmind.com/papers/2605.24564) | Backtest dengan LLM pada data lama tidak valid. Backtest historis pakai strategi deterministik; LLM hanya dinilai lewat forward test yang dicatat sebelum hasil ada |
| Detail eksekusi seperti masuk di close sinyal vs harga berikutnya, atau mengabaikan biaya, bisa membalik strategi dari terlihat untung menjadi tidak layak | [Fonseca, arXiv 2607.04958](https://arxiv.org/pdf/2607.04958) (merangkum literatur) | Perbaikan F07/F08 (entry t+1, spread, slippage) bukan kosmetik; ini syarat angka apa pun bisa dipercaya |
| Meta-labeling: model kedua belajar kapan sinyal primer layak diambil dan berapa ukurannya, bukan arahnya. Label memakai triple barrier (TP, SL, atau batas waktu, mana yang tersentuh duluan), dengan purging dan embargo agar data uji tidak bocor | [Hudson & Thames](https://hudsonthames.org/does-meta-labeling-add-to-signal-efficacy/), [LuxAlgo](https://www.luxalgo.com/library/concept/label-definition-and-prediction-horizon.md) | Cocok persis: EMA crossover = sinyal primer, AI/ML = filter TAKE/SKIP. Ini jalur paling masuk akal untuk mengurangi trade minus |
| Spread XAUUSD tidak konstan: melebar saat news dan jam sepi; sebagian besar range harian terbentuk saat London–New York; NFP, CPI, FOMC memicu lonjakan spread dan slippage. Sumbernya blog praktisi dan vendor EA, jadi kualitas buktinya rendah | [MQL5 blog](https://www.mql5.com/en/blogs/post/773690), [DEV Community](https://dev.to/xauusdrobot/the-xauusd-spread-the-hidden-cost-that-quietly-decides-your-trading-results-574d) | Filter sesi, spread, dan news kemungkinan menurunkan loss lebih banyak daripada model baru. Ukur sendiri spread nyata di akun Exness sebelum menetapkan ambang |

**Kesimpulan desain:** pindahkan kecerdasan ke tempat yang buktinya paling kuat (filter, penentuan kapan tidak trading, sizing, manajemen risiko), dan pakai LLM untuk membaca konteks berita dan menjelaskan keputusan, bukan untuk menebak harga.

## Indikator, jam, dan musim: apa yang terbukti

**Tidak ada indikator, jam, atau musim yang terbukti memberi win rate di atas 90% secara berkelanjutan, dan saya tidak menemukan studi yang menunjukkannya.** Win rate setinggi itu hampir selalu hasil struktur risiko yang buruk. Targetnya sebaiknya diganti: expectancy positif setelah biaya, dengan drawdown terkendali.

### Mengapa win rate 90% menyesatkan

Expectancy per trade = (win rate × rata-rata menang) − (loss rate × rata-rata kalah). Hitungan dengan angka yang bisa Anda periksa sendiri:

| Skenario | Hitungan | Hasil per trade |
| --- | --- | --- |
| Menang 90%, rata-rata menang $5, rata-rata kalah $50 | 0,9 × 5 − 0,1 × 50 | −$0,50 (rugi) |
| Menang 45%, reward:risk 2:1 | 0,45 × 2R − 0,55 × 1R | +0,35R (untung) |
| Strategi bot saat ini (TP = 2R), titik impas | 1 ÷ (1 + 2) | Win rate 33,3% sebelum biaya |
| Agar win rate 90% impas | rata-rata menang harus ≥ 1/9 dari rata-rata kalah | 0,11 × risiko |

Win rate bisa dinaikkan sembarangan dengan TP dekat dan SL jauh; itu hanya menukar frekuensi menang dengan ukuran kekalahan. Sistem ber-win-rate 90% di pasar retail umumnya grid atau martingale: menumpuk posisi rugi sambil menunggu harga kembali, sehingga satu kerugian bisa menghabiskan hampir seluruh ekuitas ([MQL5](https://www.mql5.com/en/blogs/post/772142), [DailyFX](https://www.dailyfx.com/forex/education/trading_tips/trend_of_the_day/2013/06/18/What_is_a_Good_Win_Ratio.html), [Trade Ideas](https://www.trade-ideas.com/2025/09/13/why-a-90-win-rate-isnt-the-flex-you-think-it-is-the-real-metrics-that-matter-in-trading/)). Iklan bot dengan klaim 85–90% hampir selalu menyembunyikan rasio reward:risk.

### Bukti untuk indikator teknikal di forex dan emas

Saya tidak menemukan studi bereputasi yang menguji indikator khusus XAUUSD intraday; yang ada adalah studi forex dan lintas aset, sebagian skripsi mahasiswa (kualitas bukti lebih rendah).

| Studi | Temuan | Arti untuk bot |
| --- | --- | --- |
| [Coakley, Marzano, Nankervis 2016](https://repository.essex.ac.uk/16362/): 113.148 aturan, 22 mata uang, 1996–2015 | Aturan terbaik mencapai return tahunan hingga 30%. Aturan moving average tradisional nyaris tidak signifikan di 2006–2015; aturan Bollinger dan RSI tetap menguntungkan di sub-periode terbaru. Mereka menguji dengan koreksi data snooping | Angka 30% adalah yang terbaik dari ratusan ribu aturan, bukan hasil tipikal. Ringkasan yang saya baca tidak menyebut biaya transaksi |
| [Ringkasan studi Kyziropoulos dkk. 2022](https://harbourfrontquant.substack.com/p/technical-trading-in-the-foreign) (replikasi aturan teknikal FX sampai April 2020) | Profit in-sample signifikan, tetapi out-of-sample menghilang sebelum biaya dan lenyap setelah biaya. Profit terkait erat dengan momentum deret waktu | EMA crossover ikut bergantung pada rezim tren; tanpa tren, edge-nya hilang |
| [Skripsi Lund](https://lup.lub.lu.se/student-papers/record/8905915): MA, MACD, RSI pada 14 deret return, 2000–2016 | Semua indikator buruk dalam profit dan daya prediksi | Konsisten dengan temuan di atas, kualitas bukti rendah |
| [Skripsi Iscte 2019](https://repositorio.iscte-iul.pt/handle/10071/19549): MACD dan RSI pada 5 pasangan forex, 2009–2018 | Hasil ambigu, bergantung pada pasangan mata uang dan periode | Satu indikator tidak stabil antar kondisi pasar |
| [Studi RSI pada USD/CHF](https://c.mql5.com/forextsd/forum/221/An%20investigation%20of%20the%20relative%20strength%20index.pdf) | Dengan ambang 30/70, RSI tidak menghasilkan profit, malah sedikit rugi | RSI mentah sebagai sinyal tunggal tidak layak |

Kesimpulannya: tidak ada "indikator paling powerful". Yang konsisten muncul adalah edge kecil, tidak stabil antar periode, tergantung momentum, dan mudah hilang oleh biaya. Karena itu indikator lebih tepat dipakai sebagai fitur dan filter, bukan sumber akurasi 90%.

### Di mana win rate tinggi benar-benar muncul, dan harganya

Win rate 65–82% ditemukan pada beberapa strategi, tetapi tidak satu pun yang saya temukan mencapai 90%, dan semuanya datang dengan syarat. Semua angka di bawah berasal dari blog, repo GitHub, atau dokumentasi framework yang tidak saya replikasi, jadi baca sebagai klaim, bukan fakta yang sudah diaudit.

| Strategi / indikator | Win rate dilaporkan | Fakta pendamping | Kualitas bukti |
| --- | --- | --- | --- |
| RSI(2) gaya Connors pada XAUUSD harian 2008–2025 ([dokumentasi Backtrader](https://backtrader.readthedocs.io/en/latest/strategies-series/en/02-mean-reversion.html)) | 67,85% (311 trade). Varian komposit 78,95%, tetapi hanya 38 trade dalam 17 tahun | Total return +70,34% selama 17 tahun, max drawdown 17,37%, SQN 2,06. Varian Connors lain pada emas harian: 66,89% (148 trade), Sharpe 0,566, drawdown 30,35% | Backtest bawaan framework, bukan audit. Data harian, bukan M15/H1; spread dan slippage intraday tidak dibahas |
| RSI(2) pada SPY 2000–2024 ([Backtest Everything](https://www.backtesteverything.com/blog/rsi-mean-reversion-strategy-complete-backtest)) | 73% (387 trade) | Profit factor 1,65, hanya 22% waktu berada di pasar. Win rate 81% di bull market 2009–2021, tetapi 58% di bear market | Blog; satu aset ekuitas |
| RSI(2), peringatan ([QuantifiedStrategies](https://www.quantifiedstrategies.com/rsi-2-strategy/)) | 70–80% pada saham | Win rate turun di bawah 60% saat krisis 2008 dan Maret 2020. Situs yang sama menulis bahwa pada forex dan komoditas yang trending hasilnya di bawah 50% | Bertentangan dengan angka Backtrader pada emas harian; anggap belum pasti dan uji sendiri |
| Bollinger Bands (20,2), data sejak 1928 ([NewTrading](https://www.newtrading.io/best-technical-indicators/)) | 74,32% in-sample, 81,25% out-of-sample | Rasio rata-rata menang terhadap rata-rata kalah hanya 0,77 dan 0,72: satu kerugian rata-rata setara sekitar 1,3–1,4 kali satu kemenangan rata-rata | Blog; kemungkinan indeks saham AS (cuplikan yang saya baca tidak menyebutnya); label kolom saya tafsirkan sendiri |
| Liquidity sweep PDH/PDL pada XAUUSD ([repo GitHub](https://github.com/ikeawesom/xauusd-backtest)) | 69–71% pada 1 menit sampai 1 jam; 61% pada 4 jam | Penulisnya sendiri menyebut hasil tanpa spread dan komisi | Repo pribadi; tidak ada pengujian out-of-sample |
| "Goldmine" dan Smart Money Concepts pada XAUUSD ([Medium](https://medium.com/coinmonks/how-to-backtest-the-goldmine-strategy-for-consistent-gold-profits-bfa20d0925eb), [Scribd](https://www.scribd.com/document/882341069/XAUUSD-Strategy-Backtest-Report-1)) | 82% (150 trade, 2018–2025) dan 75–77% | Tidak ada rincian biaya maupun rasio menang/kalah | Rendah; tulisan penjual metode, tidak bisa diverifikasi |
| MACD, ADX, Supertrend ([NewTrading](https://www.newtrading.io/best-technical-indicators/), [Liberated Stock Trader](https://www.liberatedstocktrader.com/supertrend-indicator/)) | MACD sekitar 43%, ADX sekitar 54%, Supertrend sekitar 42–43% | Rasio menang/kalah MACD sekitar 2,0 dan ADX sekitar 1,2. Supertrend: expectancy 0,21–0,24 dan tidak profitable untuk day trading | Blog; data saham |

**Pola yang konsisten:** win rate tinggi hampir selalu berpasangan dengan rasio menang/kalah di bawah 1 atau drawdown dua digit, sedangkan indikator ber-win-rate rendah (MACD) justru punya rasio sekitar 2. Ini persis hitungan expectancy di atas. Tidak ada baris dalam tabel yang menunjukkan win rate 90% dengan expectancy sehat setelah biaya.

**Konteks hasil trader ritel nyata.** ESMA menemukan 74–89% akun CFD ritel merugi, dengan metodologi yang memasukkan biaya dan komisi; FCA Inggris sekitar 80% merugi ([daytrading.com](https://www.daytrading.com/safety/which-countries-have-the-most-profitable-retail-traders)). Ringkasan lintas regulator di situs yang sama menyebut sekitar 32% akun ritel CFD di Australia untung setelah biaya (FY2024) dan sekitar 33% akun forex non-diskresioner di AS. Satu sumber sekunder menyebut studi atas 25.000 trader di mana 65% punya win rate di atas 50% tetapi 82% di antaranya tetap rugi ([10PM Trader](https://10pmtrader.com/why-retail-traders-lose-money/)); kualitas buktinya rendah dan tidak saya verifikasi, tetapi konsisten dengan hitungan expectancy.

### Jam dan hari

- Sesi London–New York (sekitar 13:00–16:00 GMT) adalah jendela likuiditas dan volatilitas tertinggi untuk emas dan mayoritas pasangan forex; sesi Asia cenderung lebih sepi ([MQL5](https://www.mql5.com/en/blogs/post/772898)). Volatilitas intraday XAUUSD naik saat sesi New York aktif ([Quant Hedge](https://quanthedge.substack.com/p/seasonality-of-intraday-volatility)). Volatilitas tinggi berarti gerakan lebih besar dan spread lebih rapat, bukan arah yang lebih mudah ditebak.
- Skripsi CBS 2019 pada futures emas COMEX menemukan pola intraday berbentuk topi: emas naik pada jam Asia timur dan turun di sisa hari. Strategi yang mengeksploitasi pola ini unggul tanpa biaya (Sharpe sampai 1,61), tetapi dengan biaya transaksi kalah dari pasar walau masih ada sedikit profit ([CBS](https://research.cbs.dk/en/studentProjects/gold-price-dynamics-around-the-clock/)). Ini futures, bukan CFD Exness.
- Efek hari tidak konsisten antar studi: satu studi 2016 menemukan Jumat positif dan Selasa negatif signifikan di pasar emas Tokyo, London, dan New York ([Banks and Bank Systems](https://businessperspectives.org/publishing-policies2/weekday-effects-on-gold-tokyo-london-and-new-york-markets)); studi Shanghai Gold Exchange menemukan Senin positif dan Selasa negatif ([RePEc](https://ideas.repec.org/p/hal/journl/hal-02905216.html)).

### Teknik berbasis waktu dan event (XAUUSD)

| Teknik | Temuan | Catatan |
| --- | --- | --- |
| Breakout range Asia saat London buka | Backtest GitHub pada EURUSD, GBPUSD, GBPJPY: win rate sekitar 50–55% dengan TP 1,5–3R ([repo](https://github.com/MHZardary/london-strategy-backtest)). Simulasi 24 bulan di ForexCracked: 58–65% dengan RR 1:1,5 sampai 1:2,5, spread 1 pip, slippage 0,5 pip, filter lebar range 20–60 pip dan EMA50 H1 ([ForexCracked](https://www.forexcracked.com/trading-lab/london-session-breakout/)). Untuk XAUUSD, artikel FXNX menyebut win rate realistis sekitar 45% dengan RR 1:2 sampai 1:3 ([FXNX](https://fxnx.com/en/blog/xauusd-daily-breakout-strategy-why-a-45-win-rate)) | Blog dan simulasi, sebagian pada pasangan mata uang; belum ada studi peer-review. Edge yang diharapkan ada di rasio reward:risk, bukan di win rate |
| Breakout palsu di emas | Analisis ForTraders atas data intraday Januari–Juni 2026: sekitar 62% breakout 5 menit pada XAUUSD gagal (lebih dari 6.500 breakout), tertinggi di antara aset yang diuji. Sapuan di atas atau bawah range Asia sebelum London sering berbalik ([ForTraders](https://fortraders.com/blog/false-breakouts-why-they-happen-how-to-trade)) | Blog prop firm; metodologinya tidak saya periksa. Konsisten dengan win rate breakout yang rendah di atas |
| Jam paling likuid | Sesi Asia paling sepi dengan range rata-rata sekitar 100–200 pip; London sekitar 2–3 kali lebih volatil; overlap London–New York sekitar 12:00 atau 13:00 sampai 16:00 atau 17:00 GMT tergantung sumber ([NYC Servers](https://newyorkcityservers.com/blog/gold-xauusd-trading-strategy), [TMGM](https://www.tmgm.com/en/academy/trading-academy/gold-trading-hours)) | Selisih satu jam antar sumber kemungkinan karena DST. Konversi dari waktu server MT5 ke UTC harus diverifikasi di terminal Anda |
| London PM fix (sekitar 15:00 waktu London) | Studi data 2001–2013 yang diringkas LBMA menemukan pola harga tidak biasa sekitar PM fix sejak 2004 dan tidak pada AM fix. Pada hari dengan gerakan besar saat fix, arahnya turun setidaknya dua pertiga dari waktu di enam tahun berbeda, dan 92% pada 2010 ([LBMA Alchemist](https://www.lbma.org.uk/alchemist/issue-73/has-there-been-a-decade-of-london-pm-gold-fixing-manipulation)) | Data lama. Mekanisme penetapan harga emas LBMA berubah sejak 2015 (pengetahuan saya, tidak saya verifikasi di sesi ini), jadi pola ini tidak boleh dipakai sebagai sinyal sebelum dibuktikan ulang pada data baru. Satu sumber menulis fix pada 10:30 dan 15:00 UTC, sedangkan LBMA menulis waktu London; selisih DST harus dicek |
| FOMC dan rilis suku bunga | Harga dan volatilitas emas terus menyesuaikan lebih dari 5 menit setelah kejutan FOMC, dan lebih sensitif terhadap kejutan yang lebih longgar daripada yang lebih ketat ([Awartani dkk. 2024](https://ideas.repec.org/a/eee/finana/v95y2024ipbs1057521924004186.html)). Studi lain: ketidakpastian di pasar emas mereda sekitar 10 menit setelah pengumuman ([ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1544612323002799)) | Mendukung blackout yang mencakup setidaknya 10 menit pertama setelah rilis; durasi pastinya ditetapkan dari data spread Anda. "Pre-FOMC drift" terdokumentasi untuk saham ([Federal Reserve FEDS](https://www.federalreserve.gov/econres/feds/files/2026023pap.pdf)), bukan terbukti untuk emas |

### Musim (bulanan)

- Baur (2012), diringkas CXO Advisory: rata-rata return harian emas pada September dan November positif signifikan (rata-rata bulanan sekitar 2,2% dan 1,8%), dengan volatilitas tertinggi pada September, Januari, dan Februari; dikaitkan dengan permintaan perhiasan musim pernikahan India dan menjelang Natal ([CXO Advisory](https://www.cxoadvisory.com/?p=19189)).
- Studi lain tidak sejalan: efek Januari pada emas lemah ([Kohli 2012](https://businessperspectives.org/images/pdf/applications/publishing/templates/article/assets/4996/IMC_2012_02_Kohli.pdf)), dan penelitian lain yang dirujuknya tidak menemukan efek Januari maupun akhir pekan pada indeks emas sejak 1980. Analisis GLD menyebut September bagus tetapi tidak berbeda signifikan dari rata-rata ([Daily Speculations](https://dailyspeculations.com/wordpress/?p=5148)).
- Klaim blog praktisi saling bertentangan: satu situs menyebut 90% bulan September sepuluh tahun terakhir ditutup negatif ([Forecaster](https://forecaster.biz/instrument/forex/xauusd/seasonality)), padahal Baur justru menemukan September bulan terkuat. Perbedaan itu menunjukkan polanya rapuh terhadap pemilihan periode.
- Angka seperti "80% bulan Januari positif" berasal dari 10 observasi; itu bukan win rate trading dan terlalu sedikit untuk kesimpulan statistik. Siklus Juli 2025–Juli 2026 memang menunjukkan kenaikan besar pada September, Oktober, Januari, dan Februari ([OilPriceAPI](https://www.oilpriceapi.com/blog/gold-seasonality-monthly-price-patterns)), tetapi satu tahun bukan bukti pola.

### Peran tiap teknik di bot ini

| Teknik | Kekuatan bukti | Peran yang disarankan |
| --- | --- | --- |
| Filter sesi, spread, news | Mekanisme biaya jelas (spread melebar di jam sepi dan saat rilis), tetapi besar efeknya perlu diukur di akun Anda | Filter wajib; diuji di backtest |
| Trend/momentum (EMA crossover) | Profit teknikal FX terkait momentum dan tidak stabil antar periode | Pertahankan sebagai sinyal primer, dengan filter regime |
| RSI, Bollinger | Campuran: kuat di satu studi besar, buruk di yang lain. Bollinger punya win rate tinggi (74–81%) tetapi rasio menang/kalah di bawah 1 | Kandidat fitur untuk filter atau model meta, bukan sinyal tunggal |
| RSI(2) pullback searah EMA200 | Win rate 67–73% pada emas harian dan SPY, tetapi drawdown 17–30% dan hasil bergantung rezim pasar (turun di bawah 60% saat 2008 dan Maret 2020) | Kandidat sinyal kedua untuk dibandingkan dengan EMA crossover. Uji di H1/H4 dengan biaya; jangan asumsikan hasil harian berlaku di intraday |
| Breakout range Asia | Win rate 45–65% menurut sumber; sekitar 62% breakout 5 menit di emas gagal | Kandidat uji dengan filter lebar range dan konfirmasi close candle; ukur lewat expectancy, bukan win rate |
| Jendela London PM fix | Pola lama, mekanisme penetapan harga berubah | Paling jauh sebagai fitur waktu di model meta; bukan sinyal |
| Blackout FOMC, NFP, CPI | Reaksi emas berlanjut lebih dari 5 menit; ketidakpastian mereda sekitar 10 menit | Filter wajib; durasi ditetapkan dari data spread |
| Musim bulan atau hari | Lemah dan saling bertentangan | Fitur opsional di model meta, hanya jika lolos walk-forward |
| Pola jam (bentuk topi) | Hilang setelah biaya di satu skripsi | Tidak dipakai sebagai sinyal |
| Sistem "win rate 90%" (grid, martingale, SL sangat jauh) | Struktur berisiko ekstrem | Ditolak |

Cara yang sah meningkatkan kualitas trade adalah memilih trade dengan expectancy lebih baik (filter dan meta-label di bagian sebelumnya), lalu mengukur hasilnya dengan expectancy, profit factor, dan drawdown, bukan win rate.

**Lima syarat sebelum klaim win rate dipercaya** (dipakai juga untuk menilai strategi kandidat di atas):

1. Disertai rasio rata-rata menang terhadap rata-rata kalah dan expectancy per trade, bukan win rate saja.
2. Jumlah trade cukup. Contoh dari tabel: 38 trade dalam 17 tahun dan 150 trade terlalu sedikit untuk kesimpulan.
3. Spread, komisi, dan slippage dimodelkan, dengan entry di candle berikutnya.
4. Ada data out-of-sample yang tidak dipakai saat memilih parameter.
5. Max drawdown dilaporkan, termasuk di periode buruk seperti 2008 dan Maret 2020.

## Notifikasi momentum dan gambar otomatis (tanpa AI)

Spesifikasi teknis lengkap untuk membangun modul ini (skema data, definisi detektor, metode statistik musim/bulan/tahunan/5 tahunan, pemrosesan berita, API, tes, dan milestone) ada di dokumen terpisah: **SPEC_Modul_Analisis_Momentum_Notifikasi_Gambar.md**, ditulis agar bisa diberikan langsung ke AI pelaksana.

Modul ini berdiri sendiri dari AI: detektor aturan memantau candle dan indikator, mengirim notifikasi, menggambar anotasi di chart, dan menyimpan hasilnya agar bisa dipilih dan ditampilkan lagi. AI boleh ditambahkan belakangan hanya untuk menjelaskan alert, tidak untuk mendeteksinya.

**Prinsip desain**

- **Alert adalah informasi, bukan perintah trade.** Notifikasi momentum tidak membuka order. Entry tetap hanya lahir dari sinyal primer dan risk engine.
- **Hanya candle yang sudah tertutup.** Candle yang masih berjalan bisa berubah bentuk (repaint); alert yang muncul lalu hilang merusak kepercayaan dan merusak data evaluasi.
- **Bukti prediktif belum diriset.** Dokumen ini tidak membahas apakah pola candle atau momentum tertentu memprediksi arah di XAUUSD; bagian riset di atas hanya menyangkut win rate indikator. Perlakukan alert sebagai "perhatikan chart sekarang", dan ukur kegunaannya sendiri lewat log hasil (lihat di bawah).

### Jenis event yang dideteksi

Ambang berikut adalah titik awal yang bisa diubah, bukan hasil kalibrasi. Semuanya disimpan sebagai parameter bertanda versi.

| Kategori | Event | Aturan awal yang diusulkan |
| --- | --- | --- |
| Candle | Engulfing | Body candle tertutup menelan body candle sebelumnya, dengan range di atas ATR × k |
| Candle | Rejection / pin bar | Sumbu panjang di satu sisi (misalnya ≥ 2× body) di dekat level penting |
| Candle | Candle momentum besar | Range candle tertutup > ATR × k, close di sepertiga ujung range |
| Candle | Inside bar lalu breakout | Close di luar high/low induk setelah satu atau lebih inside bar |
| Level | Close di luar range Asia | Close M15 di atas high atau bawah low sesi Asia |
| Level | Sapuan PDH/PDL | Wick menembus high/low hari sebelumnya lalu close kembali di dalam |
| Indikator | EMA20/50 cross dan posisi terhadap EMA200 | Sama dengan aturan sinyal primer, tetapi sebagai alert terpisah |
| Indikator | RSI ekstrem | RSI(2) di bawah 10 atau di atas 90; opsional RSI(14) memotong 30/70 |
| Indikator | Bollinger | Close di luar band (20, 2) |
| Indikator | Kekuatan tren | ADX melewati ambang (misalnya 25) dari bawah |
| Kondisi pasar | Lonjakan volatilitas atau spread | ATR atau spread melewati kelipatan median jam yang sama |
| Konteks | Awal sesi dan news mendekat | Sesi London/New York dimulai; rilis berdampak tinggi dalam N menit |

### Mencegah banjir notifikasi

Alert yang terlalu sering akan diabaikan. Aturan wajib:

- **Deduplikasi:** satu alert unik per kombinasi simbol, timeframe, jenis event, dan waktu candle.
- **Cooldown** per jenis event, batas maksimum alert per jam, dan jam tenang yang bisa diatur.
- **Tingkat prioritas:** alert yang bertepatan dengan sinyal primer atau level penting ditandai tinggi; sisanya rendah dan bisa hanya muncul di panel, tanpa push.
- **Ukur dulu di data historis:** sebelum diaktifkan, hitung berapa alert per hari yang akan muncul untuk tiap jenis event, lalu buang atau perketat yang terlalu bising.
- **Pengaturan per pengguna:** nyalakan atau matikan per jenis event, timeframe, dan saluran.

### Isi notifikasi dan saluran

Setiap notifikasi memuat: simbol, timeframe, jenis event, waktu candle (UTC), harga, level terkait, prioritas, tautan ke chart, dan gambar bila ada. **Tidak ada saldo, login, atau nama akun** di pesan maupun gambar.

Saluran yang bisa dipertimbangkan: panel di dashboard (real-time), bot Telegram, web push, dan email. Saya belum memverifikasi batas pengiriman, format gambar, atau syarat tiap saluran di sesi ini; cek dokumentasi resmi masing-masing sebelum memilih. Kegagalan kirim harus dicatat dan dicoba ulang, dan alert tetap tersimpan di dashboard walau saluran luar gagal.

### Gambar otomatis

Satu format anotasi dipakai untuk semua sumber, termasuk anotasi AI nanti, sehingga frontend hanya perlu satu renderer:

```json
{
  "id": "drw_01",
  "event_id": "evt_01",
  "source": "rule | ai | user",
  "rule_version": "asia-range@3",
  "items": [
    {"type": "zone", "t1": "UTC", "t2": "UTC", "p1": 0, "p2": 0, "label": "Range Asia"},
    {"type": "line", "t1": "UTC", "p1": 0, "t2": "UTC", "p2": 0, "label": "PDH"},
    {"type": "arrow", "t": "UTC", "p": 0, "label": "Engulfing bullish"},
    {"type": "marker", "t": "UTC", "p": 0, "label": "RSI(2) 6"}
  ]
}
```

Dua bentuk keluaran:

1. **Spesifikasi JSON (sumber kebenaran).** Kecil, bisa digambar ulang di zoom dan timeframe mana pun, dan bisa disusun per lapisan di KLineChart.
2. **Snapshot PNG (turunan).** Dirender dari data dan spesifikasi yang sama, untuk dilampirkan ke notifikasi dan arsip. Karena PNG hanyalah hasil render, PNG yang hilang bisa dibuat ulang dari JSON.

Dua jebakan yang harus dijaga: gambar yang bergantung pada titik swing (support/resistance, zona) baru bisa dipastikan beberapa candle kemudian, jadi simpan *waktu konfirmasi* terpisah dari waktu candle agar tidak menggambar masa depan; dan gambar tidak boleh bergeser setelah dibuat.

### Menyimpan dan memilih untuk ditampilkan

| Data | Isi | Kegunaan |
| --- | --- | --- |
| events | simbol, timeframe, jenis event, waktu candle UTC, waktu deteksi, harga, versi aturan, prioritas | Riwayat semua alert |
| drawings | spesifikasi JSON, path PNG, sumber, tag, catatan, status pin | Gambar yang bisa dipilih |
| event_outcomes | pergerakan maksimum searah dan berlawanan setelah N candle, terisi belakangan | Mengukur apakah alert itu berguna |
| user_layers | pengaturan lapisan yang aktif per pengguna | Tampilan chart yang dipilih |

Di UI: panel daftar gambar dengan filter (simbol, timeframe, jenis event, tanggal, sumber), kotak centang per gambar atau per lapisan, tombol pin, catatan, dan hapus. Batasi jumlah overlay yang tampil sekaligus agar chart tetap terbaca, dan pakai kebijakan retensi: gambar yang tidak di-pin kedaluwarsa setelah jangka tertentu (angka retensi adalah keputusan Anda).

### Hubungannya dengan validasi dan AI

- Kolom `event_outcomes` membuat setiap alert bisa dinilai belakangan, jadi jenis event yang tidak berguna bisa dimatikan berdasarkan data, bukan perasaan.
- Event yang tercatat beserta hasilnya menjadi fitur dan label berharga untuk model meta di fase AI.
- Bila AI nanti dipakai, ia menerima event dan gambar sebagai konteks dan hanya menambahkan penjelasan; kontrak TAKE/SKIP/WAIT di bawah tetap berlaku.

### Bukti selesai untuk modul ini

- Alert yang sama tidak pernah terkirim dua kali untuk candle yang sama, bahkan setelah restart worker.
- Menjalankan detektor pada data historis yang sama dua kali menghasilkan event yang identik.
- Tidak ada event yang berasal dari candle yang belum tertutup (diuji dengan uji geser satu bar).
- Gambar PNG dan tampilan chart untuk satu event berasal dari spesifikasi JSON yang sama.
- Alert tetap muncul di dashboard saat saluran luar sengaja dimatikan.
- Jumlah alert per hari per jenis event terukur dan berada di bawah batas yang Anda tetapkan.

## Arsitektur AI yang direkomendasikan

AI duduk di tengah alur sebagai satu gerbang tambahan, bukan di ujungnya. Sinyal lahir dari strategi deterministik, AI hanya boleh menolak atau menunda, dan risk engine tetap memutuskan ukuran serta boleh-tidaknya order.

&#91;embedded content: alur keputusan · 3 gerbang penolakan, 1 langkah AI\]

Setiap penolakan, dari gerbang mana pun, dicatat bersama alasannya. Catatan itu yang membuat forward test bisa menghitung apa yang terjadi seandainya sinyal itu diambil.

## Perbaikan wajib sebelum AI dinyalakan

Delapan perbaikan ini diurutkan menurut dependensi: nomor berikutnya tidak bermakna sebelum nomor sebelumnya terbukti. Kolom terakhir adalah bukti selesai yang bisa Anda periksa sendiri.

| # | Perbaikan | Mengapa | Bukti selesai |
| --- | --- | --- | --- |
| 1 | Buat data live mengalir end-to-end: pasang dan kompilasi EA v1.3 di MT5, cocokkan instance\_id EA dengan dashboard | Tanpa candle masuk, AI hanya melihat data kosong atau basi | Chart H1 dan /api/account merespons 200 terus-menerus selama 24 jam; usia data < 60 detik |
| 2 | Satukan konfigurasi dan parameter risiko menjadi satu sumber | Core dan web memakai angka berbeda (0,5%/2%/5% vs 1%/3%/20%) | Nilai di UI = nilai efektif engine; key salah ditolak, bukan diam-diam jadi default |
| 3 | Jadikan worker core satu-satunya sumber sinyal | Marker chart dari MACD bukan bukti strategi worker menghasilkan sinyal | Sinyal di dashboard bisa ditelusuri ke satu keputusan di ledger worker |
| 4 | Selesaikan backtest jujur (P2): entry di open candle berikutnya, spread dinamis, slippage, komisi, aturan SL/TP pada candle yang sama (asumsi pesimis: SL dulu), clock simulasi | Tanpa ini setiap angka performa menyesatkan (F07, F08) | Dataset kecil yang dihitung manual menghasilkan hasil identik; hasil reproduksibel dengan seed dan versi dicatat |
| 5 | Ukur baseline strategi EMA murni di data XAUUSD akun Exness Anda (ekspor dari MT5), setelah biaya | Perlu angka pembanding untuk membuktikan AI membantu | Laporan: jumlah trade, win rate, expectancy per trade, profit factor, max drawdown, dipecah per sesi. Aturan praktis: kurang dari beberapa ratus trade belum cukup untuk kesimpulan |
| 6 | Verifikasi ulang P0 dengan fake MT5, lalu satu uji DEMO di terminal (partial fill, timeout, restart, ARM) | Kelulusan 7 unit test offline bukan bukti integrasi terminal | PAPER + data MT5 tidak pernah memanggil order\_send; order ambigu memblokir order baru setelah restart |
| 7 | Bersihkan repo publik: keluarkan trading\_agent.db dan **pycache** dari git, tambah .gitignore, pindahkan scratch dan shim pandas\_ta | File .db bisa memuat data order atau akun | Repo bersih; riwayat git diperiksa untuk data sensitif |
| 8 | Siapkan log keputusan append-only untuk forward test | Evaluasi AI yang valid hanya lewat keputusan yang dicatat sebelum hasil ada | Setiap keputusan menyimpan snapshot, versi model dan prompt, verdict, alasan, dan hasil akhirnya |

## Provider AI, kuota, dan biaya

Untuk MVP, pakai Gemini Flash lewat API key; langganan Google AI Pro Anda **tidak** otomatis menanggung pemanggilan dari bot. Angka di bawah dibaca langsung dari halaman resmi Google pada 4 Okt 2026 (halaman rate limit diperbarui 2 Sep 2026, halaman plans 18 Agu 2026).

| Opsi | Biaya | Batas dan syarat | Catatan untuk bot ini |
| --- | --- | --- | --- |
| Gemini API free tier (model Flash/Flash-Lite, mis. gemini-3.8-flash, gemini-3.5-flash-lite) | Token input dan output gratis | Batas per model hanya terlihat di AI Studio, tidak dicantumkan di dokumentasi, dan tidak dijamin. Konten **dipakai Google untuk memperbaiki produk**. Search grounding tidak tersedia | Cukup untuk prototipe, asal hanya mengirim data pasar (OHLC, indikator). Jangan kirim saldo, login, atau nama akun |
| Gemini API berbayar, Tier 1 (cukup aktifkan billing) | gemini-3.8-flash: $0,75 input dan $3,75 output per 1 juta token sampai 31 Des 2026, lalu $1,50 dan $7,50 mulai 1 Jan 2027. gemini-3.5-flash-lite: $0,30 dan $2,50 | Konten tidak dipakai untuk memperbaiki produk. Search grounding: 5.000 request/bulan gratis (dibagi semua model Gemini 3.x), lalu $14 per 1.000. Token "thinking" ditagih sebagai output | Estimasi saya: 3.000 token input + 1.000–5.000 token output per analisis = sekitar $0,006–$0,021. Satu analisis per candle H1 (24 per hari) = sekitar $0,14–$0,50 per hari. Harga berlaku sebelum kenaikan 2027 |
| Langganan Google AI Pro | Sudah Anda bayar | Manfaat developer berlaku **hanya di antarmuka AI Studio**. Pemakaian API key dari aplikasi eksternal ditagih terpisah. Pelanggan dengan project Google Cloud + billing bisa mendapat kredit Cloud bulanan lewat Google Developer Program, nominalnya tidak disebut di halaman itu | Jangan menghitung langganan sebagai kuota API gratis. Angka kredit $10/bulan di IMPROVEMENT\_PLAN belum terverifikasi; cek di akun Anda |
| Model ML lokal (mis. gradient boosting) untuk meta-label | Gratis, berjalan di mesin sendiri | Butuh data historis berlabel dan validasi walk-forward | Tidak ada kebocoran look-ahead LLM, bisa di-backtest valid, tidak ada data keluar. Saya rekomendasikan sebagai lapis pertama, LLM sebagai lapis konteks |

**Aturan pakai yang disarankan:**

- Prototipe di free tier hanya dengan data pasar; pindah ke Tier 1 berbayar begitu masuk PAPER berkelanjutan, karena biayanya kecil dan data tidak lagi dipakai Google.
- Kunci satu model ID dan catat di setiap keputusan; jangan ganti model otomatis saat kena rate limit.
- Tetapkan batas sendiri di aplikasi (maksimum panggilan per hari, pemutus otomatis); peringatan budget di sisi Google bukan batas keras.
- Saat kuota habis, timeout, atau output tidak valid: status "AI tidak tersedia" berarti tidak ada entry baru, sementara proteksi posisi terbuka tetap jalan.
- Provider lain (OpenAI, Groq, model lokal) tidak saya verifikasi di sesi ini; tambahkan hanya jika ada alasan konkret.

## Kontrak input dan output AI

Pada MVP, AI hanya boleh **mengurangi** trade: memberi verdict TAKE, SKIP, atau WAIT atas sinyal EMA yang sudah ada, tanpa mengubah entry, SL, TP, atau lot. Dengan begitu efek AI bisa diukur bersih: apakah trade yang lolos filter punya expectancy lebih baik daripada semua sinyal EMA.

**Input per panggilan (dihitung deterministik oleh backend):**

- Symbol sesuai nama broker, timeframe, dan waktu snapshot dalam UTC.
- Candle tertutup terakhir (candle yang masih berjalan tidak ikut) dan indikator: EMA20/50/200, ATR, RSI, ADX.
- Sinyal primer: arah, entry, SL, TP dari engine.
- Spread saat ini dibanding rata-rata spread pada jam yang sama, serta sesi (Asia, London, New York).
- Event kalender 24 jam ke depan (waktu UTC, importance, previous, forecast) dan headline terbaru dengan sumber serta waktu terbit.
- Jumlah dan arah posisi terbuka. Saldo, login, dan nama akun **tidak** dikirim.

**Output (JSON, divalidasi schema sebelum dipakai):**

```json
{
  "verdict": "TAKE | SKIP | WAIT",
  "score": 0,
  "reasons": ["maks 3 alasan, masing-masing merujuk field input"],
  "risk_flags": ["news_near", "spread_wide", "counter_trend_htf", "range_regime", "data_stale"],
  "invalidation": "kondisi atau harga yang membatalkan skenario",
  "expires_utc": "2026-10-05T08:00:00Z",
  "annotations": [{"type": "zone | line | arrow | label", "time": "UTC", "price": 0, "text": "..."}]
}
```

**Guardrail yang tidak boleh dilonggarkan:**

- Risk engine punya veto mutlak. AI tidak bisa menaikkan risiko, mengubah lot, atau membuka order tanpa sinyal primer.
- Output tidak valid, timeout, atau kuota habis diperlakukan sebagai SKIP, bukan TAKE.
- Teks berita adalah data, bukan instruksi. Headline yang berisi perintah tidak boleh mengubah aturan.
- AI dipanggil hanya saat sinyal primer muncul, bukan setiap tick; hasil di-cache per snapshot dan keputusan kedaluwarsa tidak boleh dikirim ke eksekusi.
- Field `score` adalah skor model, bukan probabilitas menang. Jangan dipakai untuk sizing sampai dikalibrasi dengan hasil nyata. Catatan: config.yaml menetapkan minimum 30 sampel untuk kalibrasi; itu terlalu sedikit untuk kesimpulan yang berarti, jadi tetapkan angka yang lebih besar sebelum forward test dimulai.
- Setiap panggilan dicatat: versi prompt, model ID, snapshot, respons mentah, latensi, biaya, dan hasil trade-nya. Respons yang sama tidak dijamin identik pada panggilan ulang, jadi simpan respons aslinya.

## Filter non-AI untuk XAUUSD di Exness

Filter deterministik berikut kemungkinan mengurangi trade minus lebih cepat dan lebih murah daripada model apa pun. Semuanya hipotesis dari riset praktisi; setiap filter baru dianggap berguna hanya jika expectancy setelah biaya membaik pada data Anda sendiri.

| Filter | Aturan yang diusulkan | Cara menguji |
| --- | --- | --- |
| Sesi | Entry baru hanya saat London dan New York. Jam persisnya dikonversi dari waktu server MT5 ke UTC, termasuk perubahan DST, dan diverifikasi di terminal | Bandingkan expectancy per jam dan per sesi pada baseline |
| Spread | Tolak entry jika spread melebihi kelipatan tertentu dari median spread jam yang sama. Aturan spread/ATR 0,10 yang sudah ada tetap dipertahankan | Rekam spread nyata di DEMO beberapa pekan, lalu tetapkan ambang dari distribusinya |
| News blackout | Tidak ada entry baru sebelum dan sesudah rilis berdampak tinggi (NFP, CPI, FOMC). Durasinya ditentukan dari perilaku spread di sekitar rilis, bukan ditebak | Kalender MQL5 lewat bridge; simulasikan blackout di backtest |
| Regime | Lewati crossover EMA saat ADX atau ATR menunjukkan pasar sideways | Bandingkan hasil crossover di regime tren vs range |
| Konfirmasi timeframe lebih tinggi | Lewati sinyal yang melawan arah H4/D1 | Bandingkan sinyal searah vs berlawanan |
| Pembatas frekuensi | Cooldown setelah SL, maksimum trade per hari, jeda setelah rugi beruntun. config.yaml web sudah memuat aturan kurangi lot pada 3 rugi beruntun dan jeda pada 5; pastikan juga aktif di worker core | Uji dampak pada drawdown, bukan hanya profit |

**Periksa ukuran akun lebih dulu.** Contoh modal $100 di IMPROVEMENT\_PLAN dengan risiko 0,5% berarti anggaran rugi sekitar $0,50 per trade. Jika kontrak XAUUSD akun Anda 100 oz per lot standar (perlu diverifikasi di spesifikasi simbol), lot minimum 0,01 setara 1 oz, sehingga SL berjarak beberapa dolar saja sudah melewati anggaran itu. Aturan "tolak jika di bawah volume minimum" akan membuat bot hampir selalu SKIP, dan kalau dilonggarkan, risiko riil per trade melonjak jauh di atas 0,5%. Pastikan modal, jarak SL, dan lot minimum benar-benar cocok sebelum PAPER dimulai.

## Validasi: bagaimana membuktikan AI membantu

AI dianggap berguna hanya jika trade yang lolos filternya lebih baik daripada trade tanpa AI pada data yang tidak pernah dilihat saat desain. Urutan buktinya:

1. **Backtest deterministik tanpa LLM.** Strategi EMA dan filter non-AI diuji dengan pembagian waktu (config.yaml sudah menetapkan 60% latih, 20% validasi, 20% holdout, plus 1.000 simulasi Monte Carlo). Holdout dibuka sekali saja. Untuk filter atau model ML, pakai walk-forward dengan purging dan embargo.
2. **Forward test PAPER dalam mode bayangan.** Pada setiap sinyal EMA, AI memberi verdict, tetapi hasil hipotetis semua sinyal tetap dicatat. Tiga lengan dibandingkan pada periode yang sama: (A) EMA murni, (B) EMA + filter non-AI, (C) EMA + filter + AI. Semua keputusan ditulis ke log sebelum hasil trade diketahui.
3. **DEMO dengan lot minimum.** Tujuannya menguji eksekusi nyata (slippage, partial fill, timeout, restart), bukan mengukur profit.
4. **REAL** tetap di luar lingkup MVP.

**Kriteria lulus ditetapkan tertulis sebelum forward test dimulai**, bukan sesudah melihat hasil. Metrik yang dibandingkan antar lengan: expectancy per trade setelah spread, komisi, dan slippage; profit factor; max drawdown; jumlah trade; persentase SKIP/WAIT; dan biaya AI per trade. Lengan C harus unggul atas lengan B pada expectancy dan drawdown, bukan hanya win rate, dengan selisih yang tidak hilang saat diuji bootstrap, dan keuntungannya harus melebihi biaya AI.

**Aturan berhenti:** jika lengan C tidak lebih baik dari lengan B setelah jumlah trade yang sudah ditetapkan, matikan AI dan pertahankan filter non-AI. Itu hasil yang sah, bukan kegagalan proyek.

**Pemeriksaan kebocoran dan overfit:**

- *Shift test:* geser sinyal satu bar ke depan. Jika performa nyaris tidak turun, ada kebocoran data masa depan.
- Hasil yang terlihat terlalu bagus (misalnya Sharpe di atas 3) wajib lolos uji lag satu bar sebelum dipercaya.
- Catat berapa banyak kombinasi parameter yang dicoba. Semakin banyak percobaan, semakin besar peluang hasil bagus hanya kebetulan.
- Data berita dan kalender untuk backtest harus memakai waktu ketersediaan aslinya; jika histori itu tidak ada, jangan klaim backtest fundamental.

## Roadmap MVP bertahap

Lima fase berurutan, masing-masing ditutup gerbang yang bisa diperiksa. Fase 0 sampai 2 tidak memakai AI sama sekali, dan memang itu intinya: bagian terbesar pengurangan loss kemungkinan datang dari sana.

&#91;embedded content: roadmap MVP · 5 fase, 5 gerbang\]

Durasi tiap fase bergantung pada berapa banyak sinyal yang muncul, jadi roadmap ini sengaja tidak diberi tanggal. Fase 3 dan 4 baru dihitung sejak gerbang sebelumnya lolos.

## Risiko, hal yang belum terverifikasi, dan keputusan Anda

Empat keputusan di bawah menentukan desain MVP; sisanya adalah batasan pada dokumen ini yang perlu Anda ketahui.

**Keputusan yang perlu Anda ambil:**

1. **Modal akun sebenarnya.** Ini menentukan apakah risiko 0,5% per trade layak dengan lot minimum XAUUSD (lihat bagian filter).
2. **Timeframe sinyal utama** (misalnya M15 atau H1). Ini menentukan jumlah sinyal, biaya AI, dan seberapa cepat forward test mengumpulkan sampel.
3. **Set parameter risiko mana yang dipakai:** core (0,5% / 2% / 5%) atau web (1% / 3% / 5% mingguan / 20%).
4. **Kriteria lulus forward test:** jumlah trade minimum, lama periode, dan ambang metrik, ditulis sebelum mulai. Migrasi ke Go tidak perlu diputuskan sekarang; IMPROVEMENT\_PLAN sendiri menyebutnya bukan prasyarat fitur AI.

**Dua keputusan tambahan untuk modul notifikasi:**

5. **Saluran notifikasi utama** (dashboard saja, Telegram, web push, atau email) dan jam tenang yang diinginkan.
6. **Jenis event yang dianggap penting** dari tabel deteksi, serta berapa lama gambar yang tidak di-pin disimpan.

**Belum terverifikasi di dokumen ini:**

- Modul notifikasi dan gambar otomatis adalah rancangan; ambang deteksi belum dikalibrasi, kegunaan prediktif pola candle belum diriset, dan batas tiap saluran pengiriman belum diverifikasi.

- Kode sumber tidak saya baca; semua perilaku kode mengikuti dokumen repo, yang sebagian saling bertentangan.
- Koneksi MT5 live belum terbukti: EA v1.3 belum dikompilasi atau dites menurut WORKLOG.
- Kontrak XAUUSD, lot minimum, dan offset waktu server pada akun Exness Anda; spread nyata di akun Anda.
- Nominal kredit Google Developer Program untuk pelanggan AI Pro; provider selain Gemini.
- Makalah arXiv dan blog praktisi saya baca dari ringkasan hasil pencarian, tidak dibuka penuh. Halaman Google (harga, rate limit, plans) dibuka penuh.
- Semua angka win rate di bagian indikator dan teknik waktu berasal dari blog, repo GitHub, dan dokumentasi framework yang saya baca dari cuplikan hasil pencarian. Tidak satu pun saya replikasi, dan label kolom pada tabel Bollinger/ADX/MACD saya tafsirkan sendiri.
- Perubahan mekanisme London Gold Fix sejak 2015 berasal dari pengetahuan saya, bukan dari sumber yang saya buka di sesi ini.

**Risiko yang perlu dikelola:**

- Free tier Gemini memakai konten Anda untuk memperbaiki produk Google; kirim hanya data pasar.
- Harga Gemini 3.8 Flash naik dua kali lipat mulai 1 Jan 2027; model dan ID bisa berubah atau dipensiunkan, jadi kunci versi dan uji ulang saat berganti.
- Headline berita bisa memuat instruksi tersembunyi (prompt injection); perlakukan sebagai data.
- Sampel trade yang kecil membuat hasil bagus mudah menjadi kebetulan; tahan keinginan menyimpulkan terlalu cepat.
- Repo publik: periksa riwayat git untuk kredensial atau data akun sebelum menambah integrasi API.
- Dokumen ini bukan nasihat keuangan. Trading leverage pada emas bisa merugikan melebihi ekspektasi, dan tidak ada desain yang menjamin hasil.

## Sumber

Diakses 4 Okt 2026. Halaman resmi Google dan dokumen repo dibuka penuh; makalah dan blog dibaca dari ringkasan hasil pencarian.

**Repo dan dokumen proyek**

- [FachriPahlevi/BotTrading](https://github.com/FachriPahlevi/BotTrading) (README, folder dan file)
- [PROJECT\_CONTEXT.md](https://github.com/FachriPahlevi/BotTrading/blob/main/PROJECT_CONTEXT.md), [IMPROVEMENT\_PLAN.md](https://github.com/FachriPahlevi/BotTrading/blob/main/IMPROVEMENT_PLAN.md), [WORKLOG.md](https://github.com/FachriPahlevi/BotTrading/blob/main/WORKLOG.md), [config.yaml](https://github.com/FachriPahlevi/BotTrading/blob/main/config.yaml)

**Gemini API (resmi Google, dibuka penuh)**

- [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) (diperbarui 2 Sep 2026)
- [Google AI plans](https://ai.google.dev/gemini-api/docs/google-ai-plans) (diperbarui 18 Agu 2026)

**Riset**

- [StockBench, arXiv 2510.02209](https://arxiv.org/abs/2510.02209)
- [Look-Ahead-Bench, arXiv 2601.13770](https://arxiv.org/pdf/2601.13770)
- [FinCAD, arXiv 2605.24564](https://www.emergentmind.com/papers/2605.24564)
- [Look-ahead freedom, arXiv 2607.04958](https://arxiv.org/pdf/2607.04958)
- [Meta-labeling, Hudson & Thames](https://hudsonthames.org/does-meta-labeling-add-to-signal-efficacy/)
- [Triple barrier, LuxAlgo](https://www.luxalgo.com/library/concept/label-definition-and-prediction-horizon.md)
- [Shift test untuk look-ahead, NexusFi](https://nexusfi.com/a/automation/ai-llm-futures-trading-workflow)

**XAUUSD (blog praktisi, kualitas bukti rendah)**

- [Gold trading sessions, MQL5](https://www.mql5.com/en/blogs/post/773690)
- [XAUUSD spread, DEV Community](https://dev.to/xauusdrobot/the-xauusd-spread-the-hidden-cost-that-quietly-decides-your-trading-results-574d)

**Indikator dan win rate (blog, repo, dokumentasi framework; kualitas bukti rendah sampai menengah)**

- [Mean Reversion: Connors RSI2, Backtrader](https://backtrader.readthedocs.io/en/latest/strategies-series/en/02-mean-reversion.html)
- [RSI Mean Reversion Backtest, Backtest Everything](https://www.backtesteverything.com/blog/rsi-mean-reversion-strategy-complete-backtest)
- [RSI 2 Strategy, QuantifiedStrategies](https://www.quantifiedstrategies.com/rsi-2-strategy/)
- [Best Technical Indicators, NewTrading](https://www.newtrading.io/best-technical-indicators/)
- [Supertrend 4.052 trade, Liberated Stock Trader](https://www.liberatedstocktrader.com/supertrend-indicator/)
- [XAUUSD liquidity sweep backtester, GitHub](https://github.com/ikeawesom/xauusd-backtest)
- [Goldmine Strategy, Medium](https://medium.com/coinmonks/how-to-backtest-the-goldmine-strategy-for-consistent-gold-profits-bfa20d0925eb) dan [XAUUSD SMC Backtest Report, Scribd](https://www.scribd.com/document/882341069/XAUUSD-Strategy-Backtest-Report-1)
- [Hasil trader ritel per negara, daytrading.com](https://www.daytrading.com/safety/which-countries-have-the-most-profitable-retail-traders) dan [10PM Trader](https://10pmtrader.com/why-retail-traders-lose-money/)

**Teknik waktu dan event**

- [London Open Breakout backtest, GitHub](https://github.com/MHZardary/london-strategy-backtest), [ForexCracked](https://www.forexcracked.com/trading-lab/london-session-breakout/), [FXNX XAUUSD breakout](https://fxnx.com/en/blog/xauusd-daily-breakout-strategy-why-a-45-win-rate)
- [False breakouts, ForTraders](https://fortraders.com/blog/false-breakouts-why-they-happen-how-to-trade)
- [Gold XAUUSD strategy, NYC Servers](https://newyorkcityservers.com/blog/gold-xauusd-trading-strategy) dan [Gold trading hours, TMGM](https://www.tmgm.com/en/academy/trading-academy/gold-trading-hours)
- [London PM Gold Fixing, LBMA Alchemist](https://www.lbma.org.uk/alchemist/issue-73/has-there-been-a-decade-of-london-pm-gold-fixing-manipulation)
- [Gold intraday returns dan kejutan FOMC, Awartani dkk. 2024](https://ideas.repec.org/a/eee/finana/v95y2024ipbs1057521924004186.html) dan [Monetary policy and uncertainty resolution, ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1544612323002799)
- [FEDS Federal Reserve Board, pre-FOMC drift](https://www.federalreserve.gov/econres/feds/files/2026023pap.pdf)
