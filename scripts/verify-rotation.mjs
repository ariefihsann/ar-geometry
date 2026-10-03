/**
 * Regresi: "extent" harus tetap konsisten meski bendanya miring.
 *
 * Sebelumnya rasio isi diukur terhadap kotak pembatas yang lurus sumbu layar.
 * Begitu benda miring, kotaknya ikut membesar dan extent menyusut palsu, sampai
 *nilainya mendarat di kisaran lingkaran dan balok salah dibaca sebagai Bola.
 *
 * Jalankan dengan dev server aktif:
 *   TARGET_URL=https://localhost:4183/ node scripts/verify-rotation.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.TARGET_URL ?? 'https://localhost:4183/'

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan.')
  process.exit(0)
}

const DRAW = `window.__draw = function draw({ w, h, shape, rotate }) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, '#3f3f4a')
  gradient.addColorStop(0.5, '#8f8b80')
  gradient.addColorStop(1, '#d8d2c6')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotate)
  ctx.fillStyle = '#ddd6c8'
  ctx.beginPath()

  // Benda sengaja dibuat hanya mengisi sebagian bingkai, sebab pembacaan
  // menolak siluet yang terlalu besar untuk dianggap sebagai satu benda.
  if (shape === 'rect') {
    ctx.rect(-w * 0.17, -h * 0.22, w * 0.34, h * 0.44)
  } else {
    ctx.arc(0, 0, Math.min(w, h) * 0.3, 0, Math.PI * 2)
  }

  ctx.fill()
  ctx.restore()

  return canvas
}`

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--ignore-certificate-errors', '--no-sandbox'],
})

const page = await browser.newPage()
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
await page.addScriptTag({ content: DRAW })
await page.evaluate(async () => {
  window.__silhouette = await import('/src/scan/silhouette.js')
})

const degree = (value) => (value * Math.PI) / 180

let failed = 0

console.log('Balok, harus tetap ext~1 dan terbaca balok pada semua kemiringan')
for (const angle of [0, 8, 15, 25, 40]) {
  const measured = await page.evaluate((options) => {
    const canvas = window.__draw({ w: 480, h: 640, ...options })
    const result = window.__silhouette.measureSilhouette(canvas)
    if (result.ok !== true) return { ok: false, reason: result.reason }
    return { ok: true, corners: result.cornerCount, outline: result.outline, extent: result.extent }
  }, { shape: 'rect', rotate: degree(angle) })

  if (measured.ok !== true) {
    console.log(`  gagal ${angle} derajat: ${measured.reason}`)
    failed += 1
    continue
  }

  const problems = []
  if (measured.outline !== 'rect') problems.push(`kategori ${measured.outline}`)
  if (Math.abs(measured.extent - 1) > 0.08) problems.push(`extent ${measured.extent.toFixed(3)}`)
  if (measured.corners !== 4) problems.push(`${measured.corners} sudut`)

  if (problems.length > 0) {
    console.log(`  gagal miring ${String(angle).padStart(2)} derajat: ${problems.join(', ')}`)
    failed += 1
  } else {
    console.log(`  ok miring ${String(angle).padStart(2)} derajat: rect, ${measured.corners} sudut, extent ${measured.extent.toFixed(3)}`)
  }
}

console.log('')
console.log('Bola, harus tetap ext~0,79 dan terbaca bola pada semua kemiringan')
for (const angle of [0, 20, 35]) {
  const measured = await page.evaluate((options) => {
    const canvas = window.__draw({ w: 480, h: 640, ...options })
    const result = window.__silhouette.measureSilhouette(canvas)
    if (result.ok !== true) return { ok: false, reason: result.reason }
    return { ok: true, outline: result.outline, extent: result.extent }
  }, { shape: 'circle', rotate: degree(angle) })

  if (measured.ok !== true) {
    console.log(`  gagal ${angle} derajat: ${measured.reason}`)
    failed += 1
    continue
  }

  const problems = []
  if (measured.outline !== 'round') problems.push(`kategori ${measured.outline}`)
  if (Math.abs(measured.extent - 0.785) > 0.06) problems.push(`extent ${measured.extent.toFixed(3)}`)

  if (problems.length > 0) {
    console.log(`  gagal miring ${String(angle).padStart(2)} derajat: ${problems.join(', ')}`)
    failed += 1
  } else {
    console.log(`  ok miring ${String(angle).padStart(2)} derajat: round, extent ${measured.extent.toFixed(3)}`)
  }
}

await browser.close()

if (failed > 0) {
  console.log('')
  console.log(`${failed} kasus gagal.`)
  process.exitCode = 1
} else {
  console.log('')
  console.log('Semua kasus lulus.')
}