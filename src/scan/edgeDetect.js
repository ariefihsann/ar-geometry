/**
 * Deteksi tepi untuk membersihkan siluet.
 *
 * Modul ini mengerjakan tahap "pemrosesan awal" dan "deteksi tepi" dari alur
 * deteksi, terpisah dari silhouette.js yang memutuskan bentuk. Hasilnya bukan
 * gambar, melainkan peta tepi satu piksel yang nanti dipakai sebagai pagar:
 * hanyaClosed area yang batasnya benar-benar berimpit dengan tepi kuat yang
 * diterima sebagai benda.
 *
 * Alasannya sesuai laporan pengguna: objek di dekat seperti keyboard
 * dan sedotan menghasilkan selisih terhadap latar yang besar, sehingga ambang
 * batas alone sudah tidak bisa membedakan "benda" dari "dekat". Yang membedakan
 * keduanya adalah tepi: keyboard punya banyak tepi dalam, sementara benda yang
 * dicari biasanya punya satu tepi luar yang tertutup dan jauh lebih rapi.
 */

/** Lantai minimal ambang Canny agar foto kosong tidak menghasilkan tepi. */
const MIN_MAGNITUDE = 24

/** Grayscale Rec. 601, hasilnya 0..255. */
export function toGrayscale(data, width, height) {
  const luma = new Float32Array(width * height)

  for (let i = 0, p = 0; i < luma.length; i += 1, p += 4) {
    luma[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
  }

  return luma
}

/**
 * Gaussian blur yang bisa dipisah per sumbu.
 *
 * Dipakai kernel Gaussian asli, bukan box blur. Box blur bisa menekan noise
 * tetapi tepinya berbulat dan bergeser, sehingga sudut benda ikut bergeser dan
 * hasil aproksimasi poligon jadi tidak stabil. Gaussian menjaga titik berat
 * tepi tetap di tempatnya.
 */
export function gaussianBlur(source, width, height, sigma) {
  if (sigma <= 0) return Float32Array.from(source)

  const radius = Math.max(1, Math.ceil(sigma * 3))
  const kernel = new Float32Array(radius * 2 + 1)
  let total = 0

  for (let i = -radius; i <= radius; i += 1) {
    const value = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel[i + radius] = value
    total += value
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= total

  const horizontal = new Float32Array(width * height)
  const output = new Float32Array(width * height)

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      for (let k = -radius; k <= radius; k += 1) {
        const sx = Math.min(width - 1, Math.max(0, x + k))
        sum += source[row + sx] * kernel[k + radius]
      }
      horizontal[row + x] = sum
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      for (let k = -radius; k <= radius; k += 1) {
        const sy = Math.min(height - 1, Math.max(0, y + k))
        sum += horizontal[sy * width + x] * kernel[k + radius]
      }
      output[y * width + x] = sum
    }
  }

  return output
}

/**
 * Gradien Sobel.
 *
 * `direction` menyimpan arah gradien dalam radian, dipakai pemindaian non-maksimum
 * supaya tepi cukup satu piksel. Arah dibulatkan ke delapan sektor supaya
 * perbandingan hanya melibatkan tetangga yang memang bersebelahan.
 */
export function sobel(source, width, height) {
  const magnitude = new Float32Array(width * height)
  const direction = new Float32Array(width * height)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x

      const tl = source[i - width - 1]
      const t = source[i - width]
      const tr = source[i - width + 1]
      const l = source[i - 1]
      const r = source[i + 1]
      const bl = source[i + width - 1]
      const b = source[i + width]
      const br = source[i + width + 1]

      const gx = tr + 2 * r + br - (tl + 2 * l + bl)
      const gy = bl + 2 * b + br - (tl + 2 * t + tr)

      magnitude[i] = Math.hypot(gx, gy)
      direction[i] = Math.atan2(gy, gx)
    }
  }

  return { magnitude, direction }
}

/** Mempertebal gradien di setiap piksel tetap satu piksel. */
export function nonMaxSuppress({ magnitude, direction }, width, height) {
  const thinned = new Float32Array(width * height)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const angle = ((direction[i] * 180) / Math.PI + 180) % 180
      let before = 0
      let after = 0

      // Sudut gradien tegak lurus arah tepi, jadi yang dibandingkan adalah
      // piksel di kiri-kanan tepi, bukan di atas-bawahnya.
      if (angle < 22.5 || angle >= 157.5) {
        before = magnitude[i - 1]
        after = magnitude[i + 1]
      } else if (angle < 67.5) {
        before = magnitude[i - width + 1]
        after = magnitude[i + width - 1]
      } else if (angle < 112.5) {
        before = magnitude[i - width]
        after = magnitude[i + width]
      } else {
        before = magnitude[i - width - 1]
        after = magnitude[i + width + 1]
      }

      if (magnitude[i] >= before && magnitude[i] >= after) thinned[i] = magnitude[i]
    }
  }

  return thinned
}

/**
 * Ambang ganda dengan hysteresis.
 *
 * Piksel yang lolos ambang tinggi menjadi inti tepi, dan piksel ambang rendah
 * yang bersambung dengan inti ikut terbawa. Ini yang membuang tepi weak dan
 * terputus-putus tanpa memotong tepi benda yang samar, karena bagian lemah dari
 * tepi benda tetap menempel pada bagianstrong yang berdekatan.
 */
export function hysteresis(thinned, width, height, low, high) {
  const edges = new Uint8Array(width * height)
  const stack = []

  for (let i = 0; i < thinned.length; i += 1) {
    if (thinned[i] >= high) {
      edges[i] = 1
      stack.push(i)
    }
  }

  while (stack.length > 0) {
    const index = stack.pop()
    const x = index % width
    const y = (index - x) / width

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue

        const ni = ny * width + nx
        if (edges[ni] === 1 || thinned[ni] < low) continue

        edges[ni] = 1
        stack.push(ni)
      }
    }
  }

  return edges
}

/**
 * Membagi histogram gradien jadi dua kelas dengan Otsu.
 *
 * Persentil tidak bisa dipakai di sini. Pada foto yang sebagian besarnya datar,
 * lebih dari 90 persen piksel punya gradian mendekati nol, jadi persentil 92
 * mendarat tepat di lantai noise dan seluruh latar berubah jadi tepi. Otsu
 * mencari celah paling lebar antara dua kelompok, yaitu antara "datar" dan
 * "tepi sungguhan", sehingga ambangnya ikut menyesuaikan foto terang maupun
 * gelap.
 *
 * Magnitudo Sobel dibatasi di 1020, yaitu nilai maksimum yang mungkin, lalu
 * dipetakan ke 256_bins. Pembatasan itu tidak mengubah urutan, hanya membuat
 * histogram bisa dihitung tanpa gentlemen需要的 presisi.
 */
function otsuGradient(magnitude) {
  const MAX_MAGNITUDE = 1020
  const BINS = 256
  const histogram = new Float64Array(BINS)

  for (let i = 0; i < magnitude.length; i += 1) {
    const bin = Math.min(BINS - 1, Math.floor((magnitude[i] / MAX_MAGNITUDE) * BINS))
    histogram[bin] += 1
  }

  const total = magnitude.length
  let sumAll = 0
  for (let bin = 0; bin < BINS; bin += 1) sumAll += bin * histogram[bin]

  let sumBackground = 0
  let weightBackground = 0
  let bestVariance = -1
  let bestBin = 0

  for (let bin = 0; bin < BINS; bin += 1) {
    weightBackground += histogram[bin]
    if (weightBackground === 0) continue

    const weightForeground = total - weightBackground
    if (weightForeground === 0) break

    sumBackground += bin * histogram[bin]

    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sumAll - sumBackground) / weightForeground
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2

    if (variance > bestVariance) {
      bestVariance = variance
      bestBin = bin
    }
  }

  return ((bestBin + 1) / BINS) * MAX_MAGNITUDE
}

/**
 * Canny lengkap: grayscale -> Gaussian -> Sobel -> NMS -> histeresis.
 *
 * Ambang tidak dipasang tetap dan tidak memakai persentil, tapi Otsu pada
 * histogram gradien, sehingga foto bergradien terang dan foto gelap berakhir di
 * ambang yang berbeda. `low` diturunkan dari `high` dengan `ratio`.
 *
 * Ada lantai absolut kecil. Tanpa lantai itu, foto yang seluruhnya rata
 * singular, ambang Otsu bisa mendekati nol, lalu noise piksel demi piksel
 * diperkuat oleh histeresis sampai seluruh bingkai berubah jadi tepi. Lantai 24
 * setara beda abu-abu sekitar 4 dari 255, jauh di bawah tipikal, tapi cukup
 * untuk menutup kasus foto kosong.
 */
export function cannyEdges(luma, width, height, options = {}) {
  const sigma = options.sigma ?? 1.6
  const ratio = options.ratio ?? 0.4

  const blurred = gaussianBlur(luma, width, height, sigma)
  const gradients = sobel(blurred, width, height)
  const thinned = nonMaxSuppress(gradients, width, height)

  const high = Math.max(options.high ?? otsuGradient(thinned), MIN_MAGNITUDE)
  const low = options.low ?? high * ratio

  const edges = hysteresis(thinned, width, height, low, high)
  return { edges, high, low }
}

/**
 * Mengisi poligon ke dalam topeng.
 *
 * Dipakai untuk mengukur luas dari poligon sudut yang sudah bersih, bukan dari
 * topeng mentah. Luas poligon tidak dipengaruhiTekstur di dalam benda, jadi
 * `extent` tidak lagi bergeser karena ada crumb atau keyboard yang ikut terbaca.
 */
export function fillPolygon(mask, width, height, polygon) {
  if (polygon == null || polygon.length < 3) return mask

  let minY = height
  let maxY = -1
  for (const point of polygon) {
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }

  const yStart = Math.max(0, Math.floor(minY))
  const yEnd = Math.min(height - 1, Math.ceil(maxY))

  for (let y = yStart; y <= yEnd; y += 1) {
    const center = y + 0.5
    const crossings = []

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i]
      const b = polygon[j]

      if (a.y > center === b.y > center) continue
      crossings.push(a.x + ((center - a.y) / (b.y - a.y)) * (b.x - a.x))
    }

    crossings.sort((first, second) => first - second)
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k] - 0.5))
      const to = Math.min(width - 1, Math.floor(crossings[k + 1] - 0.5))
      for (let x = from; x <= to; x += 1) mask[y * width + x] = 1
    }
  }

  return mask
}

/** Porsi tepi yang menyentuh topeng, dipakai sebagai ukuran "bersih". */
export function edgeAgreement(edges, mask, width, height) {
  let touching = 0
  let border = 0

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      if (mask[i] !== 1) continue

      // Hanya piksel batas yang dinilai, piksel isi tidak punya tepi.
      const isBorder =
        mask[i - 1] !== 1 || mask[i + 1] !== 1 || mask[i - width] !== 1 || mask[i + width] !== 1
      if (isBorder !== true) continue

      border += 1
      if (
        edges[i] === 1 ||
        edges[i - 1] === 1 ||
        edges[i + 1] === 1 ||
        edges[i - width] === 1 ||
        edges[i + width] === 1
      ) {
        touching += 1
      }
    }
  }

  return border === 0 ? 0 : touching / border
}
