/**
 * Menguji pembacaan sudut kontur dan pencocokan bentuk pada foto buatan.
 *
 * Foto disimulasikan dari gradien latar, bayangan, dan bentuk yang diminta,
 * lalu diperiksa apakah jumlah sudut dan kategori siluinya terbaca sesuai.
 *
 * Jalankan: TARGET_URL=https://localhost:4183/ node scripts/verify-corners.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const TARGET = process.env.TARGET_URL ?? 'https://localhost:4183/'

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan, uji dilewati.')
  process.exit(0)
}

/**
 * Menggambar foto sintetis. `rotate` memutar bentuk untuk menguji bahwa sudut
 * terdeteksi ulang saat benda diputar sedikit.
 */
const DRAW = `window.__draw = function draw({ shape, w, h, rotate }) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, '#3a3a44')
  gradient.addColorStop(1, '#c8c2b6')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2
  const boxW = w * 0.36
  const boxH = h * 0.46

  ctx.save()
  ctx.filter = 'blur(12px)'
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + boxH * 0.55, boxW * 0.6, boxH * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotate)
  ctx.fillStyle = '#e8e2d6'
  if (shape === 'rect') {
    ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH)
  } else if (shape === 'circle') {
    ctx.beginPath()
    ctx.arc(0, 0, boxW / 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (shape === 'triangle') {
    ctx.beginPath()
    ctx.moveTo(0, -boxH / 2)
    ctx.lineTo(boxW / 2, boxH / 2)
    ctx.lineTo(-boxW / 2, boxH / 2)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  return canvas
}`

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-certificate-errors',
    '--no-sandbox',
  ],
})

const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') pageErrors.push(message.text())
})

await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 })
// Resep gambar disuntikkan sebagai skrip biasa, lalu modul aplikasi diimpor
// lewat dev server Vite supaya yang diuji benar-benar kode yang dipakai aplikasi.
await page.addScriptTag({ content: DRAW })
await page.evaluate(async () => {
  window.__silhouette = await import('/src/scan/silhouette.js')
  window.__matcher = await import('/src/scan/matchShape.js')
})

let passed = 0
let total = 0

/**
 * `views` adalah citra per sudut pandang. Setiap entri punya bentuk yang
 * diharapkan dan hasil pencocokan yang diharapkan.
 */
const CASES = [
  {
    name: 'Tabung (tumbler): samping persegi, atas lingkaran',
    expect: 'cylinder',
    views: [
      { key: 'front', shape: 'rect' },
      { key: 'right', shape: 'rect' },
      { key: 'top', shape: 'circle' },
    ],
  },
  {
    name: 'Balok (HP): persegi dari semua arah',
    expect: 'box',
    views: [
      { key: 'front', shape: 'rect' },
      { key: 'right', shape: 'rect' },
      { key: 'top', shape: 'rect' },
    ],
  },
  {
    name: 'Bola: lingkaran dari semua arah',
    expect: 'sphere',
    views: [
      { key: 'front', shape: 'circle' },
      { key: 'right', shape: 'circle' },
      { key: 'top', shape: 'circle' },
    ],
  },
  {
    name: 'Kerucut: samping segitiga, atas lingkaran',
    expect: 'cone',
    views: [
      { key: 'front', shape: 'triangle' },
      { key: 'right', shape: 'triangle' },
      { key: 'top', shape: 'circle' },
    ],
  },
  {
    name: 'Limas: samping segitiga, atas persegi',
    expect: 'pyramid',
    views: [
      { key: 'front', shape: 'triangle' },
      { key: 'right', shape: 'triangle' },
      { key: 'top', shape: 'rect' },
    ],
  },
]

for (const testCase of CASES) {
  total += 1
  console.log(`\n=== ${testCase.name} ===`)

  const measurements = await page.evaluate(
    (views) => {
      const result = {}
      for (const view of views) {
        const canvas = window.__draw({ shape: view.shape, w: 640, h: 800, rotate: 0 })
        result[view.key] = window.__silhouette.measureSilhouette(canvas)
      }
      return result
    },
    testCase.views,
  )

  for (const view of testCase.views) {
    const item = measurements[view.key]
    const label = `${view.key.padEnd(5)} ${view.shape.padEnd(8)}`
    if (item.ok !== true) {
      console.log(`  ${label} GAGAL: ${item.reason}`)
      continue
    }
    console.log(
      `  ${label} -> ${String(item.outline).padEnd(8)} ${String(item.cornerCount).padStart(2)} sudut  extent ${item.extent.toFixed(3)}`,
    )
  }

  const match = await page.evaluate(
    (measurements) => {
      const result = window.__matcher.matchShape(measurements)
      return { ok: result.ok, shapeId: result.shapeId, confidence: result.confidence, ranking: result.ranking }
    },
    measurements,
  )

  if (match.ok && match.shapeId === testCase.expect) {
    passed += 1
    const ranking = match.ranking ?? []
    const top3 = ranking.slice(0, 3).map((item) => `${item.label}=${item.score.toFixed(3)}`).join('  ')
    console.log(`  ok  terdeteksi ${match.shapeId} (keyakinan ${Math.round((match.confidence ?? 0) * 100)}%)`)
    console.log(`      peringkat: ${top3}`)
  } else {
    console.log(`  GAGAL terdeteksi ${match.shapeId ?? 'tidak ada'}, harapan ${testCase.expect}`)
    const ranking = match.ranking ?? []
    const top3 = ranking.slice(0, 3).map((item) => `${item.label}=${item.score.toFixed(3)}`).join('  ')
    console.log(`      peringkat: ${top3}`)
  }
}

// Uji tambahan: memutar benda sedikit harus menghasilkan pembacaan sudut baru,
// bukan hasil lama yang tersimpan.
console.log('\n=== Sudut terbaca ulang saat benda diputar ===')
total += 1
const rotation = await page.evaluate(() => {
  const rows = []
  for (const angle of [0, 12, 25, 40]) {
    const canvas = window.__draw({ shape: 'rect', w: 640, h: 800, rotate: (angle * Math.PI) / 180 })
    const result = window.__silhouette.measureSilhouette(canvas)
    rows.push({
      angle,
      ok: result.ok === true,
      outline: result.outline ?? null,
      corners: result.corners ?? [],
    })
  }
  return rows
})

for (const row of rotation) {
  const points = row.corners.map((corner) => `${Math.round(corner.x)},${Math.round(corner.y)}`).join(' ')
  console.log(`  putar ${String(row.angle).padStart(2)} derajat -> ${row.outline}  [${points}]`)
}

const distinct = new Set(rotation.filter((row) => row.ok).map((row) => row.corners.map((corner) => `${corner.x.toFixed(1)},${corner.y.toFixed(1)}`).join(' ')))
const allDetected = rotation.every((row) => row.ok && row.corners.length >= 3)
if (allDetected && distinct.size > 1) {
  passed += 1
  console.log(`  ok  ${distinct.size} posisi sudut berbeda terbaca`)
} else {
  console.log(`  GAGAL sudut tidak ikut berubah saat benda diputar`)
}

await browser.close()

console.log('\n=== console ===')
console.log(pageErrors.length === 0 ? '(bersih)' : pageErrors.join('\n'))
console.log(`\n${passed}/${total} kasus lulus.`)
process.exit(passed === total ? 0 : 1)