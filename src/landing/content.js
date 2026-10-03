/**
 * Data statis untuk halaman landings.
 *
 * Dipisahkan dari komponen supaya teks mudah disunting tanpa menyentuh JSX,
 * dan supaya katalog materi bisa dipakai ulang oleh halaman detail.
 */

export const HERO_STATS = [
  { label: 'Topik Utama', value: '6+' },
  { label: 'Konsep Geometri', value: '20+' },
  { label: 'Latihan', value: '35+' },
]

export const MATERI = [
  {
    id: 'bidang-datar',
    title: 'Bangun Datar',
    summary:
      'Segitiga, persegi, persegi panjang, trapesium, dan lingkaran beserta rumus luas dan kelilingnya.',
    icon: '△',
    accent: 'from-cyan-400/20 to-cyan-400/0',
    topics: 6,
  },
  {
    id: 'ruang',
    title: 'Bangun Ruang',
    summary:
      'Balok, kubus, tabung, kerucut, bola, dan limas. Diuji langsung dengan memindai benda nyata.',
    icon: '⬡',
    accent: 'from-teal-400/20 to-teal-400/0',
    topics: 8,
  },
  {
    id: 'transformasi',
    title: 'Transformasi Geometri',
    summary:
      'Translasi, refleksi, rotasi, dan dilatasi dilihatkan sebagai perubahan koordinat titik.',
    icon: '⟳',
    accent: 'from-sky-400/20 to-sky-400/0',
    topics: 5,
  },
  {
    id: 'volume',
    title: 'Volume dan Luas Permukaan',
    summary:
      'Menghitung volume balok, silinder, dan kerucut, lalu memverifikasi hasilnya lewat model 3D.',
    icon: '∛',
    accent: 'from-indigo-400/20 to-indigo-400/0',
    topics: 7,
  },
  {
    id: 'sudut',
    title: 'Hubungan Sisi dan Sudut',
    summary:
      'Sifat bangun datar, jumlah sudut segitiga, dan hubungan antar rusuk pada bangun ruang.',
    icon: '∠',
    accent: 'from-emerald-400/20 to-emerald-400/0',
    topics: 6,
  },
  {
    id: 'koordinat',
    title: 'Geometri Analitik',
    summary:
      'Menentukan jarak, titik tengah, dan persamaan garis dari koordinat cartesius.',
    icon: '⊙',
    accent: 'from-fuchsia-400/20 to-fuchsia-400/0',
    topics: 5,
  },
]

export const QUIZ = {
  question: 'Sebuah kubus mempunyai...',
  options: [
    { id: 'a', text: '6 sisi, 12 rusuk, dan 8 titik sudut', correct: true },
    { id: 'b', text: '8 sisi, 12 rusuk, dan 6 titik sudut', correct: false },
    { id: 'c', text: '12 sisi, 8 rusuk, dan 6 titik sudut', correct: false },
    { id: 'd', text: '6 sisi, 8 rusuk, dan 12 titik sudut', correct: false },
  ],
  explanation:
    'Kubus memiliki 6 bidang datar berbentuk persegi, 12 rusuk yang sama panjang, dan 8 titik sudut.',
}

export const PROGRESS = [
  { label: 'Materi', value: 8, max: 12, unit: 'topik' },
  { label: 'Latihan', value: 14, max: 20, unit: 'soal' },
  { label: 'Kuis', value: 86, max: 100, unit: '%' },
]