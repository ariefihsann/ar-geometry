/**
 * Memeriksa pembingkaian kamera dan material tembus di 3D Lab.
 *
 * Dua hal yang dijaga di sini:
 *   1. Semua bentuk harus muat di dalam kanvas pada ukuran slider maksimum.
 *      Pemeriksaan dilakukan secara geometris: jarak kamera terhadap bola
 *      pembungkus bentuk dibandingkan dengan radius bidang pandang.
 *   2. Material harus tembus pandang sehingga objek di belakangnya tetap terlihat.
 *
 * Catatan kenapa tidak membaca piksel canvas: `readPixels` hanya bisa membaca
 * drawing buffer WebGL, dan browser mengosongkan buffer itu setelah compositing
 * kalau `preserveDrawingBuffer` tidak diaktifkan. Hasilnya nol semua walaupun
 * sedang ter-render. Mengukur geometri kamera jauh lebih bisa dipercaya.
 *
 * Jalankan dengan dev server aktif:
 *   TARGET_URL=https://localhost:4183/ node scripts/verify-lab-bentuk.mjs
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
await page.evaluate(() => document.querySelector('#lab')?.scrollIntoView({ block: 'center' }))
await new Promise((r) => setTimeout(r, 600))

const setSize = async (value) => {
  await page.evaluate((v) => {
    const slider = document.querySelector('#lab input[type="range"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(slider, String(v))
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
  await new Promise((r) => setTimeout(r, 800))
}

const selectObject = async (value) => {
  await page.select('[data-testid="lab-object"]', value)
  await new Promise((r) => setTimeout(r, 800))
}

/**
 * Mengembalikan berapa persen tinggi bidang pandang yang dipakai bentuk tersebut.
 * Di bawah 100 berarti seluruh bola pembungkus masih berada di dalam kanvas.
 */
const framing = () =>
  page.evaluate(() => {
    const state = window.__geoarLab
    if (state == null) return { available: false }

    const camera = state.camera

    // Hanya mesh bendanya yang diambil, bukan garis rusuk `Edges` atau
    // `Outlines`. Ketiganya memakai geometry yang sama, jadi pencarian
    // "mesh pertama" bisa salah mengenai apa yang sebenarnya diukur.
    let mesh = null
    state.scene.traverse((node) => {
      if (mesh != null || node.isMesh !== true) return
      if (node.material?.opacity < 1) mesh = node
    })
    if (mesh == null) return { available: false }

    // Radius bola pembungkus dihitung dengan menerapkan matrix dunia ke setiap
    // verteks. Cara ini tidak bergantung pada satuan yang dipakai `buildArgs`
    // dan tidak bergantung pada `boundingSphere` yang bisa berisi hasil hitung
    // lama. `matrixWorld.elements` berurutan kolom, sama seperti three.js.
    const positions = mesh.geometry.attributes.position.array
    const m = mesh.matrixWorld.elements
    let radius = 0

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const y = positions[i + 1]
      const z = positions[i + 2]

      const worldX = m[0] * x + m[4] * y + m[8] * z + m[12]
      const worldY = m[1] * x + m[5] * y + m[9] * z + m[13]
      const worldZ = m[2] * x + m[6] * y + m[10] * z + m[14]

      const distance = Math.hypot(worldX, worldY, worldZ)
      if (distance > radius) radius = distance
    }

    const worldRadius = radius
    const target = state.controls?.target ?? { x: 0, y: 0, z: 0 }
    const distance = camera.position.distanceTo(target)
    const halfFov = (camera.fov * Math.PI) / 360

    // Radius proyeksi bola pembungkus terhadap setengah tinggi bidang pandang.
    const fillPercent = (worldRadius / (distance * Math.tan(halfFov))) * 100

    const material = mesh.material
    return {
      available: true,
      fillPercent,
      worldRadius,
      distance,
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
    }
  })

console.log('Pembingkaian: semua objek harus muat di kanvas')
await setSize(2.4)

for (const [value, name] of [
  ['cube', 'Kubus'],
  ['balok', 'Balok'],
  ['prisma', 'Prisma Segitiga'],
  ['limas', 'Limas Segi Empat'],
]) {
  await selectObject(value)
  const m = await framing()
  if (!m.available) {
    check(`${name}: state scene terbaca`, false)
    continue
  }
  check(
    `${name} muat di kanvas pada 2.4x`,
    m.fillPercent < 100,
    `mengisi ${m.fillPercent.toFixed(0)}% tinggi bidang pandang`,
  )
}

console.log('')
console.log('Pembingkaian: ukuran terkecil juga tidak nol')
await setSize(0.4)
await selectObject('cube')
const kecil = await framing()
check('benda masih terlihat pada 0.4x', kecil.fillPercent > 10, `mengisi ${kecil.fillPercent.toFixed(0)}%`)

console.log('')
console.log('Wireframe tembus pandang')
await setSize(1.4)
await selectObject('prisma')
const prisma = await framing()
check('benda tembus pandang', prisma.transparent === true && prisma.opacity < 0.6, `opacity ${prisma.opacity}`)
check(
  'sisi belakang tidak menutupi depan',
  prisma.depthWrite === false,
  `depthWrite ${prisma.depthWrite}`,
)

const wireColors = await page.evaluate(() => {
  const state = window.__geoarLab
  if (state == null) return []

  const colors = []
  state.scene.traverse((node) => {
    // `<Edges>` dari drei v10 membuat `LineSegments2` dari three-stdlib, bukan
    // `LineSegments` bawaan three.js. `GridHelper` juga garis, tapi warnanya
    // ada di setiap verteks dan bukan di material, jadi harus dilewati.
    if (node.isLineSegments2 === true && node.material?.vertexColors !== true) {
      colors.push(`#${node.material.color.getHexString()}`)
    }
  })
  return colors
})
check('garis rusuk cyan neon', wireColors.includes('#00e5ff'), wireColors.join(', ') || 'tidak ketemu')

console.log('')
console.log('Framing menyesuaikan objek dan ukuran')
await setSize(0.4)
const a = await framing()
await setSize(2.4)
const b = await framing()
check(
  'kamera menjauh saat benda membesar',
  b.distance > a.distance,
  `0.4x=${a.distance.toFixed(3)}m vs 2.4x=${b.distance.toFixed(3)}m`,
)
check(
  'ukuran di layar tetap wajar di kedua ujung',
  Math.abs(a.fillPercent - b.fillPercent) < 35,
  `${a.fillPercent.toFixed(0)}% vs ${b.fillPercent.toFixed(0)}%`,
)

check('tidak ada error halaman', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))

await browser.close()

console.log('')
console.log(failed === 0 ? 'Semua pemeriksaan lulus.' : `${failed} pemeriksaan gagal.`)
if (failed > 0) process.exitCode = 1
