/**
 * Pencocokan deskripsi siluet ke pustaka bangun ruang.
 *
 * Dua ciri dipakai berurutan dari yang paling menentukan:
 *
 * 1. `outline` -- jumlah sudut hasil aproksimasi kontur (cv2.approxPolyDP).
 *    Ini yang membedakan bentuk secara langsung, jadi galatnya diberi bobot
 *    besar. Tampilan depan dan samping menentukan "kelas" bentuk: persegi
 *    siku-siku, segitiga, atau bundar.
 *
 * 2. `extent` -- rasio isi siluet terhadap kotak pembatasnya, sebagai pemilah
 *    halus di dalam satu kelas. Nilai teoritis:
 *
 *      bangun            depan/samping   atas
 *      ---------------------------------------------
 *      Balok             1,000           1,000     (persegi dari semua arah)
 *      Tabung            1,000           0,785     (persegi dari samping, lingkaran dari atas)
 *      Bola              0,785           0,785     (lingkaran dari semua arah)
 *      Kerucut           0,500           0,785     (segitiga dari samping, lingkaran dari atas)
 *      Limas Segi Empat  0,500           1,000     (segitiga dari samping, persegi dari atas)
 *
 *    Perhatikan bahwa foto dari atas adalah penentu utama di dalam kelas
 *    persegi: tanpa itu, tabung dan balok tidak bisa dibedakan karena siluet
 *    sampingnya identik.
 *
 * Confidence tidak hanya bergantung pada galat absolut, tapi juga pada selisih
 * terhadap kandidat runners-up. Kalau dua kandidat hampir seri, hasilnya ditandai
 * kurang yakin dan UI meminta siswa memilih sendiri.
 */
import { MEASURED_VIEWS, SHAPE_LIBRARY } from './shapeLibrary.js'

/** Toleransi untuk proporsi, longgar karena foto sering diambil dari sedikit di atas. */
const HEIGHT_RATIO = {
  cylinder: [0.7, 2.4],
  cone: [0.7, 2.4],
  box: [0.4, 2.6],
  sphere: [0.55, 1.8],
  pyramid: [0.4, 2.2],
}

/**
 * Biaya untuk siluet yang hanya satu-duanya punya kategori sisi dan puncak yang
 * sama. Nilai ini jauh lebih besar dari galat `extent` supaya jumlah sudut benar
 *-benar menjadi penentu utama.
 */
const OUTLINE_MISMATCH = 0.45

/** Galat `extent` yang dianggap masih wajar, dalam skala 0..1. */
const EXTENT_SCALE = 0.16

/**
 * Kategori `rect` dan `triangle` bisa tertukar posisinya kalau bendanya miring,
 * sehingga kedua ketidakcocokan ini diberi biaya lebih ringan.
 */
function outlinePenalty(measured, expected) {
  if (measured === expected) return 0
  if (measured === 'other' || measured === 'unknown') return OUTLINE_MISMATCH * 0.35
  if ((measured === 'rect' && expected === 'triangle') || (measured === 'triangle' && expected === 'rect')) {
    return OUTLINE_MISMATCH * 0.6
  }
  if ((measured === 'rect' && expected === 'round') || (measured === 'round' && expected === 'rect')) {
    return OUTLINE_MISMATCH * 0.75
  }
  return OUTLINE_MISMATCH
}

export function matchShape(measurements) {
  const usable = {}
  for (const view of MEASURED_VIEWS) {
    const item = measurements[view]
    if (item != null && item.ok === true) usable[view] = item
  }

  if (Object.keys(usable).length === 0) {
    return { ok: false, reason: 'Belum ada foto yang berhasil diukur.' }
  }

  const { front, right, top } = usable
  const candidates = []

  for (const preset of Object.values(SHAPE_LIBRARY)) {
    let score = 0
    let weight = 0
    const detail = []
    let outlineHits = 0

    for (const view of MEASURED_VIEWS) {
      const measured = usable[view]
      if (measured == null) continue

      // Bobot tiga kali lipat karena jumlah sudut adalah ciri terkuat.
      const viewWeight = (view === 'top' ? 1.8 : 1) * 3

      const expectedOutline = preset.outline[view]
      const actualOutline = measured.outline ?? 'unknown'
      const outlineError = outlinePenalty(actualOutline, expectedOutline)
      if (outlineError === 0) outlineHits += 1

      const expectedExtent = preset.fill[view]
      const extentError = Math.abs(measured.extent - expectedExtent)

      score += (outlineError + extentError) * viewWeight
      weight += viewWeight
      detail.push({
        view,
        outline: actualOutline,
        corners: measured.cornerCount ?? 0,
        expectedOutline,
        extent: measured.extent,
        expectedExtent,
      })
    }

    if (weight === 0) continue

    // Lebar dari depan dan dari samping sebaiknya mirip kalau benda berdiri tegak.
    if (front != null && right != null) {
      score += Math.abs(front.relativeWidth - right.relativeWidth) * 1.2
      weight += 1.2
    }

    // Untuk tabung dan kerucut, lebar tampak depan sebanding dengan diameter
    // tampak atas; untuk balok, lebar atas mengikuti panjang, bukan lebarnya.
    if (front != null && top != null) {
      if (preset.id === 'box') {
        score += Math.abs(front.relativeWidth - top.relativeHeight) * 0.8
        weight += 0.8
      } else {
        score += Math.abs(front.relativeWidth - top.relativeWidth) * 0.8
        weight += 0.8
      }
    }

    // Proporsi tinggi terhadap lebar, dengan toleransi longgar per bangun.
    if (front != null && HEIGHT_RATIO[preset.id] != null) {
      const ratio = clamp(front.relativeHeight / Math.max(front.relativeWidth, 1e-3), 0.15, 6)
      const [min, max] = HEIGHT_RATIO[preset.id]
      const excess = ratio < min ? min - ratio : ratio > max ? ratio - max : 0
      score += excess * 0.5
      weight += 0.5
    }

    candidates.push({
      id: preset.id,
      score: score / weight,
      outlineHits,
      matchedViews: MEASURED_VIEWS.filter((view) => usable[view] != null).length,
      detail,
    })
  }

  candidates.sort((a, b) => a.score - b.score)
  const best = candidates[0]
  const runnerUp = candidates[1]
  const preset = SHAPE_LIBRARY[best.id]

  // Keyakinan dua sumber: seberapa dekat dengan nilai teoritis, dan seberapa
  // jauh di depan kandidat kedua. Kalau seri, hasilnya tidak boleh genocide.
  const accuracy = clamp(1 - best.score / (EXTENT_SCALE + OUTLINE_MISMATCH), 0, 1)
  const margin = runnerUp == null ? 1 : clamp((runnerUp.score - best.score) / 0.12, 0, 1)

  // Kalau semua sudut pandang terbaca sesuai kategori yang diharapkan, keyakinan
  // naik karena pembacaan konturnya konsisten.
  const outlinePerfect = best.outlineHits === best.matchedViews ? 0.25 : 0
  let confidence = clamp(accuracy * 0.45 + margin * 0.35 + outlinePerfect + 0.15, 0, 1)

  // Kalau siluet hanya ketemu setelah penyaringan bayangan dimatikan, foto itu
  // mungkin memuat bayangan yang ikut terukur, jadi keyakinan ditahan.
  if (Object.values(usable).some((item) => item.shadowSuspected === true)) {
    confidence = Math.min(confidence, 0.55)
  }

  const viewCount = Object.keys(usable).length
  const needsTopView = top == null

  // Tanpa foto dari atas, tabung dan balok memang tidak bisa dibedakan, jadi
  // keyakinan tidak boleh tinggi meskipun pencocokannya mendekati nilai teoritis.
  if (needsTopView) confidence = Math.min(confidence, 0.45)
  if (viewCount < 3) confidence = Math.min(confidence, 0.6)

  return {
    ok: true,
    shapeId: best.id,
    label: preset.label,
    hint: preset.hint,
    confidence,
    viewCount,
    needsTopView,
    close: margin < 0.35,
    ranking: candidates.map((item) => ({
      id: item.id,
      label: SHAPE_LIBRARY[item.id].label,
      score: item.score,
      outlineHits: item.outlineHits,
    })),
    detail: best.detail,
    dims: estimateDimensions(preset.id, usable),
  }
}

/**
 * Mengubah ukuran relatif piksel menjadi ukuran cm yang masuk akal.
 *
 * Skala absolut tidak bisa diketahui dari satu foto karena jarak kamera tidak
 * diketahui, jadi yang dijaga adalah perbandingan antar tampilan, lalu memakai
 * ukuran bawaan yang wajar untuk tiap bangun. Siswa tetap dapat mengoreksi
 * ukuran sebenarnya lewat slider.
 */
function estimateDimensions(shapeId, usable) {
  const preset = SHAPE_LIBRARY[shapeId]
  const dims = { ...preset.dims }
  const { front, right, top } = usable

  if (front != null && preset.dimSpec.some((spec) => spec.key === 'h')) {
    const ratio = clamp(front.relativeHeight / Math.max(front.relativeWidth, 1e-3), 0.35, 3)
    dims.h = round1(dims.h * ratio)
  }

  if (shapeId === 'box' && front != null && top != null) {
    // Panjang dari lebar tampak depan, lebar dari lebar tampak atas.
    const lengthRatio = clamp(front.relativeWidth / 0.42, 0.6, 1.7)
    const widthRatio = clamp(top.relativeHeight / 0.42, 0.6, 1.7)
    dims.p = round1(dims.p * lengthRatio)
    dims.l = round1(dims.p * widthRatio)
    if (right != null) {
      dims.l = round1(dims.l * clamp(right.relativeWidth / 0.42, 0.6, 1.7))
    }
  }

  if (top != null && (shapeId === 'cylinder' || shapeId === 'cone' || shapeId === 'sphere')) {
    dims.d = round1(dims.d * clamp(top.relativeWidth / 0.42, 0.6, 1.8))
  }

  for (const spec of preset.dimSpec) {
    if (dims[spec.key] == null) continue
    dims[spec.key] = clamp(dims[spec.key], spec.min, spec.max)
  }

  return dims
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round1 = (value) => Math.round(value * 10) / 10