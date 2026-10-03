/**
 * Uji cepat kontur tanpa browser, memakai mask buatan.
 *
 * Jalankan: node scripts/debug-contour.mjs
 */
import { traceContour, approxPolyDP, interiorAngles, detectCorners } from '../src/scan/contour.js'

function makeGrid(width, height) {
  return { width, height, mask: new Uint8Array(width * height) }
}

function fillRect(grid, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) grid.mask[y * grid.width + x] = 1
  }
}

function fillEllipse(grid, cx, cy, rx, ry) {
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) grid.mask[y * grid.width + x] = 1
    }
  }
}

function fillTriangle(grid, apexX, apexY, baseY, halfBase) {
  const height = baseY - apexY
  for (let y = apexY; y <= baseY; y += 1) {
    const t = (y - apexY) / height
    const half = halfBase * t
    for (let x = Math.round(apexX - half); x <= Math.round(apexX + half); x += 1) {
      if (x < 0 || x >= grid.width) continue
      grid.mask[y * grid.width + x] = 1
    }
  }
}

function bboxOf(grid) {
  let minX = grid.width
  let minY = grid.height
  let maxX = -1
  let maxY = -1
  const cells = []
  for (let i = 0; i < grid.mask.length; i += 1) {
    if (grid.mask[i] !== 1) continue
    cells.push(i)
    const x = i % grid.width
    const y = (i - x) / grid.width
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return {
    cells,
    minX,
    minY,
    maxX,
    maxY,
    boxWidth: maxX - minX + 1,
    boxHeight: maxY - minY + 1,
  }
}

function report(name, grid) {
  const bbox = bboxOf(grid)
  const contour = traceContour(grid.mask, grid.width, grid.height, bbox.cells)
  console.log(`\n${name}`)
  console.log(`  kontur: ${contour.length} titik`)
  console.log(
    `  6 pertama: ${contour
      .slice(0, 6)
      .map((p) => `(${p.x},${p.y})`)
      .join(' ')}`,
  )

  const epsilon = Math.max(2, Math.max(bbox.boxWidth, bbox.boxHeight) * 0.045)
  const polygon = approxPolyDP(contour, epsilon)
  console.log(`  epsilon ${epsilon.toFixed(1)} -> poligon ${polygon.length} titik`)
  console.log(`  ${polygon.map((p) => `(${p.x},${p.y})`).join(' ')}`)
  const angles = interiorAngles(polygon)
  console.log(
    `  sudut: ${angles.map((a) => a.toFixed(0)).join(', ')}`,
  )

  const detected = detectCorners(grid.mask, grid.width, grid.height, bbox.cells, bbox)
  console.log(`  kategori: ${detected.outline} (${detected.corners.length} sudut)`)
}

const rect = makeGrid(80, 80)
fillRect(rect, 20, 20, 59, 59)
report('persegi', rect)

const circle = makeGrid(80, 80)
fillEllipse(circle, 40, 40, 20, 20)
report('lingkaran', circle)

const triangle = makeGrid(80, 80)
fillTriangle(triangle, 40, 20, 59, 20)
report('segitiga', triangle)