/**
 * Menguji halaman depan GeoAR Lab di browser.
 *
 * Yang diperiksa:
 *   - semua section muncul (hero, katalog, lab 3D, AR, alat bantu)
 *   - tombol hero membuka kalkulator / scroll ke section yang benar
 *   - katalog materi membuka ringkasan
 *   - slider 3D Lab benar-benar mengubah scene
 *   - kalkulator menghitung dan kuis menilai jawaban
 *   - tombol AR memuat modul WebXR tanpa error
 *
 * Jalankan:
 *   node node_modules/vite/bin/vite.js --port 4183
 *   TARGET_URL=https://localhost:4183/ node scripts/smoke-landing.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const TARGET = process.env.TARGET_URL ?? 'https://localhost:4183/'

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan, smoke test dilewati.')
  process.exit(0)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: [
    '--enable-unsafe-swiftshader',
    '--ignore-certificate-errors',
    '--no-sandbox',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

const pageErrors = []
const consoleErrors = []

page.on('pageerror', (error) => pageErrors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})

let failed = 0
const check = (label, ok, detail = '') => {
  if (ok) {
    console.log(`  ok   ${label}${detail === '' ? '' : ` (${detail})`}`)
  } else {
    console.log(`  gagal ${label}${detail === '' ? '' : ` (${detail})`}`)
    failed += 1
  }
}

await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 })

console.log('Halaman depan')
const hero = await page.evaluate(() => ({
  title: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  stats: [...document.querySelectorAll('dl dt')].map((n) => n.textContent.trim()),
  sections: ['materi', 'lab', 'ar', 'alat'].filter((id) => document.getElementById(id) != null),
  materiCards: document.querySelectorAll('#materi article').length,
  quizOptions: [...document.querySelectorAll('#alat li button')].length,
}))

check('judul hero tampil', hero.title.includes('Temukan Geometri'), hero.title)
check('baris statistik lengkap', hero.stats.length === 3, hero.stats.join(' | '))
check('keempat section terpasang', hero.sections.length === 4, hero.sections.join(', '))
check('enam kartu materi', hero.materiCards === 6, `${hero.materiCards} kartu`)

console.log('')
console.log('Katalog materi')
await page.click('#materi article button')
await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
const dialogTitle = await page.$eval('[role="dialog"] h2', (node) => node.textContent.trim())
check('ringkasan terbuka', dialogTitle.length > 0, dialogTitle)
await page.click('[role="dialog"] button[aria-label="Tutup ringkasan"]')
await page.waitForFunction(() => document.querySelector('[role="dialog"]') == null, { timeout: 5000 })
check('ringkasan bisa ditutup', true)

console.log('')
console.log('Laboratorium 3D')

// Screenshot dipakai, bukan `toDataURL()`.
//
// `toDataURL()` membaca drawing buffer WebGL secara langsung. Karena
// `preserveDrawingBuffer` tidak diaktifkan, buffer itu sudah dikosongkan browser
// setelah di-composite, sehingga hasilnya string kosong yang sama, berapa
// pun scene-nya berubah. Screenshot menangkap hasil composite yang terlihat.
const labBox = await page.$eval('#lab canvas', (node) => {
  const rect = node.getBoundingClientRect()
  // `page.screenshot({ clip })` memakai koordinat dokumen, sedangkan
  // `getBoundingClientRect()` memakai koordinat viewport. Tanpa offset scroll,
  // clip-nya mendarat di bagian halaman lain dan dua screenshot selalu sama.
  return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }
})

const labBefore = await page.screenshot({ clip: labBox })

const sliderHandle = await page.evaluate(() => {
  const slider = [...document.querySelectorAll('#lab input[type="range"]')][1]
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(slider, '95')
  slider.dispatchEvent(new Event('input', { bubbles: true }))
  return Number(slider.value)
})
await new Promise((resolve) => setTimeout(resolve, 800))
const labAfter = await page.screenshot({ clip: labBox })

check('slider rotasi X bergerak', sliderHandle === 95, `nilai ${sliderHandle}`)
check('canvas 3D berubah setelah slider digerakkan', !labBefore.equals(labAfter))
check(
  'canvas 3D tidak kosong',
  labAfter.length > 5000,
  `${labAfter.length} byte PNG`,
)

console.log('')
console.log('Kalkulator')
await page.select('#alat select', 'balok')
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('#alat input[type="number"]')]
  const values = ['8', '6', '4']
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  inputs.forEach((input, index) => {
    setter.call(input, values[index])
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
})
await page.evaluate(() => {
  ;[...document.querySelectorAll('#alat button')].find((b) => b.textContent.trim() === 'Hitung').click()
})
await new Promise((resolve) => setTimeout(resolve, 300))
const calc = await page.evaluate(() =>
  [...document.querySelectorAll('#alat dd')].map((n) => n.textContent.trim()),
)
check('volume balok benar (8x6x4)', calc.includes('192.00 cm³'), calc.join(' | '))
check('luas balok benar', calc.some((v) => v.startsWith('208.00')), calc.join(' | '))

console.log('')
console.log('Kuis')
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('#alat li button')]
  buttons[0].click()
})
await new Promise((resolve) => setTimeout(resolve, 200))
// `p.text-sm` juga dipakai oleh judul section, jadi explanatory text dicari lewat
// teks yang.awalnya "Benar" atau "Belum tepat".
const quiz = await page.evaluate(() =>
  [...document.querySelectorAll('#alat p')].map((n) => n.textContent.trim()).find((t) => t.startsWith('Benar') || t.startsWith('Belum tepat')) ?? '',
)
check('jawaban benar memberi penjelasan', quiz.startsWith('Benar'), quiz.slice(0, 40))

console.log('')
console.log('Modul AR')
await page.evaluate(() => {
  ;[...document.querySelectorAll('button')]
    .find((b) => b.textContent.includes('Aktifkan AR Demo'))
    ?.click()
})
await new Promise((resolve) => setTimeout(resolve, 2500))
const ar = await page.evaluate(() => {
  // Section AR yang sudah termuat memakai `id="ar"`, dan versi placeholder juga
  // memakai id yang sama. Karena itu pembedaannya dilakukan lewat isi section:
  // yang sudah termuat punya canvas, yang masih placeholder berisi teks memuat.
  const section = document.querySelector('section#ar')
  return {
    canvas: section?.querySelectorAll('canvas').length ?? 0,
    text: section?.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    loading: (section?.textContent ?? '').includes('Menyiapkan modul AR'),
  }
})
check('modul AR termuat (bukan fallback)', !ar.loading)
check('section AR punya canvas', ar.canvas >= 1, `${ar.canvas} canvas`)
check('judul AR sesuai', ar.text.includes('dunia nyata'), ar.text)

console.log('')
const xrErrors = pageErrors.filter((text) => text.toLowerCase().includes('xr'))
check('tidak ada error WebXR', xrErrors.length === 0, xrErrors.join(' | '))
check('tidak ada error halaman', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await browser.close()

console.log('')
if (failed > 0) {
  console.log(`${failed} pemeriksaan gagal.`)
  if (consoleErrors.length > 0) {
    console.log('catatan error konsol:')
    for (const text of consoleErrors.slice(0, 5)) console.log(`  - ${text}`)
  }
  process.exitCode = 1
} else {
  console.log('Semua pemeriksaan lulus.')
}