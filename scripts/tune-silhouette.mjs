/**
 * Eksperimen: menguji nilai blur radius dan ambang terhadap ketepatan `extent`
 * untuk persegi, lingkaran, dan segitiga pada foto bergradasi.
 *
 * Jalankan: TARGET_URL=https://localhost:4183/ node scripts/tune-silhouette.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const TARGET = process.env.TARGET_URL ?? 'https://localhost:4183/'

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan.')
  process.exit(0)
}

const DRAW = `window.__draw = function draw({ shape, w, h }) {
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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-certificate-errors', '--no-sandbox'],
})

const page = await browser.newPage()
await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 })
await page.addScriptTag({ content: DRAW })
await page.evaluate(async () => {
  window.__silhouette = await import('/src/scan/silhouette.js')
})

const ideal = { rect: 1, circle: Math.PI / 4, triangle: 0.5 }
const radii = [0.06, 0.09, 0.12, 0.15, 0.2, 0.25]
const thresholds = [null, 40, 60, 80, 100]

for (const shape of ['rect', 'circle', 'triangle']) {
  console.log(`\n=== ${shape} (ideal extent ${ideal[shape].toFixed(3)}) ===`)
  for (const radius of radii) {
    const row = []
    for (const threshold of thresholds) {
      const value = await page.evaluate(
        (shape, radius, threshold) => {
          const canvas = window.__draw({ shape, w: 640, h: 800 })
          const result = window.__silhouette.measureSilhouette(canvas, {
            blurRatio: radius,
            threshold: threshold ?? undefined,
          })
          return result.ok === true ? Number(result.extent.toFixed(3)) : 'x'
        },
        shape,
        radius,
        threshold,
      )
      const label = threshold == null ? 'otsu' : String(threshold)
      row.push(`${label}:${value}`)
    }
    console.log(`  blur ${radius.toFixed(2)}  ${row.join('  ')}`)
  }
}

await browser.close()