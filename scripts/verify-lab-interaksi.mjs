/**
 * Memeriksa 3D Lab: dropdown objek, wireframe, label sisi, dan serab langsung.
 *
 * Jalankan dengan dev server aktif:
 *   node node_modules/vite/bin/vite.js --port 4183
 *   TARGET_URL=https://localhost:4183/ node scripts/verify-lab-interaksi.mjs
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.TARGET_URL ?? 'https://localhost:4183/'

if (!existsSync(CHROME)) {
  console.log('Chrome tidak ditemukan.')
  process.exit(0)
}

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'gagal'} ${label}${detail === '' ? '' : ` (${detail})`}`)
  if (!ok) failed += 1
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--enable-unsafe-swiftshader', '--ignore-certificate-errors', '--no-sandbox'],
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 2000))

// Kanvas 3D Lab berada jauh di bawah lipatan halaman. `page.mouse` dan
// `page.touchscreen` memakai koordinat viewport, jadi tanpa scroll dulu semua
// gerakan serab mendarat di luar layar dan tes gagal tanpa sebab yang jelas.
await page.evaluate(() => document.querySelector('#lab')?.scrollIntoView({ block: 'center' }))
await new Promise((r) => setTimeout(r, 800))

// Dua sistem koordinat dipakai di berkas ini dan keduanya harus dipisah:
//   - `page.mouse` / `page.touchscreen` memakai koordinat viewport.
//   - `page.screenshot({ clip })` memakai koordinat dokumen, jadi harus ditambah
//     offset scroll. Kalau tidak, clip-nya meleset ke bagian halaman lain yang
//     isinya statis dan setiap perbandingan selalu dianggap sama.
const viewportBox = () =>
  page.$eval('#lab canvas', (node) => {
    const rect = node.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })

const clipBox = async () => {
  const rect = await viewportBox()
  return page.evaluate(
    (r) => ({ x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }),
    rect,
  )
}

// Kanvas harus benar-benar berada di dalam viewport, kalau tidak koordinat
// serab yang dipakai di bawah tidak valid.
const inViewport = await page.evaluate(() => {
  const rect = document.querySelector('#lab canvas').getBoundingClientRect()
  return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth
})
check('kanvas terlihat penuh di viewport', inViewport)

const clip = await clipBox()
const shot = () => page.screenshot({ clip })

const selectObject = async (value) => {
  await page.select('[data-testid="lab-object"]', value)
  await new Promise((r) => setTimeout(r, 900))
}

const labelTexts = () =>
  page.$$eval('[data-testid="lab-label"]', (nodes) => nodes.map((n) => n.textContent.trim()))

const visibleLabels = () =>
  page.$$eval('[data-testid="lab-label"]', (nodes) =>
    nodes.filter((n) => n.style.opacity === '1').map((n) => n.textContent.trim()),
  )

const dimmedLabels = () =>
  page.$$eval('[data-testid="lab-label"]', (nodes) =>
    nodes.filter((n) => n.style.opacity !== '' && n.style.opacity !== '1').map((n) => n.textContent.trim()),
  )

console.log('Dropdown objek')
const options = await page.$$eval('[data-testid="lab-object"] option', (nodes) =>
  nodes.map((n) => ({ value: n.value, label: n.textContent.trim() })),
)
check(
  'empat objek tersedia',
  options.length === 4,
  options.map((o) => o.label).join(', '),
)
check(
  'nama objek sesuai',
  ['Kubus', 'Balok', 'Prisma Segitiga', 'Limas Segi Empat'].every((name, index) => options[index]?.label === name),
  options.map((o) => o.label).join(' | '),
)
check(
  'objek awal adalah Kubus',
  (await page.$eval('[data-testid="lab-object"]', (node) => node.value)) === 'cube',
)

console.log('')
console.log('Label sisi')
const BOX_LABELS = ['DEPAN', 'BELAKANG', 'KANAN', 'KIRI', 'ATAS', 'BAWAH']

const kubus = await shot()
const kubusLabels = await labelTexts()
check(
  'Kubus punya enam label sisi',
  BOX_LABELS.every((name) => kubusLabels.includes(name)),
  kubusLabels.join(', '),
)
const kubusVisible = await visibleLabels()
const kubusDimmed = await dimmedLabels()
check(
  'sisi yang menghadap kamera dibuat terang',
  kubusVisible.includes('DEPAN'),
  kubusVisible.join(', '),
)
check(
  'sisi di belakang tetap ditampilkan dengan redup',
  kubusDimmed.length > 0 && kubusDimmed.length + kubusVisible.length === 6,
  `${kubusVisible.length} terang, ${kubusDimmed.length} redup`,
)

await selectObject('balok')
const balokLabels = await labelTexts()
check(
  'Balok juga memakai enam label sisi',
  BOX_LABELS.every((name) => balokLabels.includes(name)),
  balokLabels.join(', '),
)

await selectObject('prisma')
const prismaLabels = await labelTexts()
check(
  'Prisma memakai label alas, sisi tegak, dan tutup',
  ['ALAS SEGITIGA', 'TUTUP', 'SISI BAWAH'].every((name) => prismaLabels.includes(name)),
  prismaLabels.join(', '),
)

await selectObject('limas')
const limasLabels = await labelTexts()
check(
  'Limas memakai label alas, sisi, dan puncak',
  ['ALAS', 'PUNCAK', 'SISI DEPAN'].every((name) => limasLabels.includes(name)),
  limasLabels.join(', '),
)

console.log('')
console.log('Objek di kanvas berubah sesuai dropdown')
const prismaShot = await shot()
await selectObject('cube')
const balikKubus = await shot()
check('scene Limas berbeda dari Kubus', !prismaShot.equals(balikKubus))
check('scene Prisma berbeda dari Kubus', !prismaShot.equals(kubus))

console.log('')
console.log('Serab langsung di kanvas (tetikus)')
const before = await shot()
const box = await viewportBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

await page.mouse.move(cx, cy)
await page.mouse.down()
for (let i = 1; i <= 12; i += 1) {
  await page.mouse.move(cx + i * 9, cy + i * 3)
  await new Promise((r) => setTimeout(r, 25))
}
await page.mouse.up()
await new Promise((r) => setTimeout(r, 900))

check('serab tetikus mengubah tampilan', !before.equals(await shot()))

console.log('')
console.log('Serab langsung di kanvas (sentuh)')
const beforeTouch = await shot()
const touch = await page.touchscreen
await touch.touchStart(cx, cy)
for (let i = 1; i <= 8; i += 1) {
  await touch.touchMove(cx - i * 8, cy)
  await new Promise((r) => setTimeout(r, 30))
}
await touch.touchEnd()
await new Promise((r) => setTimeout(r, 900))

check('serab sentuh mengubah tampilan', !beforeTouch.equals(await shot()))

console.log('')
console.log('Label tidak memblokir drag di kanvas')
await selectObject('cube')
const anglesBeforeDrag = await page.$eval('[data-testid="lab-angles"]', (n) => n.textContent.trim())
const box2 = await viewportBox()
await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2)
await page.mouse.down()
for (let i = 1; i <= 10; i += 1) {
  await page.mouse.move(box2.x + box2.width / 2 + i * 8, box2.y + box2.height / 2 + i * 4)
  await new Promise((r) => setTimeout(r, 25))
}
await page.mouse.up()
await new Promise((r) => setTimeout(r, 600))
check(
  'drag tidak ikut memutar model',
  (await page.$eval('[data-testid="lab-angles"]', (n) => n.textContent.trim())) === anglesBeforeDrag,
  anglesBeforeDrag,
)

console.log('')
console.log('Slider dan tombol atur ulang')
await page.evaluate(() => {
  const sliders = [...document.querySelectorAll('#lab input[type="range"]')]
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(sliders[1], '120')
  sliders[1].dispatchEvent(new Event('input', { bubbles: true }))
})
await new Promise((r) => setTimeout(r, 500))
const anglesAfterSlider = await page.$eval('[data-testid="lab-angles"]', (node) => node.textContent.trim())
check('slider rotasi mengubah teks sudut', anglesAfterSlider.includes('120'), anglesAfterSlider)

const afterSlider = await shot()
await page.evaluate(() => {
  const sliders = [...document.querySelectorAll('#lab input[type="range"]')]
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(sliders[0], '2.4')
  sliders[0].dispatchEvent(new Event('input', { bubbles: true }))
})
await new Promise((r) => setTimeout(r, 700))
check('slider ukuran mengubah tampilan', !afterSlider.equals(await shot()))

await page.evaluate(() => {
  ;[...document.querySelectorAll('#lab button')].find((b) => b.textContent.trim() === 'Atur ulang').click()
})
await new Promise((r) => setTimeout(r, 800))
const anglesAfterReset = await page.$eval('[data-testid="lab-angles"]', (node) => node.textContent.trim())
check('atur mengembalikan sudut model', anglesAfterReset.includes('-18'), anglesAfterReset)

check('dropdown tidak berubah oleh atur ulang', (await page.$eval('[data-testid="lab-object"]', (n) => n.value)) === 'cube')
check('tidak ada error halaman', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await browser.close()

console.log('')
console.log(failed === 0 ? 'Semua pemeriksaan lulus.' : `${failed} pemeriksaan gagal.`)
if (failed > 0) process.exitCode = 1