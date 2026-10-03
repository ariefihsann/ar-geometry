/**
 * Bangun ruang hasil pemindaian, dirender sebagai mesh three.js.
 *
 * Ukuran memakai satuan sentimeter yang kemudian dikonversi ke meter, karena
 * three.js bekerja dalam meter.
 *
 * Putar otomatis ditangani `OrbitControls` di `Viewer3D`, bukan mesh di sini.
 * Kalau keduanya berputar sekaligus, objek diam tetapi kamera ikut bergerak,
 * sehingga arah penglihatannya berputar dua kali lebih cepat.
 */
import { useMemo } from 'react'
import { Edges, Outlines } from '@react-three/drei'
import { MathUtils } from 'three'
import { shapeById } from '../scan/shapeLibrary.js'

const CM = 0.01

export function ScannedMesh({ shapeId, dims, opacity = 1 }) {
  const preset = shapeById(shapeId)
  const args = useMemo(() => buildArgs(preset.id, dims), [preset.id, dims])

  // `opacity` dipakai 3D Lab supaya benda bisa ditembus pandang. `depthWrite`
  // dimatikan saat tembus, karena kalau masih menulis kedalaman, sisi belakang
  // benda akan tetap menutupi sisi depan dan objek lain di belakangnya.
  const seeThrough = opacity < 1

  return (
    <mesh castShadow receiveShadow>
      {preset.id === 'cylinder' && <cylinderGeometry args={args} />}
      {preset.id === 'cone' && <coneGeometry args={args} />}
      {preset.id === 'box' && <boxGeometry args={args} />}
      {preset.id === 'sphere' && <sphereGeometry args={args} />}
      {preset.id === 'pyramid' && <coneGeometry args={[args[0], args[1], 4]} />}

      <meshStandardMaterial
        color="#6ea8fe"
        roughness={0.3}
        metalness={0.15}
        transparent={seeThrough}
        opacity={opacity}
        depthWrite={!seeThrough}
      />
      <Edges threshold={12} color="#bcd4ff" />
      <Outlines color="#ffffff" thickness={4} angle={MathUtils.degToRad(12)} />
    </mesh>
  )
}

/** Mengubah ukuran cm menjadi argumen geometri dalam meter. */
function buildArgs(shapeId, dims) {
  const d = (key) => (dims[key] ?? 0) * CM

  switch (shapeId) {
    case 'cylinder':
      // `CylinderGeometry` membaca (radiusTop, radiusBottom, height,
      // radialSegments). Kalau jumlah argumennya kurang, `height` akan ikut
      // dibaca sebagai jumlah segmen dan tabung ikut memanjang sampai 48 meter.
      return [d('d') / 2, d('d') / 2, d('h'), 48]
    case 'cone':
      return [d('d') / 2, d('h'), 48]
    case 'box':
      return [d('p'), d('h'), d('l')]
    case 'sphere':
      return [d('d') / 2, 32, 24]
    case 'pyramid':
      // `coneGeometry` menerima radius, sedangkan dimensi limas yang diketahui
      // adalah panjang rusuk alasnya. Sisi bujur sangkar sama dengan
      // radius dikali akar dua, jadi radiusnya dibagi akar dua supaya ukuran yang
      // tampil benar.
      return [d('a') / Math.SQRT2, d('h'), 4]
    default:
      return [0.05, 0.12, 32]
  }
}
