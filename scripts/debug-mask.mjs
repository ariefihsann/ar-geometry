/**
 * Alat bantu: membandingkan topeng siluet untuk satu bentuk pada beberapa mode
 * penyaringan bayangan, dipakai saat siluet bundar ikut berubahcategory.
 *
 * Jalankan dengan dev server aktif:
 *   TARGET_URL=https://localhost:4183/ node scripts/debug-mask.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.TARGET_URL ?? 'https://localhost:4183/'

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan.')
  process.exit(0)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--ignore-certificate-errors', '--no-sandbox'],
})

const page = await browser.newPage()
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })

const output = await page.evaluate(async () => {
  const { measureSilhouette } = await import('/src/scan/silhouette.js')
  const contour = await import('/src/scan/contour.js')

  const w = 640
  const h = 800
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
  const boxW = w * 0.34
  const boxH = h * 0.46

  ctx.save()
  ctx.filter = 'blur(10px)'
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + boxH * 0.55, boxW * 0.62, boxH * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = '#e8e2d6'
  ctx.beginPath()
  ctx.arc(cx, cy, boxW / 2, 0, Math.PI * 2)
  ctx.fill()

  const rows = []
  for (const ignoreShadow of [false, true]) {
    const result = measureSilhouette(canvas, { ignoreShadow })
    rows.push({
      ignoreShadow,
      ok: result.ok,
      outline: result.outline,
      corners: result.cornerCount,
      extent: result.extent,
      relativeWidth: result.relativeWidth,
      relativeHeight: result.relativeHeight,
      shadowSuspected: result.shadowSuspected,
      cornerPoints:
        result.corners?.map((corner) => `${corner.x.toFixed(0)},${corner.y.toFixed(0)}`).join(' ') ?? null,
      bbox: result.bbox ?? null,
      angles: result.angles?.map((angle) => Math.round(angle)).join(' ') ?? null,
    })
  }

  // Pipeline kontur langsung, supaya bisa dibandingkan dengan hasil pengukuran.
  const sample = 240
  const small = document.createElement('canvas')
  small.width = sample
  small.height = Math.round((h / w) * sample)
  const smallCtx = small.getContext('2d')
  smallCtx.drawImage(canvas, 0, 0, small.width, small.height)
  const source = smallCtx.getImageData(0, 0, small.width, small.height)

  // Topeng kasar: piksel yang cukup berbeda dari warna tepi.
  const mask = new Uint8Array(sample * small.height)
  for (let y = 0; y < small.height; y += 1) {
    for (let x = 0; x < sample; x += 1) {
      const index = y * sample + x
      const p = index * 4
      const luma = source.data[p] * 0.299 + source.data[p + 1] * 0.587 + source.data[p + 2] * 0.114
      const left = x > 0 ? y * sample + x - 1 : index
      const q = left * 4
      const leftLuma = source.data[q] * 0.299 + source.data[q + 1] * 0.587 + source.data[q + 2] * 0.114
      if (Math.abs(luma - leftLuma) < 12) continue
      if (luma > 150) mask[index] = 1
    }
  }

  const cells = []
  for (let i = 0; i < mask.length; i += 1) if (mask[i] === 1) cells.push(i)

  const traced = contour.traceContour(mask, sample, small.height, cells)
  const steps = []
  for (const factor of [0.02, 0.035, 0.045, 0.06, 0.08]) {
    const epsilon = Math.max(2, 82 * factor)
    const simplified = contour.approxPolyDP(traced, epsilon)
    steps.push({ factor, epsilon: Number(epsilon.toFixed(2)), points: simplified.length })
  }

  rows.push({ kontur: traced.length, approxs: steps })
  return rows
})

for (const row of output) {
  if (row.kontur == null) {
    console.log(`ignoreShadow=${row.ignoreShadow} outline=${row.outline} sudut=${row.corners} extent=${row.extent?.toFixed(3)}`)
    console.log(`  bbox: ${JSON.stringify(row.bbox)}`)
    console.log(`  sudut: ${row.cornerPoints}`)
    console.log(`  dalam: ${row.angles}`)
    continue
  }
  console.log(`kontur kasar: ${row.kontur} titik`)
  for (const step of row.approxs) {
    console.log(`  epsilon ${step.epsilon} (faktor ${step.factor}) -> ${step.points} titik`)
  }
}

await browser.close()