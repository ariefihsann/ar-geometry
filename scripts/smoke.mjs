/**
 * Menguji alur penuh di browser: buka kamera (kamera palsu Chrome), ambil foto
 * di setiap sudut pandang, pastikan pembacaan sudut langsung bekerja, dan pastikan
 * pencocokan menghasilkan nama bentuk serta penampil 3D hidup dan bisa diputar.
 *
 * Jalankan:
 *   node node_modules/vite/bin/vite.js --port 4183
 *   TARGET_URL=https://localhost:4183/ node scripts/smoke.mjs
 */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const TARGET = process.env.TARGET_URL ?? 'https://localhost:4173/'

/**
 * Chrome hanya menerima berkas Y4M untuk kamera palsu, jadi pola yang dipakai
 * kita tulis sendiri: satu objek terang di tengah bingkai dengan latar gelap.
 * Semua tampilan menghasilkan siluet yang sama, dan itu cukup untuk memastikan
 * seluruh alur berjalan tanpa error.
 */
function writeFakeVideo(path, width, height, frames) {
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420mpeg2\n`, 'ascii')
  const ySize = width * height
  const uvSize = (width / 2) * (height / 2)
  const chunks = [header]

  for (let f = 0; f < frames; f += 1) {
    const frameHeader = Buffer.from('FRAME\n', 'ascii')
    const y = Buffer.alloc(ySize)
    const u = Buffer.alloc(uvSize, 128)
    const v = Buffer.alloc(uvSize, 128)

    // Latar gelap, objek terang di tengah: ekstraksi siluet akan menemukan
    // satu komponen besar di tengah bingkai.
    y.fill(30)
    for (let py = Math.round(height * 0.2); py < Math.round(height * 0.8); py += 1) {
      for (let px = Math.round(width * 0.3); px < Math.round(width * 0.7); px += 1) {
        y[py * width + px] = 215
      }
    }

    chunks.push(frameHeader, y, u, v)
  }

  writeFileSync(path, Buffer.concat(chunks))
  return path
}

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan, smoke test dilewati.')
  process.exit(0)
}

const videoDir = mkdtempSync(join(tmpdir(), 'ar-scan-'))
const videoPath = writeFakeVideo(join(videoDir, 'tumbler.y4m'), 640, 480, 90)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-certificate-errors',
    '--no-sandbox',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${videoPath}`,
    '--window-size=430,932',
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 })
await browser.defaultBrowserContext().overridePermissions(new globalThis.URL(TARGET).origin, ['camera'])

const logs = []
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`))

await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 1500))

const start = await page.evaluate(() => ({
  hasOpenButton: document.querySelector('[data-testid="open-camera"]') != null,
  title: document.querySelector('h1')?.textContent ?? null,
}))

// Aplikasi dibuka di halaman depan, jadi tombol buka kamera tidak ada langsung.
// harus dilalui di sini untuk masuk ke pemindai terlebih dulu.
const startScan = await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Mulai Pindai'),
  )
  if (button == null) return false
  button.click()
  return true
})

if (!startScan) {
  console.log('Tombol "Mulai Pindai" tidak ditemukan di halaman depan.')
  await browser.close()
  process.exit(1)
}

await page.waitForSelector('[data-testid="open-camera"]', { timeout: 20000 })
await page.click('[data-testid="open-camera"]')
await page.waitForSelector('[data-testid="take-photo"]', { timeout: 20000 })
await new Promise((r) => setTimeout(r, 2000))

// Teksnya "Langkah 1 dari 6", jadi yang dipakai angka terakhir.
const totalSteps = await page
  .$eval('.scan__header p', (el) => Number(el.textContent.match(/\d+/g)?.at(-1) ?? 0))
  .catch(() => 0)

// Pembacaan sudut langsung harus aktif sebelum foto pertama diambil. Overlay
// biru digambar di kanvas terpisah di atas video.
const liveBeforeShot = await page.evaluate(() => {
  const overlay = document.querySelector('.scan__overlay')
  const context = overlay?.getContext('2d')
  let painted = 0
  if (context != null) {
    const pixels = context.getImageData(0, 0, overlay.width, overlay.height).data
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted += 1
  }
  return {
    reading: document.querySelector('[data-testid="live-reading"]')?.textContent.trim() ?? null,
    outline: document.querySelector('[data-testid="live-reading"]')?.dataset.outline ?? null,
    overlayPaintedPixels: painted,
  }
})

const steps = []
for (let i = 0; i < totalSteps; i += 1) {
  const instruction = await page.$eval('.scan__instruction h2', (el) => el.textContent.trim()).catch(() => null)
  await page.click('[data-testid="take-photo"]')
  await new Promise((r) => setTimeout(r, 1500))

  const measured = await page.evaluate(() => {
    const metrics = Object.fromEntries(
      [...document.querySelectorAll('.scan__metrics div')].map((row) => [
        row.querySelector('dt').textContent.trim(),
        row.querySelector('dd').textContent.trim(),
      ]),
    )
    return {
      metrics,
      hasPreview: document.querySelector('.scan__preview') != null,
      error: document.querySelector('.scan__error')?.textContent.trim() ?? null,
      nextLabel: document.querySelector('[data-testid="advance"]')?.textContent.trim() ?? null,
    }
  })

  steps.push({ step: instruction, ...measured })
  await page.click('[data-testid="advance"]')
  await new Promise((r) => setTimeout(r, 1500))
}
const result = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="result"]')
  if (panel == null) return { reached: false }

  const canvas = document.querySelector('[data-testid="viewer"] canvas')
  const thumbs = [...document.querySelectorAll('.thumb img')].length

  return {
    reached: true,
    shapeName: document.querySelector('[data-testid="shape-name"]')?.textContent ?? null,
    confidence: document.querySelector('[data-testid="confidence"]')?.textContent.trim() ?? null,
    overrides: [...document.querySelectorAll('[data-testid="shape-override"] .chip')].map((chip) =>
      chip.textContent.trim(),
    ),
    consistencyWarnings: [...document.querySelectorAll('[data-testid="consistency-warning"]')].map((el) =>
      el.textContent.trim(),
    ),
    hasCanvas: canvas != null,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    webglWorking: (() => {
      if (canvas == null) return false
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      return gl != null && gl.isContextLost() === false
    })(),
    thumbs,
    sliders: [...document.querySelectorAll('.slider input')].map((input) => input.value),
    controlButtons: document.querySelectorAll('.viewer__controls button').length,
    ranking: [...document.querySelectorAll('.ranking li')].map((li) => li.textContent.trim()),
  }
})

// Uji tombol viewer: putar dan zoom harus benar-benar mengubah gambar. Panjang
// string PNG tidak bisa dijadikan bukti karena dua gambar berbeda bisa saja punya
// panjang yang sama, jadi yang dibandingkan jumlah piksel yang berubah.
// Isi kanvas WebGL tidak bisa dibaca lewat `readPixels` atau `toDataURL`
// karena drawing buffer three.js dibersihkan setelah tiap frame. Tangkapan
// layar elemen yang dikompositor Chromium adalah cara yang benar untuk melihat
// apa yang benar-benar tergambar.
const readRender = async () => {
  const viewer = await page.$('[data-testid="viewer"]')
  if (viewer == null) return null
  return viewer.screenshot({ encoding: 'binary' })
}

let controls = { skipped: true }
if (result.reached === true) {
  const before = await readRender()

  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.viewer__controls button')]
    buttons[0]?.click()
    buttons[4]?.click()
  })
  await new Promise((r) => setTimeout(r, 1200))

  const after = await readRender()

  const changed = before == null || after == null ? false : !before.equals(after)
  controls = { beforeBytes: before?.length ?? 0, afterBytes: after?.length ?? 0, changed }
}

// Slider ukuran harus mengubah nilai yang tampil.
let slider = { skipped: true }
if (result.reached === true && result.sliders.length > 0) {
  slider = await page.evaluate(() => {
    const input = document.querySelector('.slider input')
    const output = input.parentElement.querySelector('output')
    const before = output.textContent.trim()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, String(Number(input.max)))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return { before, after: output.textContent.trim() }
  })
}

// Mengganti bentuk secara manual harus mengganti nama bentuk yang tampil.
let override = { skipped: true }
if (result.reached === true && result.overrides?.length > 0) {
  const before = result.shapeName
  await page.click('[data-testid="pick-sphere"]')
  await new Promise((r) => setTimeout(r, 800))
  override = await page.evaluate((previous) => {
    const picked = document.querySelector('[data-testid="pick-sphere"]')
    return {
      before: previous,
      picked: picked?.textContent.trim() ?? null,
      after: document.querySelector('[data-testid="shape-name"]')?.textContent ?? null,
      note: document.querySelector('[data-testid="override-note"]')?.textContent.trim() ?? null,
    }
  }, before)
}

console.log('=== alur ===')
console.log(JSON.stringify({ start, liveBeforeShot, steps, result, controls, slider, override }, null, 2))
console.log('=== console ===')
console.log(logs.length === 0 ? '(bersih)' : logs.join('\n'))

await browser.close()
