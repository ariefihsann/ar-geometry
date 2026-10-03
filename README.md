# Scan Benda 3D

Satu fitur untuk siswa: buka kamera, pindai benda dari enam sudut, lihat sudut
yang terbaca ditandai warna biru, lalu dapatkan model 3D primitif yang bisa
diputar, diperbesar, dan digeser.

Aplikasi ini **bukan photogrammetry**. Ia tidak merekonstruksi permukaan 3D
dari foto. Yang dilakukan adalah membaca siluet tiap sudut, menghitung
deskripsi bentuk, lalu mencocokkannya dengan pustaka bangun ruang sederhana.

## Bentuk yang dikenali

| Bentuk | Tampak depan/samping | Tampak atas |
| --- | --- | --- |
| Balok | persegi | persegi |
| Tabung | persegi | lingkaran |
| Bola | lingkaran | lingkaran |
| Kerucut | segitiga | lingkaran |
| Limas segi empat | segitiga | persegi |

## Cara kerja pembacaan

1. Foto diperkecil ke lebar 240 piksel supaya cepat dihitung.
2. Foto yang diblur kuat dipakai sebagai model latar lokal, sehingga gradasi
   dinding dan meja tidak ikut terbaca sebagai bagian benda.
3. Ambang Otsu pada selisih terhadap latar lokal, dengan cadangan ambang
   persentil kalau hasilnya terlalu longgar.
4. Piksel yang hanya lebih gelap dari latar dan tidak punya warna kuat dianggap
   bayangan dan dibuang. Kalau benda gelap tanpa warna ikut hilang, pembacaan
   diulang dengan aturan yang lebih longgar dan keyakinan ditahan.
5. Opening, closing, dan pengisian rongga agar siluet solid.
6. Komponen terhubung terbesar yang paling terpusat dan tidak menyentuh tepi
   bingkai dipilih sebagai benda.
7. Tepi mask ditelusuri dengan metode Moore-neighbour, lalu disederhanakan
   dengan Douglas-Peucker setara `cv2.approxPolyDP`. Jumlah sudut hasilnya
   dipakai untuk menggambar penanda biru di atas video.
8. Rasio isi siluet terhadap kotak pembatasnya (`extent`) dipakai sebagai ciri
   sekunder untuk membedakan bentuk di dalam satu kategori sudut.

## Batasan yang perlu diketahui

- **Skala absolut tidak bisa diketahui.** Jarak kamera tidak diketahui, jadi
  ukuran cm adalah perkiraan. Slider tersedia untuk mengoreksinya.
- **Latar polos itu penting.** Foto dengan latar ramai tidak menghasilkan
  siluet yang bisa diandalkan, dan aplikasi akan menolak dengan pesan yang
  menyebutkan penyebabnya.
- **Benda terlalu dekat atau keluar tengah bingkai ditolak**, karena siluetnya
  ikut terpotong.
- **Benda gelap tanpa warna lebih sulit.** Jika siluet hanya ditemukan setelah
  penyaringan bayangan dilonggarkan, keyakinan otomatis ditahan di bawah 55%.
- **Tiga sudut pertama menentukan bentuk.** Enam sudut diambil, tetapi
  `back`, `left`, dan `bottom` hanya dipakai untuk mengecek konsistensi.

## Menjalankan

```bash
npm install
npm run dev
```

Kamera hanya bisa dibuka lewat `https://` atau `localhost`. Kalau dev server
memakai HTTP biasa, browser akan menolak permintaan kamera.

```bash
npm run build   # build produksi ke dist/
npm run preview # menyajikan hasil build
npm run lint    # oxlint
```

## Skrip pengujian

Semua skrip pengujian browser memerlukan dev server aktif. Jalankan dev server
dulu, lalu jalankan skripnya di terminal lain.

```bash
node node_modules/vite/bin/vite.js --port 4183
```

| Skrip | Yang diuji |
| --- | --- |
| `node scripts/debug-contour.mjs` | tracing kontur dan aproksimasi sudut tanpa browser |
| `TARGET_URL=https://localhost:4183/ node scripts/verify-corners.mjs` | lima bentuk, enam sudut, dan pembacaan ulang saat benda diputar |
| `TARGET_URL=https://localhost:4183/ node scripts/verify-silhouette.mjs` | ekstraksi siluet pada foto sintetis bergradasi, termasuk benda gelap |
| `node scripts/verify-match.mjs` | pencocokan bentuk dari deskripsi siluet |
| `TARGET_URL=https://localhost:4183/ node scripts/smoke.mjs` | alur penuh dengan kamera palsu: enam foto, overlay biru, hasil 3D, tombol putar/zoom, slider, dan pilihan bentuk manual |
| `TARGET_URL=https://localhost:4183/ node scripts/tune-silhouette.mjs` | eksperimen radius blur dan ambang terhadap ketepatan `extent` |
| `TARGET_URL=https://localhost:4183/ node scripts/debug-mask.mjs` | membandingkan topeng siluet dengan dan tanpa penyaringan bayangan |

## Struktur berkas penting

- `src/camera/useCamera.js` — akses kamera, capture frame, ganti kamera.
- `src/scan/silhouette.js` — segmentasi dan deskripsi siluet.
- `src/scan/contour.js` — penelusuran kontur dan sudut.
- `src/scan/shapeLibrary.js` — ciri teoritis tiap bangun ruang.
- `src/scan/matchShape.js` — pencocokan dan perkiraan dimensi.
- `src/scan/useLiveCorners.js` — pembacaan ulang sudut selama kamera menyala.
- `src/steps/ScanStep.jsx` — pemindaian terbimbing.
- `src/steps/ResultStep.jsx` — hasil, konsistensi sudut, dan pilihan bentuk manual.
- `src/viewer/Viewer3D.jsx` — penampil 3D dan kontrolnya.