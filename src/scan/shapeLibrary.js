/**
 * Pustaka bangun ruang yang bisa dikenali oleh pemindai kamera.
 *
 * Pencocokan memakai dua ciri siluet pada tiap sudut pandang:
 *
 * 1. `outline` -- bentuk yang dibaca dari jumlah sudut kontur, hasil aproksimasi
 *    Douglas-Peucker (setara cv2.approxPolyDP). Ini ciri terkuat karena
 *    membedakan bentuk secara langsung:
 *      - `rect`     -> 4 sudut siku-siku (balok, atau sisi tabung)
 *      - `triangle` -> 3 sudut (alas limas atau kerucut)
 *      - `round`    -> banyak sudut tumpul (bola, atau tutup tabung)
 *
 * 2. `extent` -- rasio isi siluet terhadap kotak pembatasnya, sebagai pemilah
 *    halus antara kategori yang mirip: persegi (1,0), lingkaran (0,785),
 *    dan segitiga (0,5).
 */

const ROUND = Math.PI / 4
const TRIANGLE = 0.5

export const SHAPE_LIBRARY = {
  cylinder: {
    id: 'cylinder',
    label: 'Tabung',
    hint: 'Dua bidang datar berbentuk lingkaran yang dipisahkan permukaan lengkung.',
    outline: { front: 'rect', right: 'rect', top: 'round' },
    fill: { front: 1, right: 1, top: ROUND },
    dims: { d: 10, h: 12 },
    dimSpec: [
      { key: 'd', label: 'Diameter', min: 4, max: 40, step: 0.5 },
      { key: 'h', label: 'Tinggi', min: 4, max: 60, step: 0.5 },
    ],
  },

  box: {
    id: 'box',
    label: 'Balok',
    hint: 'Enam bidang datar berbentuk persegi panjang.',
    outline: { front: 'rect', right: 'rect', top: 'rect' },
    fill: { front: 1, right: 1, top: 1 },
    dims: { p: 12, l: 9, h: 10 },
    dimSpec: [
      { key: 'p', label: 'Panjang', min: 3, max: 60, step: 0.5 },
      { key: 'l', label: 'Lebar', min: 3, max: 60, step: 0.5 },
      { key: 'h', label: 'Tinggi', min: 3, max: 60, step: 0.5 },
    ],
  },

  sphere: {
    id: 'sphere',
    label: 'Bola',
    hint: 'Seluruh permukaannya melengkung, tanpa bidang datar.',
    outline: { front: 'round', right: 'round', top: 'round' },
    fill: { front: ROUND, right: ROUND, top: ROUND },
    dims: { d: 10 },
    dimSpec: [{ key: 'd', label: 'Diameter', min: 4, max: 40, step: 0.5 }],
  },

  cone: {
    id: 'cone',
    label: 'Kerucut',
    hint: 'Satu bidang datar berbentuk lingkaran dengan selubung melengkung.',
    outline: { front: 'triangle', right: 'triangle', top: 'round' },
    fill: { front: TRIANGLE, right: TRIANGLE, top: ROUND },
    dims: { d: 12, h: 14 },
    dimSpec: [
      { key: 'd', label: 'Diameter alas', min: 4, max: 40, step: 0.5 },
      { key: 'h', label: 'Tinggi', min: 4, max: 60, step: 0.5 },
    ],
  },

  pyramid: {
    id: 'pyramid',
    label: 'Limas Segi Empat',
    hint: 'Satu bidang persegi sebagai alas, dikelilingi empat bidang segitiga.',
    outline: { front: 'triangle', right: 'triangle', top: 'rect' },
    fill: { front: TRIANGLE, right: TRIANGLE, top: 1 },
    dims: { a: 12, h: 12 },
    dimSpec: [
      { key: 'a', label: 'Sisi alas', min: 3, max: 50, step: 0.5 },
      { key: 'h', label: 'Tinggi', min: 3, max: 60, step: 0.5 },
    ],
  },
}

export const MEASURED_VIEWS = ['front', 'right', 'top']

export const VIEW_LABELS = {
  front: 'tampak depan',
  right: 'tampak kanan',
  left: 'tampak kiri',
  top: 'tampak atas',
  bottom: 'tampak bawah',
  back: 'tampak belakang',
}

export function shapeById(id) {
  return SHAPE_LIBRARY[id] ?? SHAPE_LIBRARY.cylinder
}
