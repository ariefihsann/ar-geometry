/**
 * Regresi: tinggi canvas 3D harus tetap diam, tidak tumbuh sendiri.
 *
 * <Canvas> milik react-three/fiber mengukur induknya lewat ResizeObserver lalu
 * menuliskan ukuran itu ke atribut width/height elemen <canvas>. Kalau wrapper
 * canvas tidak punya tinggi pasti, browser menghitung tinggi wrapper dari
 * elemen canvas itu sendiri. Hasilnya feedback loop:
 *
 *   canvas bertambah tinggi -> wrapper bertambah tinggi -> ResizeObserver
 *   menyala lagi -> canvas bertambah tinggi -> ... tanpa batas
 *
 * Gejalanya di halaman GeoAR Lab: section 3D Lab melebar ke bawah terus,
 * kubus tampak membesar sendiri, dan posisi scroll meloncat ke atas karena
 * tinggi dokumen terus bertambah.
 *
 * Jalankan dengan dev server aktif:
 *   node node_modules/vite/bin/vite.js --port 4183
 *   TARGET_URL=https://localhost:4183/ node scripts/verify-canvas.mjs
 */
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.TARGET_URL ?? 'https://localhost:4183/'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--ignore-certificate-errors', '--no-sandbox'],
})

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'gagal'} ${label}${detail === '' ? '' : ` (${detail})`}`)
  if (!ok) failed += 1
}

for (const [name, viewport] of [
  ['DESKTOP 1280x900', { width: 1280, height: 900 }],
  ['HP 390x844', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 1200))

  console.log(`--- ${name} ---`)

  // 1. Scroll ke section lab, lalu pastikan posisi scroll tidak bergerak sendiri.
  await page.evaluate(() => document.querySelector('#lab')?.scrollIntoView())
  await new Promise((r) => setTimeout(r, 800))

  const samples = []
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    samples.push(
      await page.evaluate(() => ({
        y: Math.round(window.scrollY),
        doc: document.documentElement.scrollHeight,
        canvasH: Math.round(
          document.querySelector('#lab canvas')?.getBoundingClientRect().height ?? -1,
        ),
      })),
    )
  }

  const scrollValues = samples.map((s) => s.y)
  const heightValues = samples.map((s) => s.canvasH)
  const docValues = samples.map((s) => s.doc)

  check(
    'posisi scroll tidak meloncat sendiri',
    new Set(scrollValues).size === 1,
    `y=${scrollValues.join(',')}`,
  )
  check('tinggi canvas lab stagnan', new Set(heightValues).size === 1, `h=${heightValues[0]}px`)
  check('tinggi dokumen stagnan', new Set(docValues).size === 1, `doc=${docValues[0]}px`)
  check(
    'canvas masuk area pandang',
    heightValues[0] > 200 && heightValues[0] < 640,
    `${heightValues[0]}px, tidak nol dan tidak raksasa`,
  )

  // 2. Canvas AR yang dimuat lewat `lazy` harus punya tinggi tetap juga.
  await page.evaluate(() => {
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent.includes('Aktifkan AR Demo'))
      ?.click()
  })
  await new Promise((r) => setTimeout(r, 3000))

  const arSamples = []
  for (let i = 0; i < 4; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    arSamples.push(
      await page.evaluate(() => {
        const canvas = document.querySelector('#ar canvas')
        return {
          h: Math.round(canvas?.getBoundingClientRect().height ?? -1),
          doc: document.documentElement.scrollHeight,
        }
      }),
    )
  }

  const arHeights = arSamples.map((s) => s.h)
  check('canvas AR termuat', arHeights[0] > 0, `h=${arHeights[0]}px`)
  check('tinggi canvas AR stagnan', new Set(arHeights).size === 1, `h=${arHeights.join(',')}`)
  check(
    'dokumen tetap stagnan setelah AR termuat',
    new Set(arSamples.map((s) => s.doc)).size === 1,
    `doc=${arSamples.at(-1).doc}px`,
  )

  console.log('')
  await page.close()
}

await browser.close()

console.log(failed === 0 ? 'Semua pemeriksaan lulus.' : `${failed} pemeriksaan gagal.`)
if (failed > 0) process.exitCode = 1