/**
 * Pendeteksian sudut dari siluet benda, dengan pendekatan yang mirip OpenCV:
 * ambil kontur, sederhanakan dengan Douglas-Peucker (approxPolyDP), lalu perbaiki
 * posisi sudut lewat perpotongan dua garis sisinya.
 *
 * Jumlah sudut adalah informasi yang jauh lebih menentukan daripada rasio isi:
 *   - 3 sudut  -> segitiga (alas limas atau kerucut)
 *   - 4 sudut  -> persegi/persegi panjang (balok atau tabung)
 *   - banyak   -> bundar (bola atau tutup tabung)
 *
 * Sudut yang terdeteksi inilah yang digambar di atas foto, sehingga siswa bisa
 * langsung melihat apa yang dibaca aplikasi dari bendanya.
 */

/**
 * Simpangan rata-rata maksimum, sebagai bagian dari diagonal persegi, agar
 * sebuah poligon empat titik dianggap benar-benar persegi.
 *
 * Persegi sungguhan pada lebar sampel 240 piksel punya simpangan di bawah
 * satu piksel, jadi nilainya kecil. Lingkaran menyimpang sekitar 0,15 diagonal,
 * jadi 0,05 sudah cukup memisahkan keduanya, dan balok miring tipis tetap
 * ikut diterima.
 */
const RECT_FIT_TOLERANCE = 0.05

/**
 * Delapan arah tetangga searah jarum jam, dengan y ke bawah.
 * Indeks 0 = atas, lalu berputar ke kanan.
 */
const NEIGHBORS = [
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
]

function neighborIndex(dx, dy) {
  for (let i = 0; i < NEIGHBORS.length; i += 1) {
    if (NEIGHBORS[i][0] === dx && NEIGHBORS[i][1] === dy) return i
  }
  return 0
}

/**
 * Menelusuri tepi mask dengan penelusuran Moore-neighbour, setara
 * `cv2.findContours` dengan mode `RETR_EXTERNAL`.
 *
 * Pengurutan berdasarkan sudut terhadap titik berat tidak bisa dipakai di sini:
 * begitu bayangan menempel di bawah benda, beberapa titik memiliki sudut yang
 * nyaris sama sehingga urutannya saling berpotongan dan poligon hasil
 * aproksimasi jadi tidak karangan. Penelusuran tepi menghasilkan satu lingkaran
 * tertutup yang benar.
 */
export function traceContour(mask, width, height, cells) {
  if (cells.length === 0) return []

  const inside = new Set(cells)

  // Titik awal: piksel benda paling atas-kiri, seperti yang dipakai OpenCV.
  let start = null
  for (let y = 0; y < height && start == null; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inside.has(y * width + x)) {
        start = { x, y }
        break
      }
    }
  }
  if (start == null) return []

const contour = [{ ...start }]
  // Satu putaran penuh untuk siluet yang tidak berlubang. Batas ini hanya
  // pengaman supaya penelusuran tidak berjalan tanpa henti bila ada tonjolan
  // yang menyentuh tepi sendiri.
  const limit = inside.size * 4

  let current = start
  // Titik yang dipakai untuk memasuki piksel tepi, selalu piksel latar.
  let backtrack = { x: start.x - 1, y: start.y }

  for (let step = 0; step < limit; step += 1) {
    const startDirection = neighborIndex(backtrack.x - current.x, backtrack.y - current.y)

    let moved = false
    for (let offset = 0; offset < NEIGHBORS.length; offset += 1) {
      const direction = (startDirection + offset) % NEIGHBORS.length
      const [dx, dy] = NEIGHBORS[direction]
      const nx = current.x + dx
      const ny = current.y + dy

      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      if (!inside.has(ny * width + nx)) continue

      // Tetangga tepat sebelum arah yang dipakai adalah kandidat backtrack baru.
      const previousDirection = (direction - 1 + NEIGHBORS.length) % NEIGHBORS.length
      const [px, py] = NEIGHBORS[previousDirection]
      const nextPoint = { x: nx, y: ny }
      const nextBacktrack = { x: nx + px, y: ny + py }

      contour.push(nextPoint)
      current = nextPoint
      backtrack = nextBacktrack
      moved = true
      break
    }

    if (!moved) break

    // Kembali ke titik awal berarti satu putaran penuh sudah selesai. Kriteria
    // Jacob yang lebih ketat (punya arah masuk yang sama persis) tidak bisa
    // dipakai di sini, karena titik awal berada di sudut dan bisa didekati
    // dari sisi yang berbeda pada putaran berikutnya.
    if (current.x === start.x && current.y === start.y) break
  }

  // Buang titik berulang di ekor agar poligon tidak punya ruas nol.
  while (contour.length > 1) {
    const last = contour[contour.length - 1]
    const before = contour[contour.length - 2]
    if (last.x === before.x && last.y === before.y) contour.pop()
    else break
  }

  return contour
}

/**
 * Memerampingkan kontur agar aproksimasi tidak terlalu mahal dipanggil tiap frame.
 *
 * Kontur hasil penelusuran tepi berjalan menyusuri tepi piksel, sehingga titik-titiknya
 * menumpuk di sudut dan renggang di sisi datar. Memambil setiap titik ke-n
 * akan menebalkan sudut dan menipiskan sisi, dan itu yang membuat sudut hasil
 * aproksimasi bergeser antar frame. Yang dipakai adalah titik yang jaraknya
 * sama satu sama lain.
 */
function thinContour(points, limit = 1200) {
  if (points.length <= limit) return points

  const step = points.length / limit
  const thinned = []
  for (let i = 0; i < limit; i += 1) thinned.push(points[Math.floor(i * step)])
  return thinned
}

/** Jarak tegak lurus titik ke ruas garis. */
function perpendicularDistance(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
  const clamped = Math.min(1, Math.max(0, t))
  return Math.hypot(point.x - (start.x + clamped * dx), point.y - (start.y + clamped * dy))
}

/** Douglas-Peucker untuk poligon terbuka. */
function approxPolyDPLine(points, epsilon) {
  if (points.length < 3) return points.slice()

  const start = points[0]
  const end = points[points.length - 1]
  let farthestIndex = 0
  let farthest = 0

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], start, end)
    if (distance > farthest) {
      farthest = distance
      farthestIndex = i
    }
  }

  if (farthest <= epsilon) return [start, end]

  const left = approxPolyDPLine(points.slice(0, farthestIndex + 1), epsilon).slice(0, -1)
  const right = approxPolyDPLine(points.slice(farthestIndex), epsilon)
  return [...left, ...right]
}

/**
 * Sederhanakan poligon tertutup dengan algoritma Douglas-Peucker, setara
 * `cv2.approxPolyDP`. Ini yang menentukan berapa banyak sudut yang dianggap ada.
 *
 * Kontur hasil penelusuran tepi tertutup: titik pertama dan titik terakhirnya
 * bersebelahan. Kalau algoritma Douglas-Peucker langsung dipakai, tali yang
 * jadi acuan cuma ruas terpendek, sehingga semua titik dianggap jauh dari garis
 * dan tidak ada yang pernah digabung. Karena itu kontur dibelah dulu pada dua
 * titik yang paling jauh, lalu masing-masing bagian disederhanakan terpisah.
 */
export function approxPolyDP(points, epsilon) {
  const count = points.length
  if (count < 3) return points.slice()

  let startIndex = 0
  let endIndex = 0
  let longest = -1
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      const squared = dx * dx + dy * dy
      if (squared > longest) {
        longest = squared
        startIndex = i
        endIndex = j
      }
    }
  }

  // Putar kontur supaya titik terjauh pertama berada di awal.
  const rotated = [...points.slice(startIndex), ...points.slice(0, startIndex)]
  const split = (endIndex - startIndex + count) % count

  const firstHalf = rotated.slice(0, split + 1)
  const secondHalf = [...rotated.slice(split), rotated[0]]

  const first = approxPolyDPLine(firstHalf, epsilon).slice(0, -1)
  const second = approxPolyDPLine(secondHalf, epsilon).slice(0, -1)

  return [...first, ...second]
}

/** Perpotongan dua garis tak sejajar, dipakai untuk menggeser sudut ke titik potong sebenarnya. */
function intersectLines(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = p4.x - p3.x
  const d2y = p4.y - p3.y
  const denominator = d1x * d2y - d1y * d2x

  if (Math.abs(denominator) < 1e-9) return null

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denominator
  return { x: p1.x + t * d1x, y: p1.y + t * d1y }
}

/**
 * Menggeser setiap sudut hasil aproksimasi ke titik potong dua ruas yang
 * diperpanjang, sehingga penanda sudut tidak terlihat bergerigi.
 *
 * Pergeseran dibatasi: kalau titik potong jatuh jauh dari sudut aslinya, itu
 * berarti dua ruas hampir sejajar dan hasil refinement justru merusak bentuk,
 * jadi sudut aslinya dipertahankan.
 */
function refineCorners(polygon, contour) {
  if (polygon.length < 3) return polygon

  let maxRadius = 0
  for (const point of contour) maxRadius = Math.max(maxRadius, point.x)

  const refined = []
  for (let i = 0; i < polygon.length; i += 1) {
    const previous = polygon[(i - 1 + polygon.length) % polygon.length]
    const current = polygon[i]
    const next = polygon[(i + 1) % polygon.length]

    const intersection = intersectLines(previous, current, current, next)
    if (intersection == null) {
      refined.push(current)
      continue
    }

    const drift = Math.hypot(intersection.x - current.x, intersection.y - current.y)
    refined.push(drift <= maxRadius * 0.35 ? intersection : current)
  }

  return refined
}

/**
 * Selubung cembung dengan algoritma monotone chain.
 *
 * Selubung dipakai untuk mengukur kotak pembatas yang benar-benar menempel
 * siluet, karena tepi mask yang bergerigi membuat pengukuran langsung jadi
 * tidak stabil.
 */
export function convexHull(points) {
  if (points.length < 4) return points.slice()

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))

  // Interior relatif titik.o terhadap ruas a-b. Negatif berarti.o ada di sebelah
  // kanan, jadi rantai bawah dibangun ke kiri dan rantai atas ke kanan.
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop()
    lower.push(point)
  }

  const upper = []
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i]
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop()
    upper.push(point)
  }

  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/** Kotak pembatas dengan luas terkecil (rotating calipers di atas selubung cembung). */
export function minimumAreaRect(points) {
  const hull = convexHull(points)
  if (hull.length < 3) return null

  let best = null
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue

    // Dua sisi kotak pencarian ini sejajar dan tegak lurus arah ruas `a-b`.
    // Panjang masing-masing sisi adalah rentang sebaran titik di kedua arah
    // itu, bukan panjang ruasnya sendiri. Kalau memakai panjang ruas, kotak
    // ikut menyusut jadi strip dan luasnya selalu keliru.
    let minAlong = Infinity
    let maxAlong = -Infinity
    let minDepth = Infinity
    let maxDepth = -Infinity

    for (const point of hull) {
      const offsetX = point.x - a.x
      const offsetY = point.y - a.y

      const along = (offsetX * dx + offsetY * dy) / length
      if (along < minAlong) minAlong = along
      if (along > maxAlong) maxAlong = along

      const depth = (offsetX * dy - offsetY * dx) / length
      if (depth < minDepth) minDepth = depth
      if (depth > maxDepth) maxDepth = depth
    }

    const width = maxAlong - minAlong
    const height = maxDepth - minDepth
    const area = width * height
    if (best == null || area < best.area) best = { area, width, height }
  }

  return best
}

/** Luas poligon dengan rumus tali sepatu. */
export function polygonArea(points) {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    sum += current.x * next.y - next.x * current.y
  }
  return Math.abs(sum) / 2
}

/** Sudut dalam (derajat) di setiap puncak poligon. */
export function interiorAngles(points) {
  const count = points.length
  const angles = []

  for (let i = 0; i < count; i += 1) {
    const previous = points[(i - 1 + count) % count]
    const current = points[i]
    const next = points[(i + 1) % count]

    const a = Math.atan2(previous.y - current.y, previous.x - current.x)
    const b = Math.atan2(next.y - current.y, next.x - current.x)
    let angle = Math.abs(((b - a) * 180) / Math.PI)
    if (angle > 180) angle = 360 - angle
    angles.push(angle)
  }

  return angles
}

/**
 * Menghapus puncak yang nyaris lurus.
 *
 * Tepi mask selalu bergerigi mengikuti kisi piksel, jadi aproksimasi kontur pada
 * persegi bisa memunculkan tujuh puncak: empat sudut siku-siku dan tiga tangga
 * di sisinya. Puncak yang sudut dalamnya mendekati 180 derajat bukan sudut
 * sungguhan, jadi digabung dengan tetangganya sampai tinggal siku-siku sejati.
 *
 * Lingkaran tidak terpengaruh karena tiap puncunya hanya berputar sekitar 36
 * derajat, jauh dari batas kelewatan ini.
 */
function mergeStraightCorners(polygon, tolerance = 15) {
  const minimum = 160 - tolerance
  let current = polygon

  // Penghapusan satu puncak bisa membuat tetangganya ikut menjadi lurus, jadi
  // diulang sampai tidak ada lagi yang bisa digabung.
  for (let pass = 0; pass < 8 && current.length > 3; pass += 1) {
    const angles = interiorAngles(current)
    let removed = false
    const next = []

    for (let i = 0; i < current.length; i += 1) {
      if (angles[i] > minimum) {
        removed = true
        continue
      }
      next.push(current[i])
    }

    current = next
    if (!removed || current.length < 3) break
  }

  return current.length >= 3 ? current : polygon
}

/**
 * Menggolongkan siluet jadi kategori yang bisa dibandingkan dengan pustaka bangun.
 *
 * Epsilon dipilih relatif terhadap ukuran benda: terlalu kecil membuat lingkaran
 * terbaca sebagai belasan sudut, terlalu besar membuat persegi menyatu jadi
 * segitiga. Dengan epsilon adaptif, lingkaran tetap banyak sudut dan persegi
 * tetap empat.
 */
export function classifyOutline(polygon, angles) {
  const count = polygon.length

  if (count < 3) return 'unknown'
  if (count === 3) return 'triangle'

  const rightAngles = angles.filter((angle) => angle > 65 && angle < 115).length
  const obtuse = angles.filter((angle) => angle > 135).length
  const rightRatio = rightAngles / count
  const obtuseRatio = obtuse / count

  if (count === 4 && rightRatio >= 0.75) return 'rect'
  if (count >= 8 && obtuseRatio > 0.6) return 'round'
  if (count === 4) return 'rect'
  if (count >= 8) return 'round'
  return 'other'
}

/**
 * Pipeline lengkap: mask -> kontur -> sudut -> kategori.
 * @returns {{corners: Array<{x:number,y:number}>, angles: number[], outline: string, polygon: Array}}
 */
export function detectCorners(mask, width, height, cells, bbox) {
  const contour = traceContour(mask, width, height, cells)
  if (contour.length < 8) {
    return { corners: [], angles: [], outline: 'unknown', polygon: [], contour }
  }

  const relativeSize = Math.max(bbox.boxWidth, bbox.boxHeight)
  const thinned = thinContour(contour)
  const initial = approxPolyDP(thinned, Math.max(2, relativeSize * 0.045))
  const polygon = mergeStraightCorners(refineCorners(initial, thinned))
  const angles = interiorAngles(polygon)

  return {
    corners: polygon,
    angles,
    outline: classifyOutline(polygon, angles),
    polygon,
    contour,
  }
}

// ---------------------------------------------------------------------------
// Aproksimasi dengan epsilon adaptif
// ---------------------------------------------------------------------------

/** Ukuran geometris sekelompok titik, dipakai menormalkan semua ambang. */
function spanOf(points) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }

  return Math.max(1, maxX - minX, maxY - minY)
}

/**
 * Mencari epsilon Douglas-Peucker yang menghasilkan jumlah titik tertentu.
 *
 * Versi lama memakai satu epsilon tetap, sehingga jumlah sudutnya melompat
 * bebas antara 3, 5, sampai belasan hanya karena ruido. Itu yang membuat garis
 * di kamera tampak gelisah. Jumlah titik hasil aproksimasi Douglas-Peucker
 * tidak pernah naik ketika epsilon diperbesar, jadi pencarian dapat dibuat
 * dua-percabang: yang dicari adalah epsilon terkecil yang jumlahnya sudah
 * turun ke target.
 *
 * Kalau target tidak bisa dicapai, hasil terbaik yang ada dikembalikan bersama
 * penanda `reachable: false` supaya pemanggil tahu janganZQ percaya bulat-bulat.
 */
export function adaptiveApproxPolygon(points, options = {}) {
  if (points.length < 3) return { polygon: [], epsilon: 0, reachable: false }

  const span = spanOf(points)
  const target = options.target ?? 4
  const min = options.minEpsilon ?? Math.max(0.5, span * 0.004)
  const max = options.maxEpsilon ?? span * 0.4

  const finest = approxPolyDP(points, min)
  if (finest.length <= target) return { polygon: finest, epsilon: min, reachable: true }

  const coarsest = approxPolyDP(points, max)
  if (coarsest.length > target) return { polygon: coarsest, epsilon: max, reachable: false }

  let low = min
  let high = max

  for (let step = 0; step < 20 && high - low > span * 0.0004; step += 1) {
    const middle = (low + high) / 2
    if (approxPolyDP(points, middle).length <= target) high = middle
    else low = middle
  }

  return { polygon: approxPolyDP(points, high), epsilon: high, reachable: true }
}

/** Kotak pembatas yang selalu lurus sumbu layar, setara `cv2.boundingRect`. */
export function boundingRect(points) {
  if (points.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }

  const width = maxX - minX + 1
  const height = maxY - minY + 1

  return {
    width,
    height,
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
  }
}

/** Jarak titik ke ruas garis, dipakai mengukur seberapa pas sebuah persegi. */
function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y)

  const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/**
 * Rata-rata seberapa jauh titik kontur menyimpang dari keempat sisi persegi.
 * Persegi yang benar akan memberi simpangan mendekati nol karena semua
 * titik kontur benar-benar berada pada keempat sisinya. Lingkaran akan
 * menyimpang jauh, sehingga justru bangun yang sebenarnya bulat tidak akan
 * salah dibaca sebagai persegi.
 */
function rectangleFitError(corners, points) {
  if (corners.length !== 4 || points.length === 0) return Infinity

  let total = 0
  for (const point of points) {
    let nearest = Infinity
    for (let i = 0; i < 4; i += 1) {
      const gap = distanceToSegment(point, corners[i], corners[(i + 1) % 4])
      if (gap < nearest) nearest = gap
    }
    total += nearest
  }

  return total / points.length
}

/**
 * Memaksa hasil akhir menjadi satu persegi yang bersih.
 *
 * Urutannya mengikuti permintaan: coba dua-percabankan epsilon sampai tepat
 * empat titik, dan hanya diterima kalau keempat sudutnya benar-benar mendekati siku
 * serta konturnya menempel rapi pada keempat sisinya. Kalau tidak cocok,
 * turun ke `minAreaRect`, dan kalau itu pun gagal, ke `boundingRect`.
 *
 * eliable menentukan apakah persegi itu benar-benar menggambarkan benda.
 * Kalau tidak, pemanggil sebaiknya memakai poligon umum, bukan memaksa
 * menggambar lingkaran sebagai persegi.
 */
export function fitRectangle(points, searchPoints = points) {
  const fitted = adaptiveApproxPolygon(points, { target: 4 })
  const rect = minimumAreaRect(searchPoints)
  const box = boundingRect(searchPoints)
  const scale = Math.hypot(rect?.width ?? 1, rect?.height ?? 1)

  if (fitted.polygon.length === 4) {
    const angles = interiorAngles(fitted.polygon)
    const rightAngles = angles.filter((angle) => angle > 78 && angle < 102).length / 4
    const error = rectangleFitError(fitted.polygon, points) / scale

    if (error <= RECT_FIT_TOLERANCE && rightAngles >= 0.75) {
      return {
        corners: rect?.points ?? fitted.polygon,
        method: 'approxPolyDP',
        error,
        rightAngles,
        reliable: true,
      }
    }
  }

  if (rect != null) {
    return { corners: rect.points, method: 'minAreaRect', error: null, rightAngles: 1, reliable: false }
  }

  if (box != null) {
    return { corners: box.points, method: 'boundingRect', error: null, rightAngles: 0.75, reliable: false }
  }

  return null
}
