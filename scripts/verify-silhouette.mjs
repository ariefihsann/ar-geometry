/**
 * Menguji ekstraksi siluet dan pencocokan bentuk pada foto sintetis di browser
 * sungguhan, karena keduanya butuh canvas.
 *
 * Yang diuji justru kasus yang dilaporkan salah: tumbler (tabung) dan HP (balok),
 * plus bola, kerucut, dan limas. Foto disusun sebagai latar bergradasi dengan
 * bayangan, bukan latar rata, supaya algoritma diuji pada kondisi yang mirip
 * foto asli. Satu kasus memakai benda gelap tanpa warna supaya penyaringan
 * bayangan tidak boleh menghapus benda netral seperti HP hitam.
 *
 * Jalankan dengan dev server aktif:
 *   node node_modules/vite/bin/vite.js --port 4183
 *   TARGET_URL=https://localhost:4183/ node scripts/verify-silhouette.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.TARGET_URL ?? 'https://localhost:4183/'

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan, uji siluet dilewati.')
  process.exit(0)
}

/**
 * Menggambar foto sintetis: latar bergradasi, bayangan di bawah benda, lalu
 * benda dengan bentuk yang diminta.
 */
const DRAW_RECIPE = `window.__draw = function draw({ shape, w, h, fill, background }) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // Latar bergradasi supaya uji tidak lebih mudah dari foto datar.
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  if (background === 'light') {
    gradient.addColorStop(0, '#d8d2c6')
    gradient.addColorStop(1, '#f2eee6')
  } else {
    gradient.addColorStop(0, '#3a3a44')
    gradient.addColorStop(1, '#c8c2b6')
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2
  const boxW = w * 0.34
  const boxH = h * 0.46

  // Bayangan di bawah benda.
  ctx.save()
  ctx.filter = 'blur(10px)'
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + boxH * 0.55, boxW * 0.62, boxH * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = fill === 'dark' ? '#1b1b1f' : '#e8e2d6'

  if (shape === 'rect') {
    ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH)
  } else if (shape === 'circle') {
    ctx.beginPath()
    ctx.arc(cx, cy, boxW / 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (shape === 'triangle') {
    ctx.beginPath()
    ctx.moveTo(cx, cy - boxH / 2)
    ctx.lineTo(cx + boxW / 2, cy + boxH / 2)
    ctx.lineTo(cx - boxW / 2, cy + boxH / 2)
    ctx.closePath()
    ctx.fill()
  }

  return canvas
}`

const cases = [
  {
    name: 'Tabung (tumbler): samping persegi, atas lingkaran',
    expected: 'cylinder',
    views: { front: 'rect', right: 'rect', top: 'circle' },
  },
  {
    name: 'Balok (HP): persegi dari semua arah',
    expected: 'box',
    views: { front: 'rect', right: 'rect', top: 'rect' },
  },
  {
    name: 'Bola: lingkaran dari semua arah',
    expected: 'sphere',
    views: { front: 'circle', right: 'circle', top: 'circle' },
  },
  {
    name: 'Kerucut: samping segitiga, atas lingkaran',
    expected: 'cone',
    views: { front: 'triangle', right: 'triangle', top: 'circle' },
  },
  {
    name: 'Limas: samping segitiga, atas persegi',
    expected: 'pyramid',
    views: { front: 'triangle', right: 'triangle', top: 'rect' },
  },
  {
    name: 'Balok gelap tanpa warna di atas meja terang: tidak boleh ikut terbuang sebagai bayangan',
    expected: 'box',
    fill: 'dark',
    background: 'light',
    views: { front: 'rect', right: 'rect', top: 'rect' },
  },
]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-certificate-errors', '--no-sandbox'],
})

const page = await browser.newPage()
const pageLogs = []
page.on('pageerror', (err) => pageLogs.push(`[pageerror] ${err.message}`))

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })

// Modul sumber diambil lewat dev server Vite, jadi yang diuji kode yang benar-benar dipakai aplikasi.
await page.addScriptTag({ content: DRAW_RECIPE })
await page.evaluate(async () => {
  window.__silhouette = await import('/src/scan/silhouette.js')
  window.__match = await import('/src/scan/matchShape.js')
})

const results = []

for (const testCase of cases) {
  const measured = await page.evaluate((views, fill, background) => {
    const output = {}
    for (const [view, shape] of Object.entries(views)) {
      const canvas = window.__draw({ shape, w: 640, h: 800, fill, background })
      const result = window.__silhouette.measureSilhouette(canvas)
      output[view] = result.ok === true
        ? {
            ok: true,
            extent: result.extent,
            aspect: result.aspect,
            relativeWidth: result.relativeWidth,
            relativeHeight: result.relativeHeight,
            threshold: result.threshold,
            shadowSuspected: result.shadowSuspected,
            outline: result.outline,
          }
        : { ok: false, reason: result.reason }
    }
    return output
  }, testCase.views, testCase.fill ?? 'light', testCase.background ?? 'gradient')

  const match = await page.evaluate((m) => window.__match.matchShape(m), measured)

  const pass = match.ok === true && match.shapeId === testCase.expected
  results.push({ ...testCase, pass, measured, match })

  const extents = Object.entries(measured)
    .map(([view, item]) => `${view}=${item.ok === true ? item.extent.toFixed(3) : 'GAGAL'}`)
    .join('  ')

  const details = Object.entries(measured)
    .map(([view, item]) => {
      if (item.ok !== true) return `${view}: ${item.reason}`
      const parts = [`${view}: ${item.outline}`, `ambang ${item.threshold.toFixed(1)}`]
      if (item.shadowSuspected) parts.push('bayangan ikut terbaca')
      return parts.join(' · ')
    })
    .join('\n        ')

  console.log(`${pass === true ? '  ok  ' : ' GAGAL'} ${testCase.name}`)
  console.log(`        extent: ${extents}`)
  console.log(`        ${details}`)
  console.log(`        terdeteksi: ${match.label ?? 'tidak ada'} (harapan ${testCase.expected}), keyakinan ${match.ok === true ? Math.round(match.confidence * 100) + '%' : '-'}`)
  if (match.ok === true) {
    console.log(`        peringkat: ${match.ranking.map((r) => `${r.label}=${r.score.toFixed(3)}`).join('  ')}`)
  } else {
    console.log(`        alasan: ${match.reason}`)
  }
  for (const [view, item] of Object.entries(measured)) {
    if (item.ok === false) console.log(`        ${view}: ${item.reason}`)
  }
}

console.log('=== console ===')
console.log(pageLogs.length === 0 ? '(bersih)' : pageLogs.join('\n'))

const failed = results.filter((item) => item.pass === false)
console.log(`\n${results.length - failed.length}/${results.length} kasus lulus.`)

await browser.close()

if (failed.length > 0) process.exitCode = 1