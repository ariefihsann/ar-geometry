/**
 * Diagnosa: berapa sudut yang terbaca untuk balok pada foto yang lebih mirip
 * kondisi nyata, yaitu latar bergradasi, bayangan, tepi miring, dan derau piksel.
 *
 * Foto sintetis yang dipakai uji sebelumnya terlalu bersih, sehingga tepi
 * persegi selalu terbaca rapi. Foto asli punya tepi yang bergerigi dan
 * pencahayaan yang tidak rata, dan itu yang membuat sudut terbaca banyak.
 *
 * Jalankan dengan dev server aktif:
 *   TARGET_URL=https://localhost:4183/ node scripts/diagnose-corners.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.TARGET_URL ?? 'https://localhost:4183/'

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan.')
  process.exit(0)
}

const DRAW = `window.__draw = function draw({ w, h, rotate, noise, soften }) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, '#4a4a55')
  gradient.addColorStop(0.5, '#a8a396')
  gradient.addColorStop(1, '#d8d2c6')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2
  const boxW = w * 0.34
  const boxH = h * 0.44

  ctx.save()
  ctx.filter = 'blur(14px)'
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.ellipse(cx + boxW * 0.25, cy + boxH * 0.52, boxW * 0.6, boxH * 0.09, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotate)
  ctx.fillStyle = '#ddd6c8'
  ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH)
  ctx.restore()

  if (soften > 0) {
    const copy = document.createElement('canvas')
    copy.width = w
    copy.height = h
    copy.getContext('2d').drawImage(canvas, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.filter = 'blur(' + soften + 'px)'
    ctx.drawImage(copy, 0, 0)
    ctx.filter = 'none'
  }

  if (noise > 0) {
    const image = ctx.getImageData(0, 0, w, h)
    for (let i = 0; i < image.data.length; i += 4) {
      const jitter = (Math.random() - 0.5) * noise
      image.data[i] = Math.max(0, Math.min(255, image.data[i] + jitter))
      image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + jitter))
      image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + jitter))
    }
    ctx.putImageData(image, 0, 0)
  }

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

const conditions = [
  { name: 'bersih, tegak', rotate: 0, noise: 0, soften: 0 },
  { name: 'miring 8 derajat', rotate: degree(8), noise: 0, soften: 0 },
  { name: 'miring 15 derajat', rotate: degree(15), noise: 0, soften: 0 },
  { name: 'derau ringan', rotate: 0, noise: 26, soften: 0 },
  { name: 'tepi lembut dan derau', rotate: degree(8), noise: 22, soften: 1.6 },
  { name: 'miring 22 derajat dan derau', rotate: degree(22), noise: 20, soften: 1.2 },
]

console.log('kondisi                     sudut  kategori  extent')
for (const condition of conditions) {
  const result = await page.evaluate((options) => {
    const canvas = window.__draw({ w: 640, h: 800, ...options })
    const measured = window.__silhouette.measureSilhouette(canvas)
    if (measured.ok !== true) return { ok: false, reason: measured.reason }
    return {
      ok: true,
      corners: measured.cornerCount,
      outline: measured.outline,
      extent: Number(measured.extent.toFixed(3)),
    }
  }, condition)

  if (result.ok !== true) {
    console.log(`${condition.name.padEnd(27)} GAGAL: ${result.reason}`)
    continue
  }
  console.log(
    `${condition.name.padEnd(27)} ${String(result.corners).padStart(4)}  ${result.outline.padEnd(8)}  ${result.extent}`,
  )
}

await browser.close()