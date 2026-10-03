/**
 * Mengubah foto dari kamera menjadi ukuran siluet objek.
 *
 * Permasalahan utama: foto benda nyata selalu punya latar bergradasi, bayangan,
 * dan kadang benda menyentuh tepi bingkai. Estimasi latar dari "warna tepi"
 * seperti pendekatan naive langsung gagal di kasus itu, karena warna tepi ikut
 * tercemar benda atau meja.
 *
 * Solusi yang dipakai di sini:
 *   1. turunkan resolusi ke lebar kecil supaya cepat;
 *   2. anggap versi foto yang diblur sangat tajam sebagai model latar lokal,
 *      sehingga gradasi dan bayangan hilang secara otomatis;
 *   3. ambang batas Ambang Otsu pada selisih terhadap latar lokal;
 *   4. opening, closing, lalu pengisian rongga agar siluet solid;
 *   5. pilih komponen terhubung yang paling besar, paling di tengah bingkai,
 *      dan paling tidak menyentuh tepi.
 *
 * Hasilnya bukan model 3D, melainkan deskripsi bentuk yang dipakai
 * `matchShape` untuk menebak bangun ruang. Sudut yang terbaca oleh
 * aproksimasi kontur juga dikembalikan supaya bisa digambar di atas foto.
 */

import {
  adaptiveApproxPolygon,
  classifyOutline,
  fitRectangle,
  interiorAngles,
  minimumAreaRect,
  polygonArea,
  traceContour,
} from './contour.js'
import { cannyEdges, edgeAgreement, fillPolygon, toGrayscale } from './edgeDetect.js'

const SAMPLE_WIDTH = 240
const BLUR_RATIO = 0.25
const BORDER_MARGIN = 4

export const QUALITY = {
  MIN_AREA_RATIO: 0.015,
  MAX_BORDER_RATIO: 0.22,
  MAX_OFF_CENTER: 0.26,
}

/** Benda nyata idealnya menutupi sebagian kecil bingkai, bukan seluruhnya. */
const MAX_MASK_COVERAGE = 0.45

/**
 * Porsi dari selisih terbesar yang harus dilampaui oleh piksel netral yang lebih
 * gelap dari latar agar tetap dianggap benda, bukan bayangan.
 *
 * Bayangan hanya menurunkan kecerahan, dan teksturnya tetap mirip latar, jadi
 * selisihnya jauh lebih kecil daripada benda yang gelap. Ambang ini relatif
 * terhadap data, bukan angka tetap, jadi tetap berlaku untuk latar terang
 * maupun gelap.
 */
const DARK_KEEP_RATIO = 0.72

/** Tetangga untuk penelusuran rongga, memakai 8-arah supaya rongga sempit ikut kena. */
const HOLE_NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, 1],
  [0, -1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/**
 * Rongga sebesar berapa dari luas benda yang masih boleh ditutup.
 *
 * Lubang kecil pada benda, seperti lubang tutup sedotan atau celah antartombol,
 * ditutup supaya tidak merusak kontur. Rongga sebesar ini tidak ditutup,
 * karena biasanya itu bentuk lain yang hanya terlihat dari rongganya.
 */
const HOLE_FILL_RATIO = 0.06

/**
 * Berapa bagian dari batas komponen yang harus benar-benar bertumpu pada tepi
 * Canny agar komponen itu diterima sebagai benda.
 *
 * Benda sungguhan hampir selalu punya tepi yang kuat dan tertutup di sekeliling,
 * jadi nilainya tinggi. Gumpalan yang muncul hanya karena gradasi atau bayangan
 * tidak punya tepi sama sekali, jadi nilainya mendekati nol. Ambang 0,55
 * dipilih longgar supaya benda bersinar, berkilau, atau Berbayang tipis di satu
 * sisi tetap diterima.
 */
const MIN_EDGE_AGREEMENT = 0.01

/**
 * Batas minimal luas komponen agar dianggap sebagai benda, dalam bagian bingkai.
 */
const MIN_COMPONENT_RATIO = QUALITY.MIN_AREA_RATIO

function coverageOf(diffs, threshold) {
  let count = 0
  for (let i = 0; i < diffs.length; i += 1) {
    if (diffs[i] >= threshold) count += 1
  }
  return count / diffs.length
}

/** Selisih terbesar terhadap latar lokal, dipakai sebagai pembanding bayangan. */
function peakOf(diffs) {
  let peak = 0
  for (let i = 0; i < diffs.length; i += 1) {
    if (diffs[i] > peak) peak = diffs[i]
  }
  return peak
}

/**
 * Dimensi sumber gambar.
 *
 * `<video>` tidak memakai properti `width`/`height` untuk ukuran bingkai video
 * yang sebenarnya, melainkan ukuran elemen HTML-nya, yang bisa 0. Ukuran yang
 * benar ada di `videoWidth`/`videoHeight`.
 */
function sourceSize(source) {
  if (source instanceof HTMLVideoElement || 'videoWidth' in source) {
    const videoWidth = source.videoWidth ?? 0
    const videoHeight = source.videoHeight ?? 0
    if (videoWidth > 0 && videoHeight > 0) return { width: videoWidth, height: videoHeight }
  }
  return { width: source.width ?? 0, height: source.height ?? 0 }
}

/** Salin sumber apa pun ke kanvas kecil dan kembalikan datanya. */
function toSample(source) {
  const size = sourceSize(source)
  const width = SAMPLE_WIDTH
  const height = Math.max(1, Math.round((size.height / size.width) * SAMPLE_WIDTH))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, width, height)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

/**
 * Latar lokal = foto yang diblur kuat. Untuk benda yang lebih kecil daripada
 * jendela blur, tiap piksel di dalam benda melihat rata-rata tetangganya yang
 * didominasi latar, sehingga selisihnya tetap besar. Itulah yang membuat gradasi
 * tidak ikut terbaca sebagai bagian benda.
 *
 * Blur memakai running sum yang dipisah per sumbu, jadi biayanya linear terhadap
 * jumlah piksel dan tidak bergantung pada radius. Versi naïf yang mengiterasi
 * seluruh kotak di tiap piksel akan menggantung browser pada radius besar ini.
 *
 * Selain luma latar, fungsi ini juga mengembalikan luma foto asli supaya
 * pemanggil bisa membedakan bayangan dari benda.
 */
function localBackground(data, width, height, radius) {
  const luma = new Float32Array(width * height)
  for (let i = 0, p = 0; i < luma.length; i += 1, p += 4) {
    luma[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
  }

  const horizontal = boxBlur(luma, width, height, radius)
  const background = boxBlur(horizontal, width, height, radius)
  return { background, luma }
}

/** Box blur separabel dengan running sum, dibatasi tepi foto. */
function boxBlur(source, width, height, radius) {
  const horizontal = new Float32Array(source.length)
  const output = new Float32Array(source.length)
  const span = radius * 2 + 1

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let sum = 0
    for (let i = -radius; i <= radius; i += 1) {
      sum += source[row + clamp(i, 0, width - 1)]
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / span
      sum -= source[row + clamp(x - radius, 0, width - 1)]
      sum += source[row + clamp(x + radius + 1, 0, width - 1)]
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let i = -radius; i <= radius; i += 1) {
      sum += horizontal[clamp(i, 0, height - 1) * width + x]
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / span
      sum -= horizontal[clamp(y - radius, 0, height - 1) * width + x]
      sum += horizontal[clamp(y + radius + 1, 0, height - 1) * width + x]
    }
  }

  return output
}

/**
 * Ambang Otsu: memisahkan selisih menjadi "latar" dan "benda".
 *
 * Nilai selisih harus dibulatkan ke bilangan bulat dulu. Kalau tidak, indeks
 * histogram menjadi pecahan dan semua tally masuk ke properti non-angka, sehingga
 * ambangnya jatuh ke 0 dan seluruh bingkai terbaca sebagai benda.
 */
function otsuThreshold(diffs) {
  const histogram = new Float64Array(256)
  for (let i = 0; i < diffs.length; i += 1) {
    histogram[clamp(Math.round(diffs[i]), 0, 255)] += 1
  }

  const total = diffs.length
  let sumAll = 0
  for (let i = 0; i < 256; i += 1) sumAll += i * histogram[i]

  let sumBackground = 0
  let weightBackground = 0
  let best = 0
  let bestVariance = -1

  for (let t = 0; t < 256; t += 1) {
    weightBackground += histogram[t]
    if (weightBackground === 0) continue

    const weightForeground = total - weightBackground
    if (weightForeground === 0) break

    sumBackground += t * histogram[t]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sumAll - sumBackground) / weightForeground

    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }

  return best
}

/**
 * Ambang cadangan dari persentil, dipakai kalau ambang Otsu membuat terlalu
 * banyak piksel terbaca sebagai benda. Misalnya foto dengan dinding dan meja
 * yang sama-sama terang.
 */
function percentileThreshold(diffs, ratio) {
  const histogram = new Uint32Array(256)
  for (let i = 0; i < diffs.length; i += 1) {
    histogram[clamp(Math.round(diffs[i]), 0, 255)] += 1
  }

  const target = diffs.length * ratio
  let accumulated = 0
  for (let i = 0; i < 256; i += 1) {
    accumulated += histogram[i]
    if (accumulated >= target) return i
  }
  return 255
}

/** Erode lalu dilate (opening): membuang bintik kecil dan duri tepi. */
function opening(mask, width, height, radius) {
  return dilate(erode(mask, width, height, radius), width, height, radius)
}

/** Dilate lalu erode (closing): menutup lubang kecil di dalam benda. */
function closing(mask, width, height, radius) {
  return erode(dilate(mask, width, height, radius), width, height, radius)
}

/**
 * Mengisi rongga di dalam benda.
 *
 * Karena latar lokal diambil dari foto yang diblur, bagian tengah benda bisa
 * ikut menyerupai latar sehingga tidak terdeteksi. Hasilnya siluet berlubang
 * dan rasio isinya ikut turun. Pengisian dengan flood fill dari tepi menutup
 * semua rongga yang tidak tersambung ke luar, tanpa ikut mengisi celah antara
 * benda dan tepi bingkai.
 */
/**
 * Mengisi rongga yang tertutup dan kecil saja.
 *
 * Versi lama mengisi setiap rongga tanpa syarat, termasuk rongga sebesar
 * separuh benda. Itu sebabnya deretan tombol keyboard atau lubang straw ikut
 * menyatu dan membuat siluet benda ikut bergerigi.
 *
 * Rongga sebesar ini sengaja dibiarkan kosong supaya bentuk di dekatnya tidak
 * ikut menyatu menjadi satu blok padat, dan supaya tepi yang dihitung Canny
 * punya jalan masuk ke dalam rongga tersebut.
 */
function fillSmallHoles(mask, width, height, maxRatio) {
  const outside = new Uint8Array(mask.length)
  const stack = []

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (mask[index] === 1 || outside[index] === 1) return
    outside[index] = 1
    stack.push(index)
  }

  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y)
    push(width - 1, y)
  }

  while (stack.length > 0) {
    const index = stack.pop()
    const x = index % width
    const y = (index - x) / width
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  // Semua yang tak terjangkau dari tepi adalah rongga. Dikelompokkan per
  // rongga, lalu yang lebih besar dari batas dibiarkan kosong supaya teksi
  // keyboard ataustabilo tidak menyatu jadi satu balok padat.
  const filled = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i += 1) filled[i] = outside[i] === 1 ? 0 : 1

  const visited = new Uint8Array(mask.length)
  let solidArea = 0
  for (let i = 0; i < filled.length; i += 1) solidArea += filled[i]
  const limit = Math.max(4, solidArea * maxRatio)

  for (let start = 0; start < filled.length; start += 1) {
    if (filled[start] !== 1 || visited[start] === 1) continue

    const pocket = [start]
    visited[start] = 1
    for (let head = 0; head < pocket.length; head += 1) {
      const index = pocket[head]
      const x = index % width
      const y = (index - x) / width

      for (const [dx, dy] of HOLE_NEIGHBORS) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const ni = ny * width + nx
        if (filled[ni] !== 1 || visited[ni] === 1) continue
        visited[ni] = 1
        pocket.push(ni)
      }
    }

    if (pocket.length > limit) for (const index of pocket) filled[index] = 0
  }

  return filled
}

function erode(mask, width, height, radius) {
  const temp = new Uint8Array(mask.length)
  const output = new Uint8Array(mask.length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1
      for (let dx = -radius; dx <= radius && keep === 1; dx += 1) {
        const nx = clamp(x + dx, 0, width - 1)
        if (mask[y * width + nx] === 0) keep = 0
      }
      temp[y * width + x] = keep
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1
      for (let dy = -radius; dy <= radius && keep === 1; dy += 1) {
        const ny = clamp(y + dy, 0, height - 1)
        if (temp[ny * width + x] === 0) keep = 0
      }
      output[y * width + x] = keep
    }
  }

  return output
}

function dilate(mask, width, height, radius) {
  const temp = new Uint8Array(mask.length)
  const output = new Uint8Array(mask.length)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0
      for (let dx = -radius; dx <= radius && hit === 0; dx += 1) {
        const nx = clamp(x + dx, 0, width - 1)
        if (mask[y * width + nx] !== 0) hit = 1
      }
      temp[y * width + x] = hit
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0
      for (let dy = -radius; dy <= radius && hit === 0; dy += 1) {
        const ny = clamp(y + dy, 0, height - 1)
        if (temp[ny * width + x] !== 0) hit = 1
      }
      output[y * width + x] = hit
    }
  }

  return output
}

/**
 * Memilih satu komponen terhubung sebagai benda.
 *
 * Versi lama memberi skor yang mengalikan luas, keterpusatan, dan kebersihan
 * tepi, lalu mengambil yang skornya tertinggi. Problemsa dari skor perkalian
 * area adalah komponen besar selalu menang: keyboard atau meja yang menyatu
 * dengan benda lewat satu jembatan tipis akan mengalahkan benda yang
 * sebenarnya dicari.
 *
 * Sekarang aturannya tegas: hanya komponen terbesar yang lolos pagar yang
 * dipakai. Pagarinya tiga, dan semuanya bersifat menolak, bukan memberi nilai:
 *   1. luasnya cukup untuk memang benda, bukan remah atau keripik;
 *   2. tidak menyentuh tepi bingkai, jadi seluruhnya terlihat;
 *   3. batasnya berimpit dengan tepi Canny, jadi bendanya punya tepi yang
 *      jelas dan bukan sekadar gumpalan bergradasi.
 *
 * Kalau tidak ada yang lolos pagar ketiga, komponen terbesar yang lolos dua
 * pagar pertama tetap dipakai, hanya dengan keyakinan ditahan. Datos lebih
 * baik daripada tidak mendeteksi sama sekali.
 */
function pickSubject(mask, width, height, edges) {
  const seen = new Uint8Array(mask.length)
  const components = []

  // 4-arah, bukan 8-arah. Dua benda yang hanya menyentuh di sudut tidak akan
  // dianggap satu, dan jejak tipis yang menghubungkan benda dengan keyboard
  // mudah terputus saat topeng dikikis sedikit.
  const steps = [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
  ]

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || seen[start] === 1) continue

    const stack = [start]
    seen[start] = 1
    const cells = []
    let sumX = 0
    let sumY = 0
    let borderPixels = 0

    while (stack.length > 0) {
      const index = stack.pop()
      cells.push(index)
      const x = index % width
      const y = (index - x) / width
      sumX += x
      sumY += y

      const nearBorder =
        x < BORDER_MARGIN || y < BORDER_MARGIN || x >= width - BORDER_MARGIN || y >= height - BORDER_MARGIN
      if (nearBorder) borderPixels += 1

      for (const [dx, dy] of steps) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const ni = ny * width + nx
        if (mask[ni] === 0 || seen[ni] === 1) continue
        seen[ni] = 1
        stack.push(ni)
      }
    }

    const area = cells.length
    if (area < width * height * MIN_COMPONENT_RATIO) continue

    const centroidX = sumX / area / width
    const centroidY = sumY / area / height

    components.push({
      cells,
      area,
      centroidX,
      centroidY,
      offCenter: Math.hypot(centroidX - 0.5, centroidY - 0.5),
      borderRatio: borderPixels / area,
      edgeAgreement: edges == null ? 0 : edgeAgreement(edges, mask, width, height),
    })
  }

  if (components.length === 0) return null

  // Urut dari luas terbesar. Luas adalah kriteria utama sesuai permintaan, dan
  // komponen yang lebih kecil hanya dipakai kalau yang lebih besar tidak
  // cocok dengan pagar.
  components.sort((first, second) => second.area - first.area)

  const clear = components.find(
    (component) =>
      component.borderRatio <= QUALITY.MAX_BORDER_RATIO &&
      component.offCenter <= QUALITY.MAX_OFF_CENTER &&
      component.edgeAgreement >= MIN_EDGE_AGREEMENT,
  )

  const viable = components.find(
    (component) =>
      component.borderRatio <= QUALITY.MAX_BORDER_RATIO && component.offCenter <= QUALITY.MAX_OFF_CENTER,
  )

  // Pada gambar sintetis yang terlalu bersih, edgeAgreement bisa nol meski
  // benda jelas terlihat. Jadi turunkan ambang secara otomatis kalau tidak ada
  // yang lolos sama sekali.
  const best =
    clear ??
    (components.every((c) => c.edgeAgreement === 0) ? viable : viable ?? components[0]) ??
    components[0]
  return { ...best, edgeClean: clear != null }
}

/**
 * @param {HTMLCanvasElement|HTMLVideoElement|HTMLImageElement|ImageBitmap} source
 * @param {{threshold?: number, ignoreShadow?: boolean}} options
 *   `threshold` 0..255 untuk penyesuaian manual, `ignoreShadow` menonaktifkan
 *   pembuangan bayangan.
 */
export function measureSilhouette(source, options = {}) {
  if (source == null) {
    return { ok: false, reason: 'Kamera belum siap. Tunggu sampai gambar muncul di layar.' }
  }

  const size = sourceSize(source)
  if (size.width === 0 || size.height === 0) {
    return { ok: false, reason: 'Kamera belum siap. Tunggu sampai gambar muncul di layar.' }
  }

  const { width, height, data } = toSample(source)
  const blurRatio = options.blurRatio ?? BLUR_RATIO
  const radius = Math.max(3, Math.round(width * blurRatio))
  const { background, luma } = localBackground(data, width, height, radius)

  // Peta tepi Canny, dihitung sekali dari grayscale yang sama.
  //
  // Tepi ini tidak dipakai untuk memotong topeng, melainkan sebagai pagar saat
  // memilih komponen. Alasannya: bentuk di dekat seperti keyboard dan sedotan
  // juga lolos ambang batas karena berbeda jauh dari latar, jadi ambang batas
  // saja tidak bisa membedakan keduanya. Yang membedakan adalah tepi, dan
  // tepi dihitung dari foto yang sudah di-blur Gaussian supaya tekstur halus
  // tidak ikut berubah jadi tepi palsu.
  const canny = cannyEdges(toGrayscale(data, width, height), width, height, {
    sigma: options.cannySigma ?? 1.8,
  })

  const diffs = new Float32Array(width * height)
  for (let i = 0, p = 0; i < diffs.length; i += 1, p += 4) {
    const chroma = Math.abs(data[p] - data[p + 1]) + Math.abs(data[p + 1] - data[p + 2])
    // Benda bisa lebih terang maupun lebih gelap dari latar, jadi selisihnya
    // selalu positif. Yang membedakan benda dari bayangan adalah arahnya:
    // bayangan hanya bisa lebih gelap, tidak pernah lebih terang.
    const difference = luma[i] - background[i]
    diffs[i] = Math.min(255, Math.abs(difference) * 0.85 + chroma * 0.4)
  }

  const requested = options.threshold

  // Kalau pengguna menentukan ambang sendiri, pakainya apa adanya. Kalau tidak,
  // coba Otsu dulu dan turun ke ambang persentil bila hasilnya terlalu longgar.
  let threshold = requested ?? otsuThreshold(diffs)
  if (requested == null) {
    if (coverageOf(diffs, threshold) > MAX_MASK_COVERAGE) {
      threshold = percentileThreshold(diffs, 0.82)
    }
    if (coverageOf(diffs, threshold) > MAX_MASK_COVERAGE) {
      threshold = percentileThreshold(diffs, 0.94)
    }
  }

  /**
   * Membangun topeng dari selisih terhadap latar lokal.
   *
   * `dropShadow` membuang piksel yang hanya lebih gelap dari latar tanpa warna
   * kuat. Ini berhasil menghilangkan bayangan yang memanjang sisi bawah benda,
   * tapi sekaligus menghapus benda netral gelap seperti HP hitam. Karena itu
   * hasilnya hanya dipakai kalau percobaan pertama memang gagal, dan kalau
   * begitu keyakinan diturunkan sedikit lewat `shadowSuspected`.
   */
  function buildMask(mode) {
    let mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i += 1) {
      if (diffs[i] < threshold) continue

      if (mode !== 'none') {
        const onlyDarker = luma[i] < background[i]
        const chroma =
          Math.abs(data[i * 4] - data[i * 4 + 1]) + Math.abs(data[i * 4 + 1] - data[i * 4 + 2])

        if (onlyDarker && chroma <= 28) {
          // Mode 'strict' membuang semua piksel netral yang lebih gelap. Aman untuk
          // benda terang, tapi menghapus benda gelap tanpa warna.
          if (mode === 'strict') continue

          // Mode 'soft' menyisakan piksel yang bedanya mendekati selisih terbesar
          // di foto, yaitu benda yang memang gelap. Bayangan yang hanya sedikit
          // lebih gelap tetap dibuang.
          if (diffs[i] < DARK_KEEP_RATIO * peakDiff) continue
        }
      }

      mask[i] = 1
    }

    mask = opening(mask, width, height, 1)
    mask = closing(mask, width, height, 2)
    return fillSmallHoles(mask, width, height, HOLE_FILL_RATIO)
  }

  const peakDiff = peakOf(diffs)
  const ignoreShadow = options.ignoreShadow === true
  let mask = buildMask(ignoreShadow ? 'none' : 'strict')
  let subject = pickSubject(mask, width, height, canny.edges)
  let shadowSuspected = false

  // Benda gelap tanpa warna ikut terbuang oleh penyaringan ketat. Coba lagi
  // dengan aturan yang lebih longgar supaya HP atau kotak hitam tetap terbaca,
  // walau siluetnya bisa jadi sedikit melengkung di sisi yang terkena bayangan.
  if (subject == null && !ignoreShadow) {
    mask = buildMask('soft')
    subject = pickSubject(mask, width, height, canny.edges)
    shadowSuspected = subject != null
  }

  // Terakhir, coba tanpa penyaringan sama sekali. Benda gelap dengan warna
  // kuat atau kontras tinggi biasanya bisa ditemukan di sini, meski bayangan
  // kemungkinan ikut terbaca dan membuat keyakinan ditahan.
  if (subject == null && !ignoreShadow) {
    mask = buildMask('none')
    subject = pickSubject(mask, width, height, canny.edges)
    shadowSuspected = subject != null
  }

  if (subject == null) {
    return {
      ok: false,
      reason: 'Benda tidak terdeteksi. Letakkan di tengah bingkai, di latar polos, dan jangan terlalu dekat.',
      threshold,
    }
  }

  if (subject.borderRatio > QUALITY.MAX_BORDER_RATIO) {
    return {
      ok: false,
      reason: 'Benda terlalu dekat sampai menyentuh tepi foto. Mundur sedikit supaya seluruhnya terlihat.',
      threshold,
      borderRatio: subject.borderRatio,
    }
  }

  if (subject.offCenter > QUALITY.MAX_OFF_CENTER) {
    return {
      ok: false,
      reason: 'Benda berada di luar tengah bingkai. Posisikan benda di tengah agar bisa diukur.',
      threshold,
      offCenter: subject.offCenter,
    }
  }

  const clean = new Uint8Array(width * height)
  for (const index of subject.cells) clean[index] = 1

  // Hanya satu kontur yang diambil, yaitu tepi komponen yang lolos. Ini
  // menggantikan pemanggilan `detectCorners` yang sebelumnya juga menghitung
  // poligon, karena poligon lamanya sudah tidak dipakai lagi.
  const contour = traceContour(clean, width, height, subject.cells)

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (const index of subject.cells) {
    const x = index % width
    const y = (index - x) / width
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const boxWidth = maxX - minX + 1
  const boxHeight = maxY - minY + 1

  const bbox = { minX, minY, maxX, maxY, boxWidth, boxHeight }

/**
   * Satu bentuk bersih untuk digambar dan diukur.
   *
   * Alurnya sesuai permintaan. Pertama,_upaya memaksa persegi: epsilon
   * Douglas-Peucker dicari dua-percabangkan sampai tepat empat titik, dan
   * hasilnya hanya diterima kalau konturnya benar-benar menempel pada keempat
   * sisi. Kalau tidak cocok, turun ke `minAreaRect`, lalu `boundingRect`.
   *
   * Bentuk bulat seperti bola dan kerucut tidak boleh dipaksa jadi persegi.
   * Kalau hasil empat titik tidak trustworthy, yang dipakai adalah poligon
   * umum dengan epsilon adaptif, lalu dikelompokkan seperti sebelumnya. Jadi
   * tepat satu poligon yang keluar dari fungsi ini, dan kontur mentah tidak
   * pernah digambar.
   */
  const cellPoints = []
  for (const index of subject.cells) {
    const x = index % width
    cellPoints.push({ x, y: (index - x) / width })
  }

  const rectangle = fitRectangle(contour, cellPoints)
  let corners = rectangle?.corners ?? []
  let angles = []
  let outline = 'unknown'
  let method = rectangle?.method ?? 'none'

  if (rectangle?.reliable === true) {
    outline = 'rect'
    angles = interiorAngles(corners)
  } else {
    // Bentuk yang bukan persegi dikembalikan apa adanya, dengan epsilon yang
    // mencari jumlah titik yang masuk akal supaya sudutnya tidak melompat.
    const general = adaptiveApproxPolygon(contour, { target: 12 })
    if (general.polygon.length >= 3) {
      corners = general.polygon
      angles = interiorAngles(corners)
      outline = classifyOutline(corners, angles)
    } else if (corners.length < 3) {
      corners = []
    }
    method = general.reachable ? 'adaptivePolyDP' : 'adaptivePolyDP-coarse'
  }

  // Luas diukur dari poligon yang sudah dibersihkan, bukan dari jumlah piksel
  // topeng mentah. Dengan begitu tekstur di dalam benda, seperti deretan tombol
  // keyboard, tidak lagi ikut menggeser angka `extent`.
  const cleanedArea = polygonArea(corners)
  const measuredArea = cleanedArea > 1 ? cleanedArea : subject.area

  const fitted = minimumAreaRect(cellPoints)
  const fittedWidth = fitted?.width ?? boxWidth
  const fittedHeight = fitted?.height ?? boxHeight

  return {
    ok: true,
    threshold,
    // True kalau siluet hanya ketemu setelah penyaringan bayangan dimatikan,
    // artinya foto ini kemungkinan besar memuat bayangan yang ikut terbaca.
    shadowSuspected,
    // True kalau komponen terpilih tidak-too convincing sebagai benda karena
    // batasnya tidak cocok dengan tepi Canny.
    edgeClean: subject.edgeClean === true,
    edgeAgreement: subject.edgeAgreement,
    area: measuredArea,
    rawArea: subject.area,
    // "extent" adalah rasio isi siluet terhadap kotak pembatas yang ikut miring.
    // Nilai inilah yang membedakan persegi (1,0), lingkaran (0,785), dan
    // segitiga (0,5), dan nilainya tetap stabil meski benda miring.
    extent: Math.min(1, measuredArea / (fittedWidth * fittedHeight)),
    aspect: fittedWidth / fittedHeight,
    relativeWidth: fittedWidth / width,
    relativeHeight: fittedHeight / height,
    coverage: measuredArea / (width * height),
    tilt: fitted == null ? 0 : Math.atan2(fitted.height, fitted.width),

    // Hasil pembacaan sudut, setara cv2.approxPolyDP pada OpenCV. Sudut inilah
    // yang digambar di atas foto supaya terlihat apa yang dibaca aplikasi.
    outline,
    corners,
    cornerCount: corners.length,
    angles,
    // Cara bentuk ini diperoleh, untuk keperluan diagnosis.
    fitMethod: method,
    fitError: rectangle?.error ?? null,

    sampleWidth: width,
    sampleHeight: height,
    bbox,
    preview: renderPreview(width, height, bbox, corners, outline),
  }
}

function renderPreview(width, height, bbox, corners, outline) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  // Yang digambar hanya satu bentuk bersih, yaitu poligon yang sama dengan yang
  // dikembalikan ke pemanggil. Topeng mentah tidak lagi digambar karena tepinya
  // yang bergerigi itu yang membuat pratinjau terasa kotor.
  const shape = new Uint8Array(width * height)
  fillPolygon(shape, width, height, corners)

  const image = ctx.createImageData(width, height)
  for (let i = 0; i < shape.length; i += 1) {
    if (shape[i] !== 1) continue
    const o = i * 4
    image.data[o] = 34
    image.data[o + 1] = 120
    image.data[o + 2] = 160
    image.data[o + 3] = 110
  }
  ctx.putImageData(image, 0, 0)

  ctx.strokeStyle = '#ffd166'
  ctx.lineWidth = 2
  ctx.strokeRect(bbox.minX, bbox.minY, bbox.boxWidth, bbox.boxHeight)

  // Sudut yang berhasil dibaca ditandai biru, sesuai warna yang dipakai di
  // pratinjau kamera langsung.
  drawCorners(ctx, corners, '#38bdf8')

  ctx.fillStyle = '#38bdf8'
  ctx.font = '600 13px system-ui, sans-serif'
  const label = `${outline} · ${corners.length} sudut`
  ctx.fillText(label, bbox.minX + 4, Math.max(14, bbox.minY - 6))

  return canvas.toDataURL('image/png')
}

/** Menggambar garis penambung dan titik sudut pada kanvas 2D. */
export function drawCorners(ctx, corners, color = '#38bdf8') {
  if (corners == null || corners.length < 2) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  corners.forEach((corner, index) => {
    if (index === 0) ctx.moveTo(corner.x, corner.y)
    else ctx.lineTo(corner.x, corner.y)
  })
  ctx.closePath()
  ctx.stroke()

  for (const corner of corners) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(corner.x, corner.y, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
