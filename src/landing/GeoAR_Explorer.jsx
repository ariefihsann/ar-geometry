/**
 * GeoAR_Explorer
 *
 * Bagian AR immersive. Scene-nya memakai API `@react-three/xr` versi 6:
 *
 *   - `createXRStore()` membuat store sesi WebXR.
 *   - `<XR store={store}>` menghubungkan store itu ke scene three.js.
 *   - `store.enterAR()` memulai sesi `immersive-ar`.
 *
 * Catatan: `ARButton` dari pustaka yang sama sudah ditandai deprecated pada versi
 * ini dan disarankan memakai `store.enterAR()` secara langsung, sehingga tombol
 * di sini memanggil store tanpa perantara komponen.
 *
 * Penempatan objek memakai `useXRHitTest`: selama kamera berjalan, lingkaran
 * penanda mengikuti permukaan yang terdeteksi. Ketika satu ketukan diberikan,
 * lingkaran itu terkunci di tempatnya dan objek 3D bisa diputar dengan satu jari.
 */
import { createXRStore, IfInSessionMode, XR, useXR, useXRHitTest, XRDomOverlay } from '@react-three/xr'
import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, Matrix4, Vector3 } from 'three'
import { ScannedMesh } from '../viewer/ScannedMesh.jsx'
import { SHAPE_LIBRARY } from '../scan/shapeLibrary.js'

const HIT_POSITION = new Vector3()

function PlacedGeometry({ shapeId, dims, placed, onPlaced }) {
  const groupRef = useRef(null)
  const reticleRef = useRef(null)
  const locked = useRef(false)
  const matrixHelper = useMemo(() => new Matrix4(), [])

  useXRHitTest(
    (results, getWorldMatrix) => {
      if (locked.current || results.length === 0) return
      if (getWorldMatrix(matrixHelper, results[0])) {
        HIT_POSITION.setFromMatrixPosition(matrixHelper)
      }
    },
    'viewer',
    'plane',
  )

  useFrame((_, delta) => {
    const reticle = reticleRef.current
    const group = groupRef.current
    if (reticle != null && !locked.current) {
      reticle.visible = true
      reticle.position.lerp(HIT_POSITION, Math.min(1, delta * 12))
    }
    if (group != null && !locked.current && HIT_POSITION.lengthSq() > 0) {
      group.position.copy(HIT_POSITION)
    }
  })

  const lockInPlace = () => {
    if (locked.current) return
    locked.current = true
    if (reticleRef.current != null) reticleRef.current.visible = false
    onPlaced(true)
  }

  return (
    <group ref={groupRef}>
      <group visible={placed}>
        <ScannedMesh shapeId={shapeId} dims={dims} />
      </group>

      <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.06, 0.075, 32]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.9} side={2} />
      </mesh>

      <IfInSessionMode allow="immersive-ar">
        <XRDomOverlay>
          {!placed && (
            <button
              type="button"
              onClick={lockInPlace}
              className="w-full max-w-xs rounded-full bg-cyan-400/90 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg"
            >
              Letakkan di sini
            </button>
          )}
        </XRDomOverlay>
      </IfInSessionMode>
    </group>
  )
}

/**
 * Membaca status sesi dan meneruskannya ke luar Canvas.
 *
 * `useXR` hanya boleh dipanggil di dalam komponen `<XR>`, sedangkan panel tombol
 * berada di luar Canvas. Jadi pembacaan status dilakukan oleh komponen kecil
 * ini di dalam scene, lalu hasilnya dikirim lewat callback.
 */
function SessionReporter({ onModeChange }) {
  // `state.session` bersifat opsional dan hanya ada saat sesi berjalan, sehingga
  // dibaca lewat `state.mode` yang selalu terisi: `null` sebelum ada sesi.
  const sessionMode = useXR((state) => state.mode)

  useEffect(() => {
    onModeChange(sessionMode)
  }, [sessionMode, onModeChange])

  return null
}

function ARScene({ store, shapeId, dims, placed, onPlaced, onModeChange }) {
  return (
    <XR store={store}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} color="#a5f3fc" />

      <SessionReporter onModeChange={onModeChange} />
      <PlacedGeometry shapeId={shapeId} dims={dims} placed={placed} onPlaced={onPlaced} />
    </XR>
  )
}

export function GeoAR_Explorer() {
  const store = useMemo(() => createXRStore(), [])
  const [shapeId, setShapeId] = useState('box')
  const [placed, setPlaced] = useState(false)
  const [sessionMode, setSessionMode] = useState('none')

  const isAR = sessionMode === 'immersive-ar'
  const dims = SHAPE_LIBRARY[shapeId].dims

  // Dibungkus `useCallback` supaya `SessionReporter` tidak memicu efek berulang
  // setiap render dan akibatnya memanggil `setSessionMode` tanpa henti.
  const handleModeChange = useCallback((mode) => {
    setSessionMode(mode ?? 'none')
  }, [])

  const startAR = () => {
    setPlaced(false)
    store.enterAR().catch((error) => {
      console.error('Sesi AR gagal dimulai:', error)
    })
  }

  return (
    <section id="ar" className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold tracking-wide text-cyan-300 uppercase">
              Augmented Reality
            </p>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              Hubungkan Geometri dengan dunia nyata.
            </h2>
            <p className="mt-4 text-slate-400">
              Arahkan kamera ke meja atau lantai, lalu letakkan model bangun ruang yang hasil
              pemindaian tepat di ruanganmu. Setelah ditempatkan, model bisa diputar dan dilihat dari
              segala arah.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {Object.values(SHAPE_LIBRARY).map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() => setShapeId(shape.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none ${
                    shapeId === shape.id
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-white/5 text-slate-300 ring-1 ring-white/15 hover:bg-white/10'
                  }`}
                >
                  {shape.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={startAR}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-7 py-3.5 font-semibold text-slate-950 shadow-[0_0_28px_-6px_rgba(34,211,238,0.75)] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:outline-none"
            >
              Aktifkan AR Demo
            </button>

            <p className="mt-3 text-xs text-slate-500">
              {isAR
                ? 'Sesi AR sedang berjalan. Arahkan kamera ke permukaan datar.'
                : 'Memerlukan perangkat dengan dukungan WebXR, misalnya Android dengan Chrome atau headset AR.'}
            </p>
          </div>

          <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-2 sm:h-96 lg:h-[26rem]">
            {/* Tingginya tetap, bukan `auto`. Tanpa itu, ResizeObserver milik
                react-three/fiber mengukur induk yang tingginya sendiri, sehingga
                tinggi membesar sendiri terus-menerus. */}
            <Canvas
              dpr={[1, 2]}
              camera={{ fov: 55, near: 0.01, far: 60, position: [0.5, 0.35, 0.7] }}
              gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
            >
              <ARScene
                store={store}
                shapeId={shapeId}
                dims={dims}
                placed={placed}
                onPlaced={setPlaced}
                onModeChange={handleModeChange}
              />
            </Canvas>
          </div>
        </div>
      </div>
    </section>
  )
}