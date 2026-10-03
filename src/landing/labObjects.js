/**
 * Katalog objek untuk 3D Geometry Lab.
 *
 * Sengaja dipisahkan dari `SHAPE_LIBRARY` milik pemindai kamera. Pemindai
 * memakai pustaka itu untuk pencocokan siluet pada enam sudut pandang, dan
 * menambah bentuk baru di sini tidak boleh ikut mengubah hasil pemindaian.
 * Laboratorium hanya butuh menampilkan bentuk, jadi kategorinya boleh lebih
 * bebas: Kubus dan Balok sama-sama balok, sedangkan Prisma Segitiga belum
 * termasuk bentuk yang bisa dikenali pemindai.
 *
 * Semua bentuk memakai satu struktur yang sama, yaitu daftar verteks dan daftar
 * bidang yang dik groupings dari indeks verteks. Konsekuensinya geometri,
 * garis wireframe, dan posisi label sisi bisa diturunkan dari satu sumber
 * kebenaran, sehingga label tidak pernah meleset dari sisinya.
 *
 * Dimensi ditulis dalam sentimeter lalu dikonversi ke meter, karena three.js
 * bekerja dalam meter.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

const CM = 0.01

/** Jarak label dari permukaan, sebagai pengali jari-jari bola pembungkus. */
const LABEL_OFFSET = 0.16

// ---------------------------------------------------------------------------
// Daftar verteks
// ---------------------------------------------------------------------------

/** Balok: panjang di sumbu X, lebar di sumbu Z, tinggi di sumbu Y. */
function boxVertices({ p, l, h }) {
  const x = (p * CM) / 2
  const y = (h * CM) / 2
  const z = (l * CM) / 2

  return [
    [-x, -y, z], // 0 kiri depan bawah
    [x, -y, z], //  1 kanan depan bawah
    [x, y, z], //  2 kanan depan atas
    [-x, y, z], // 3 kiri depan atas
    [-x, -y, -z], // 4 kiri belakang bawah
    [x, -y, -z], // 5 kanan belakang bawah
    [x, y, -z], //  6 kanan belakang atas
    [-x, y, -z], // 7 kiri belakang atas
  ]
}

/**
 * Prisma segitiga: alas segitiga tegak di bidang XY, lalu diperpanjang sepanjang
 * sumbu Z sebanyak panjang prisma `t`.
 */
function prismVertices({ a, h, t }) {
  const x = (a * CM) / 2
  const y = (h * CM) / 2
  const z = (t * CM) / 2

  return [
    [-x, -y, z], // 0 A depan
    [x, -y, z], //  1 B depan
    [0, y, z], //   2 C depan
    [-x, -y, -z], // 3 A belakang
    [x, -y, -z], //  4 B belakang
    [0, y, -z], //   5 C belakang
  ]
}

/** Limas segiempat: alas persegi di bidang XZ, puncak di sumbu Y. */
function pyramidVertices({ a, h }) {
  const s = (a * CM) / 2
  const y = (h * CM) / 2

  return [
    [-s, -y, s], // 0 kiri depan
    [s, -y, s], //  1 kanan depan
    [s, -y, -s], // 2 kanan belakang
    [-s, -y, -s], //3 kiri belakang
    [0, y, 0], //   4 puncak
  ]
}

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------

export const LAB_OBJECTS = {
  cube: {
    id: 'cube',
    label: 'Kubus',
    hint: 'Enam bidang datar persegi yang seluruh sisinya sama panjang.',
    dims: { p: 10, l: 10, h: 10 },
    vertices: boxVertices,
    faces: [
      { name: 'DEPAN', indices: [0, 1, 2, 3] },
      { name: 'BELAKANG', indices: [5, 4, 7, 6] },
      { name: 'KANAN', indices: [1, 5, 6, 2] },
      { name: 'KIRI', indices: [4, 0, 3, 7] },
      { name: 'ATAS', indices: [3, 2, 6, 7] },
      { name: 'BAWAH', indices: [4, 5, 1, 0] },
    ],
  },

  balok: {
    id: 'balok',
    label: 'Balok',
    hint: 'Enam bidang datar persegi panjang dengan panjang, lebar, dan tinggi berbeda.',
    dims: { p: 12, l: 9, h: 10 },
    vertices: boxVertices,
    faces: [
      { name: 'DEPAN', indices: [0, 1, 2, 3] },
      { name: 'BELAKANG', indices: [5, 4, 7, 6] },
      { name: 'KANAN', indices: [1, 5, 6, 2] },
      { name: 'KIRI', indices: [4, 0, 3, 7] },
      { name: 'ATAS', indices: [3, 2, 6, 7] },
      { name: 'BAWAH', indices: [4, 5, 1, 0] },
    ],
  },

  prisma: {
    id: 'prisma',
    label: 'Prisma Segitiga',
    hint: 'Dua alas segitiga yang sama besar dan sejajar, dihubungkan tiga bidang tegak.',
    dims: { a: 10, h: 12, t: 9 },
    vertices: prismVertices,
    faces: [
      { name: 'ALAS SEGITIGA', indices: [0, 1, 2] },
      { name: 'TUTUP', indices: [3, 5, 4] },
      { name: 'SISI BAWAH', indices: [0, 3, 4, 1] },
      { name: 'SISI MIRING', indices: [1, 4, 5, 2] },
      { name: 'SISI MIRING KIRI', indices: [2, 5, 3, 0] },
    ],
  },

  limas: {
    id: 'limas',
    label: 'Limas Segi Empat',
    hint: 'Alas persegi dan empat bidang segitiga yang bertemu di satu titik puncak.',
    dims: { a: 12, h: 12 },
    vertices: pyramidVertices,
    faces: [
      { name: 'ALAS', indices: [0, 1, 2, 3] },
      { name: 'SISI DEPAN', indices: [0, 1, 4] },
      { name: 'SISI KANAN', indices: [1, 2, 4] },
      { name: 'SISI BELAKANG', indices: [2, 3, 4] },
      { name: 'SISI KIRI', indices: [3, 0, 4] },
    ],
    // Puncak bukan bidang, jadi tidak bisa diambil dari daftar bidang.
    points: [{ name: 'PUNCAK', vertex: 4 }],
  },
}

export const LAB_OBJECT_LIST = Object.values(LAB_OBJECTS)

export function objectById(id) {
  return LAB_OBJECTS[id] ?? LAB_OBJECTS.cube
}

// ---------------------------------------------------------------------------
// Turunan bentuk
// ---------------------------------------------------------------------------

/** Mengalikan tiap dimensi dengan nilai slider ukuran. */
export function scaledDims(object, size) {
  const scaled = {}
  for (const [key, value] of Object.entries(object.dims)) scaled[key] = value * size
  return scaled
}

/** Membangun geometry three.js dari daftar verteks dan bidang. */
export function buildGeometry(object, dims) {
  const vertices = object.vertices(dims)
  const positions = []
  const indices = []

  for (const [x, y, z] of vertices) positions.push(x, y, z)

  // Bidang berbentuk segi banyak dipecah jadi segitiga-segitiga dengan cara
  // mengikat verteks pertama ke setiap pasangan berikutnya.
  for (const face of object.faces) {
    for (let i = 1; i < face.indices.length - 1; i += 1) {
      indices.push(face.indices[0], face.indices[i], face.indices[i + 1])
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Jari-jari bola pembungkus terbesar, dalam meter. */
export function boundingRadius(object, dims) {
  let radius = 0
  for (const [x, y, z] of object.vertices(dims)) {
    const distance = Math.hypot(x, y, z)
    if (distance > radius) radius = distance
  }
  return radius
}

/**
 * Posisi dan arah normal untuk setiap label sisi.
 *
 * Semua bentuk di lab ini convex dan berpusat di titik asal, arah dari pusat ke
 * titik berat sebuah bidang sama dengan arah keluar bidang itu. Jadi normal
 * cukup dihitung satu kali tanpa perlu Reach atau geometri yang lebih detail.
 */
export function faceLabels(object, dims) {
  const vertices = object.vertices(dims)
  const offset = boundingRadius(object, dims) * LABEL_OFFSET
  const labels = []

  const push = (name, center) => {
    const normal = center.clone().normalize()
    labels.push({
      name,
      position: center.clone().addScaledVector(normal, offset).toArray(),
      normal: normal.toArray(),
    })
  }

  for (const face of object.faces) {
    const center = new Vector3()
    for (const index of face.indices) center.add(new Vector3(...vertices[index]))
    center.divideScalar(face.indices.length)
    push(face.name, center)
  }

  for (const point of object.points ?? []) {
    push(point.name, new Vector3(...vertices[point.vertex]))
  }

  return labels
}