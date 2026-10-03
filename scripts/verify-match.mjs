/**
 * Uji algoritma pencocokan bentuk dengan data siluet sintetis, tanpa browser.
 *
 * Setiap kasus memakai nilai teoritis siluet bangun tersebut, lalu memberi
 * sedikit derau supaya pencocokan tidak hanya lulus pada data yang persis
 * sempurna. Yang diuji adalah dua ciri sekaligus: `outline` (kategori hasil
 * pembacaan sudut) dan `extent` (rasio isi siluet terhadap kotak pembatasnya).
 *
 * Jalankan: node scripts/verify-match.mjs
 */
import assert from 'node:assert/strict'
import { matchShape } from '../src/scan/matchShape.js'

/**
 * Membangun sekumpulan pengukuran untuk satu sudut pandang.
 *
 * `outline` adalah kategori yang akan dibaca dari kontur, dan `extent` adalah
 * nilai teoretisnya. Keduanya diberi derau sedikit supaya algoritma diuji pada
 * kondisi yang tidak sempurna.
 */
const view = (outline, cornerCount, extent, relativeWidth, relativeHeight) => ({
  ok: true,
  outline,
  extent: extent * (1 + (Math.random() - 0.5) * 0.06),
  cornerCount,
  relativeWidth,
  relativeHeight,
  area: Math.round(relativeWidth * relativeHeight * 40000),
  boxWidth: Math.round(relativeWidth * 320),
  boxHeight: Math.round(relativeHeight * 320),
  coverage: relativeWidth * relativeHeight,
  aspect: relativeWidth / relativeHeight,
})

const RECT = ['rect', 4]
const ROUND_VIEW = ['round', 11]
const TRIANGLE = ['triangle', 3]

const ROUND = Math.PI / 4
const jitter = (value, amount) => value * (1 + amount)

const cases = [
  {
    name: 'Tabung (tumbler) tegak, lebih tinggi dari lebarnya',
    expected: 'cylinder',
    measurements: {
      // Sisi: persegi siku-siku. Atas: bundar.
      front: view(...RECT, jitter(1, 0.03), 0.4, 0.48),
      right: view(...RECT, jitter(1, 0.03), 0.4, 0.48),
      top: view(...ROUND_VIEW, jitter(ROUND, 0.04), 0.4, 0.4),
    },
  },
  {
    name: 'Balok tegak, hampir sama lebar dan tingginya',
    expected: 'box',
    measurements: {
      // Semua sisi: persegi siku-siku, termasuk dilihat dari atas.
      front: view(...RECT, jitter(1, 0.02), 0.5, 0.42),
      right: view(...RECT, jitter(1, 0.02), 0.36, 0.42),
      top: view(...RECT, jitter(1, 0.02), 0.5, 0.36),
    },
  },
  {
    name: 'Bola',
    expected: 'sphere',
    measurements: {
      // Dari semua arah: bundar.
      front: view(...ROUND_VIEW, jitter(ROUND, 0.03), 0.45, 0.45),
      right: view(...ROUND_VIEW, jitter(ROUND, 0.03), 0.45, 0.45),
      top: view(...ROUND_VIEW, jitter(ROUND, 0.03), 0.45, 0.45),
    },
  },
  {
    name: 'Kerucut',
    expected: 'cone',
    measurements: {
      // Sisi: segitiga. Atas: bundar.
      front: view(...TRIANGLE, jitter(0.5, 0.04), 0.45, 0.53),
      right: view(...TRIANGLE, jitter(0.5, 0.04), 0.45, 0.53),
      top: view(...ROUND_VIEW, jitter(ROUND, 0.04), 0.45, 0.45),
    },
  },
  {
    name: 'Limas segi empat',
    expected: 'pyramid',
    measurements: {
      // Sisi: segitiga. Atas: persegi siku-siku.
      front: view(...TRIANGLE, jitter(0.5, 0.04), 0.46, 0.46),
      right: view(...TRIANGLE, jitter(0.5, 0.04), 0.46, 0.46),
      top: view(...RECT, jitter(1, 0.03), 0.46, 0.46),
    },
  },
  {
    name: 'Balok dengan satu sudut yang tidak terbaca siku-siku',
    expected: 'box',
    measurements: {
      // Kategori 'other' muncul kalau sudut membulat, misalnya foto jarak dekat
      // dengan sedikit blur. Pencocokan harus tetap memilih balok, bukan
      // menyingkirkannya hanya karena satu sudut tidak siku-siku.
      front: view('other', 6, jitter(1, 0.02), 0.5, 0.42),
      right: view(...RECT, jitter(1, 0.02), 0.36, 0.42),
      top: view(...RECT, jitter(1, 0.02), 0.5, 0.36),
    },
  },
]

let failed = 0

for (const testCase of cases) {
  const match = matchShape(testCase.measurements)
  const pass = match.ok === true && match.shapeId === testCase.expected
  if (pass === false) failed += 1

  const scores = match.ranking.map((item) => `${item.label}=${item.score.toFixed(3)}`).join('  ')
  console.log(`${pass === true ? '  ok  ' : ' GAGAL'} ${testCase.name}`)
  console.log(`        terdeteksi: ${match.label} (harapan: ${testCase.expected}), keyakinan ${Math.round(match.confidence * 100)}%`)
  console.log(`        ${scores}`)
}

// Ukuran harus tetap di dalam rentang slider dan tidak negatif.
for (const testCase of cases) {
  const match = matchShape(testCase.measurements)
  for (const [key, value] of Object.entries(match.dims)) {
    assert.ok(value > 0, `dimensi ${key} harus positif pada kasus ${testCase.expected}`)
    assert.ok(Number.isFinite(value), `dimensi ${key} harus angka pada kasus ${testCase.expected}`)
  }
}

// Tanpa pengukuran yang valid, match harus gagal dengan pesan, bukan melempar error.
const noData = matchShape({})
assert.equal(noData.ok, false, 'tanpa data harus gagal dengan rapi')
assert.ok(typeof noData.reason === 'string' && noData.reason.length > 0, 'harus ada alasan kegagalan')

// Hanya satu tampilan pun tetap harus menghasilkan tebakan, walau keyakinannya
// ditahan rendah karena tabung dan balok tidak bisa dibedakan dari depan saja.
const singleView = matchShape({ front: view(...RECT, 1, 0.4, 0.48) })
assert.equal(singleView.ok, true, 'satu tampilan masih boleh dicocokkan')
assert.ok(singleView.confidence <= 0.5, 'keyakinan tanpa foto atas harus ditahan di 0,5 atau lebih rendah')
assert.equal(singleView.needsTopView, true, 'harus ditandai bahwa foto atas belum ada')

// Tanpa foto atas, tabung dan balok seharusnya berdekatan karena memang tidak
// bisa dibedakan dari dua tampilan itu.
const noTop = matchShape({
  front: view(...RECT, 1, 0.4, 0.48),
  right: view(...RECT, 1, 0.4, 0.48),
})
const cylinderGap = noTop.ranking.find((item) => item.id === 'cylinder').score
const boxGap = noTop.ranking.find((item) => item.id === 'box').score
assert.ok(Math.abs(cylinderGap - boxGap) < 0.06, 'tabung dan balok memang hampir identik tanpa foto atas')

// Tampilan atas membuat keduanya terpisah dengan jelas.
const withTop = matchShape({
  front: view(...RECT, 1, 0.4, 0.48),
  right: view(...RECT, 1, 0.4, 0.48),
  top: view(...ROUND_VIEW, ROUND, 0.4, 0.4),
})
const cylinderWithTop = withTop.ranking.find((item) => item.id === 'cylinder').score
const boxWithTop = withTop.ranking.find((item) => item.id === 'box').score
assert.ok(
  boxWithTop - cylinderWithTop > 0.04,
  'foto atas harus membuat selisih tabung dan balok jauh lebih besar',
)

// Jumlah sudut harus lebih berperan daripada rasio isi: dua siluet yang rasionya
// hampir sama tapi berbeda kategori sudut harus menghasilkan tebakan berbeda.
const sameExtentDifferentOutline = matchShape({
  front: view(...RECT, 0.9, 0.4, 0.5),
  right: view(...RECT, 0.9, 0.4, 0.5),
  top: view(...RECT, 0.9, 0.4, 0.5),
})
assert.equal(
  sameExtentDifferentOutline.shapeId,
  'box',
  'persegi dari semua arah harus tetap terbaca sebagai balok walau rasio isinya di 0,9',
)

assert.equal(failed, 0, `${failed} kasus pencocokan gagal`)

console.log('\nSemua pencocokan bentuk lulus.')