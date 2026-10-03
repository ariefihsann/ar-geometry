/**
 * Langkah pemindaian terbimbing.
 *
 * Ada dua kelompok sudut pandang:
 *
 *   - `front`, `right`, dan `top` adalah sudut yang dipakai untuk menebak
 *     bentuk. Sudut inilah yang dipakai `matchShape`, dan hanya tiga agar siswa
 *     tidak terlalu lelah memindai.
 *
 *   - `back`, `left`, dan `bottom` adalah sudut tambahan. Sudut-sudut ini tidak
 *     memengaruhi tebakan bentuk, tetapi dipakai untuk mengecek konsistensi:
 *     kalau sudut yang sama dari dua arah berbeda memberi hasil berbeda,
 *     hasilnya deserves jawaban "kurang yakin" supaya siswa tahu perlu mengulang.
 *
 * Nama `front`, `right`, dan `top` sengaja memakai arah benda, bukan arah
 * kamera, supaya siswa tidak perlu mengingat istilah yang membingungkan.
 */
import { VIEW_LABELS } from './shapeLibrary.js'

export const SCAN_STEPS = [
  {
    view: 'front',
    title: 'Tampak depan',
    instruction: 'Letakkan benda tegak di tengah bingkai, lalu ambil foto dari tepat di depannya.',
    tip: 'Pastikan seluruh benda terlihat dan tidak terpotong pinggir.',
  },
  {
    view: 'right',
    title: 'Tampak kanan',
    instruction: 'Berputar 90 derajat, lalu ambil foto dari samping kanan benda.',
    tip: 'Jaga jarak dan tinggi kamera sama seperti langkah sebelumnya.',
  },
  {
    view: 'top',
    title: 'Tampak atas',
    instruction: 'Arahkan kamera ke atas benda dari tepat di atas, lalu ambil foto.',
    tip: 'Ini langkah penentu untuk membedakan tabung, kerucut, dan balok.',
  },
  {
    view: 'back',
    title: 'Tampak belakang',
    instruction: 'Putar benda 180 derajat, lalu ambil foto dari belakangnya.',
    tip: 'Sudut ini tidak mengubah tebakan bentuk, hanya mengecek hasilnya.',
  },
  {
    view: 'left',
    title: 'Tampak kiri',
    instruction: 'Putar benda 90 derajat ke arah lain, lalu ambil foto dari samping kiri.',
    tip: 'Bandingkan dengan langkah tampak kanan: bentuknya harus sama.',
  },
  {
    view: 'bottom',
    title: 'Tampak bawah',
    instruction: 'Angkat benda, lalu arahkan kamera ke bagian alasnya.',
    tip: 'Alas lingkaran berarti tabung atau kerucut; alas persegi berarti balok atau limas.',
  },
]

export function stepLabel(view) {
  return VIEW_LABELS[view] ?? view
}

/** Sudut yang dipakai untuk menebak bentuk. */
export const SHAPE_VIEWS = ['front', 'right', 'top']

/** Sudut tambahan yang hanya dipakai untuk mengecek konsistensi. */
export const EXTRA_VIEWS = ['back', 'left', 'bottom']