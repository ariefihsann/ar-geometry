/**
 * Penampil 3D hasil pemindaian.
 *
 * Kontrol yang tersedia sesuai kebutuhan:
 *   - 1 jari atau drag           : memutar objek atas-bawah dan kiri-kanan
 *   - 2 jari atau scroll         : zoom in dan zoom out
 *   - 2 jari digeser / shift+drag : menggeser objek
 *
 * `OrbitControls` sudah memetakan sentuhan seperti itu secara bawaan
 * (satu jari untuk putar, dua jari untuk zoom sekaligus geser). Tombol di
 * layar menjalankan aksi yang sama untuk siswa yang memakai satu tangan atau
 * mouse tanpa gesture.
 *
 * Catatan penting soal tombol di layar: versi OrbitControls yang dipakai di sini
 * mengekspos `setAzimuthalAngle` dan `setPolarAngle`, tetapi `rotateLeft`,
 * `rotateUp`, `dollyIn`, dan `dollyOut` hanya menjadi fungsi privat di dalam
 * modul. Karena itu tombol tidak memanggil fungsi privat tersebut, melainkan
 * menulis ulang sudut pandang kamera lewat setter yang resmi, dan zoom lewat
 * mueve posisi kamera di sepanjang arah pandang.
 */
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useCallback, useRef } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { ScannedMesh } from './ScannedMesh.jsx'

function Scene({ shapeId, dims, autoRotate, controlsRef }) {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a3f52', 1.2]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 3]} intensity={1.5} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#9ec5ff" />

      <ScannedMesh shapeId={shapeId} dims={dims} />

      <gridHelper args={[4, 20, '#3d4a6b', '#232b40']} position={[0, -0.4, 0]} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan
        enableZoom
        minDistance={0.2}
        maxDistance={4}
        autoRotate={autoRotate}
        autoRotateSpeed={1.4}
        target={[0, 0, 0]}
      />
    </>
  )
}

/** Mengubah arah pandang kamera dalam derajat. */
const ROTATE_STEP = (Math.PI / 180) * 12

export function Viewer3D({ shapeId, dims, autoRotate = false }) {
  const controlsRef = useRef(null)

  const nudge = useCallback((action) => {
    const controls = controlsRef.current
    if (controls == null) return

    // OrbitControls menyimpan kamera yang dikendalinya di `object`, jadi tidak
    // perlu menyimpan kamera secara terpisah.
    const camera = controls.object

    switch (action) {
      case 'left':
        controls.setAzimuthalAngle(controls.getAzimuthalAngle() - ROTATE_STEP)
        break
      case 'right':
        controls.setAzimuthalAngle(controls.getAzimuthalAngle() + ROTATE_STEP)
        break
      case 'up':
        // Phi 0 berarti atas dan Phi PI berarti bawah, jadi menambah phi
        // menurunkan sudut pandang.
        controls.setPolarAngle(controls.getPolarAngle() - ROTATE_STEP)
        break
      case 'down':
        controls.setPolarAngle(controls.getPolarAngle() + ROTATE_STEP)
        break
      case 'zoomIn':
      case 'zoomOut': {
        const direction = camera.position.clone().sub(controls.target)
        const distance = direction.length()
        const next =
          action === 'zoomIn' ? distance * 0.85 : distance / 0.85
        const clamped = Math.min(4, Math.max(0.2, next))
        camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(clamped))
        camera.updateProjectionMatrix()
        controls.update()
        break
      }
      default:
        break
    }
  }, [])

  return (
    <div className="viewer" data-testid="viewer">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 55, near: 0.01, far: 60, position: [0.55, 0.35, 0.7] }}
        gl={{ alpha: true, antialias: true, toneMapping: ACESFilmicToneMapping }}
      >
        <Scene shapeId={shapeId} dims={dims} autoRotate={autoRotate} controlsRef={controlsRef} />
      </Canvas>

      <div className="viewer__controls">
        <button type="button" onClick={() => nudge('up')} aria-label="Putar ke atas">
          &uarr;
        </button>
        <button type="button" onClick={() => nudge('left')} aria-label="Putar ke kiri">
          &larr;
        </button>
        <button type="button" onClick={() => nudge('down')} aria-label="Putar ke bawah">
          &darr;
        </button>
        <button type="button" onClick={() => nudge('right')} aria-label="Putar ke kanan">
          &rarr;
        </button>
        <span className="viewer__divider" />
        <button type="button" onClick={() => nudge('zoomIn')} aria-label="Perbesar">
          +
        </button>
        <button type="button" onClick={() => nudge('zoomOut')} aria-label="Perkecil">
          &minus;
        </button>
      </div>

      <p className="viewer__hint">1 jari putar &middot; 2 jari zoom &middot; 2 jari geser</p>
    </div>
  )
}