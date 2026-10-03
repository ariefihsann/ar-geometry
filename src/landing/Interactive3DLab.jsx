/**
 * Interactive3DLab
 *
 * Laboratorium 3D: satu bangun ruang yang bisa diganti lewat dropdown "Objek",
 * diubah ukurannya, dan diputar.
 *
 * Ada dua cara memutar, dan keduanya memakai satu sumber kebenaran yang
 * berbeda secara sengaja:
 *
 *   1. Serab langsung di kanvas (jari di HP, tetikus di laptop) lewat
 *      `OrbitControls`, yang menggerakkan kamera mengelilingi benda.
 *   2. Slider Rotasi X/Y/Z, yang memutar bendanya sendiri di tempat.
 *
 * Kalau slider disembunyikan saja, siswa di HP akan kehilangan kendali begitu
 * halaman sedikit terscroll. Kalau serab disembunyikan, gambarnya terlihat
 * seperti gambar diam. Dua-duanya dipertahankan.
 *
 * Benda digambar sebagai wireframe cyan neon di atas grid, jadi siswa bisa
 * melihat seluruh rusuknya sekaligus dan tahu sisi mana yang menghadap mereka.
 *
 * Label sisi bukan `Html` dari drei. `Html` membuat root React sendiri di dalam
 * elemen yang juga dikelola React, lalu ikut menghapus node saatilasannya, dan
 * dua itu berebut menghapus node yang sama ketika objek berganti. Label di sini
 * karena itu digambar sebagai overlay biasa di atas kanvas, yang posisinya
 * disetel tiap frame dari `useFrame`. Teksnya tetap DOM asli, jadi tetap tajam
 * di layar HP dan bisa dibaca mesin.
 *
 * Katalog bentuknya ada di `labObjects.js`, terpisah dari `SHAPE_LIBRARY` milik
 * pemindai kamera, supaya pilihan di lab tidak ikut mengubah hasil pemindaian.
 */
import { Edges, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  DoubleSide,
  Quaternion,
  Vector3,
} from 'three'
import {
  LAB_OBJECT_LIST,
  boundingRadius,
  buildGeometry,
  faceLabels,
  objectById,
  scaledDims,
} from './labObjects.js'

const SLIDERS = [
  { key: 'size', label: 'Ukuran', min: 0.4, max: 2.4, step: 0.05, unit: 'x' },
  { key: 'rotX', label: 'Rotasi X', min: -180, max: 180, step: 1, unit: '°' },
  { key: 'rotY', label: 'Rotasi Y', min: -180, max: 180, step: 1, unit: '°' },
  { key: 'rotZ', label: 'Rotasi Z', min: -180, max: 180, step: 1, unit: '°' },
]

const DEG = Math.PI / 180
const WIRE_COLOR = '#00e5ff'
const FILL_OPACITY = 0.1

const INITIAL = { size: 1.4, rotX: -18, rotY: 34, rotZ: 0 }

// Vektor sementara untuk perhitungan tiap frame, supaya tidak terus membuat
// objek baru di dalam loop render.
const TMP_POSITION = new Vector3()
const TMP_PROJECTED = new Vector3()
const TMP_DIRECTION = new Vector3()
const TMP_NORMAL = new Vector3()
const TMP_ROTATION = new Quaternion()

/**
 * Menyesuaikan jarak kamera supaya benda selalu muat di dalam kanvas.
 *
 * Tanpa ini, mengganti objek atau menggeser slider ukuran bisa membuat benda
 * keluar dari bidang pandang, karena jarak kamera tetap seperti yang paling awal.
 * Arah pandang tidak diubah, jadi sudut yang sedang dilihat siswa tetap sama.
 */
function AutoFrame({ radius }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls)

  useEffect(() => {
    const halfFov = (camera.fov * DEG) / 2
    // `sin` dan bukan `tan`, karena yang perlu muat adalah bola pembungkus,
    // bukan bidang datar tegak lurus arah pandang.
    const distance = (radius / Math.sin(halfFov)) * 1.35
    const target = controls?.target ?? new Vector3()

    const direction = camera.position.clone().sub(target)
    if (direction.lengthSq() === 0) direction.set(0.6, 0.45, 0.8)
    direction.normalize()

    camera.position.copy(target).add(direction.multiplyScalar(distance))
    camera.updateProjectionMatrix()
    controls?.update()
  }, [radius, camera, controls])

  return null
}

/**
 * Benda sebagai wireframe neon.
 *
 * Isi domainnya dibuat sangat tipis dan `depthWrite` dimatikan, lalu garis
 * rusuknya digambar penuh dengan warna cyan. Rusuk yang jauh tetap terlihat
 * karena tidak ada permukaan yang menutupinya, dan garis yang dekat tidak
 * tenggelam di dalam isi.
 */
function WireObject({ object, dims }) {
  const geometry = useMemo(() => buildGeometry(object, dims), [object, dims])

  // Geometry dibuat sendiri di luar JSX, jadi harus dibuang manual saat diganti.
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={WIRE_COLOR}
        transparent
        opacity={FILL_OPACITY}
        side={DoubleSide}
        depthWrite={false}
        blending={AdditiveBlending}
      />
      <Edges threshold={1} color={WIRE_COLOR} />
    </mesh>
  )
}

/**
 * Menempelkan label sisi ke bidangnya.
 *
 * Dua pekerjaan tiap frame: memindahkan label ke posisi layar yang sesuai, lalu
 * menyembunyikan label sisi yang sedang menghadap away dari kamera. Kalau semua
 * label selalu tampil, enam tulisan akan bertumpuk di tengah benda dan tidak
 * terbaca lagi.
 *
 * `groupRef` menunjuk ke grup yang ikut berotasi bersama benda, jadi label
 * bergerak mengikuti slider rotasi tanpa perlu menyalin sudut rotasi ke sini.
 */
function LabelProjector({ labels, groupRef, nodes }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useFrame(() => {
    const group = groupRef.current
    if (group == null) return

    group.updateWorldMatrix(true, false)
    group.getWorldQuaternion(TMP_ROTATION)

    for (let index = 0; index < labels.length; index += 1) {
      const node = nodes.current[index]
      if (node == null) continue

      const { position, normal } = labels[index]

      TMP_POSITION.set(...position).applyMatrix4(group.matrixWorld)
      TMP_DIRECTION.copy(camera.position).sub(TMP_POSITION)
      const distance = TMP_DIRECTION.length()
      if (distance === 0) continue
      TMP_DIRECTION.divideScalar(distance)

      TMP_NORMAL.set(...normal).applyQuaternion(TMP_ROTATION).normalize()

      // `project` mengubah koordinat ruang dunia menjadi -1..1, lalu dikali
      // ukuran kanvas dalam piksel CSS. Overlay label sengaja diletakkan tepat
      // di atas kanvas tanpa padding, jadi tidak ada offset yang perlu dikoreksi.
      TMP_PROJECTED.copy(TMP_POSITION).project(camera)
      const x = (TMP_PROJECTED.x * 0.5 + 0.5) * size.width
      const y = (-TMP_PROJECTED.y * 0.5 + 0.5) * size.height

      node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`

      // Sisi yang sedang menghadap kamera dibuat terang. Sisi dibehind-nya tetap
      // ditampilkan, cuma diredupkan, karena setiap sisi memang harus bernama dan
      // siswa perlu tahu ada sisi di sana walau sedang tidak terlihat.
      node.style.opacity = TMP_NORMAL.dot(TMP_DIRECTION) > 0.08 ? '1' : '0.28'
    }
  })

  return null
}

function LabScene({ object, dims, labels, radius, controls, nodes }) {
  const groupRef = useRef(null)

  return (
    <>
      <group
        ref={groupRef}
        rotation={[controls.rotX * DEG, controls.rotY * DEG, controls.rotZ * DEG]}
      >
        <WireObject object={object} dims={dims} />
      </group>

      <gridHelper args={[2, 16, '#22d3ee', '#1e293b']} position={[0, -0.55, 0]} />

      {/* Serab di kanvas memutar kamera, bukan bendanya. */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        enablePan={false}
        enableZoom
        minDistance={0.06}
        maxDistance={3}
        target={[0, 0, 0]}
      />

      <AutoFrame radius={radius} />
      <LabelProjector labels={labels} groupRef={groupRef} nodes={nodes} />
    </>
  )
}

export function Interactive3DLab() {
  const [objectId, setObjectId] = useState('cube')
  const [controls, setControls] = useState(INITIAL)
  const controlsRef = useRef(null)
  const labelNodes = useRef([])

  const object = objectById(objectId)

  // Dimensi, label, dan jari-jari pembungkus dihitung satu kali di sini lalu
  // dipakai scene dan overlay sekaligus, supaya keduanya tidak mungkin
  // menampilkan bentuk yang berbeda.
  const dims = useMemo(() => scaledDims(object, controls.size), [object, controls.size])
  const labels = useMemo(() => faceLabels(object, dims), [object, dims])
  const radius = useMemo(() => boundingRadius(object, dims), [object, dims])

  const update = (key) => (event) => {
    setControls((previous) => ({ ...previous, [key]: Number(event.target.value) }))
  }

  const reset = () => {
    setControls(INITIAL)
    // Kamera ikut dikembalikan ke sudut awal, karena slider tidak mengatur
    // kamera. Kalau tidak, tombol "Atur ulang" akan terasa separuh bekerja.
    const orbit = controlsRef.current
    if (orbit != null) {
      orbit.reset()
      orbit.object.position.set(0.7, 0.5, 0.9)
    }
  }

  const angles = useMemo(
    () =>
      `${Math.round(controls.rotX)}° / ${Math.round(controls.rotY)}° / ${Math.round(controls.rotZ)}°`,
    [controls.rotX, controls.rotY, controls.rotZ],
  )

  return (
    <section id="lab" className="scroll-mt-24 border-y border-white/10 bg-slate-950/60">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-cyan-300 uppercase">Laboratorium</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">3D Geometry Lab interaktif</h2>
          <p className="mt-4 text-slate-400">
            Pilih objeknya, serab langsung untuk memutar, lalu putar juga lewat slider untuk
            menyetel sudut yang persis.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* Wrapper canvas wajib punya tinggi yang pasti, bukan `auto`. */}
          <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 sm:h-96 lg:col-span-3 lg:h-[26rem]">
            <Canvas
              dpr={[1, 2]}
              camera={{ fov: 50, near: 0.1, far: 50, position: [0.7, 0.5, 0.9] }}
              gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
              onCreated={(state) => {
                controlsRef.current = state.controls

                // Hook untuk pengujian geometri. `import.meta.env.DEV` bernilai
                // false saat build produksi, jadi blok ini hilang dari bundel.
                if (import.meta.env.DEV) {
                  window.__geoarLab = state
                }
              }}
            >
              <LabScene
                object={object}
                dims={dims}
                labels={labels}
                radius={radius}
                controls={controls}
                nodes={labelNodes}
              />
            </Canvas>

            {labels.map((label, index) => (
              <span
                key={label.name}
                ref={(node) => {
                  labelNodes.current[index] = node
                }}
                data-testid="lab-label"
                className="pointer-events-none absolute top-0 left-0 rounded bg-slate-950/70 px-1 py-0.5 text-[10px] font-semibold tracking-wider whitespace-nowrap text-cyan-200 uppercase select-none"
                style={{ opacity: 0, willChange: 'transform' }}
              >
                {label.name}
              </span>
            ))}

            <p
              data-testid="lab-angles"
              className="absolute right-4 bottom-2 z-10 text-xs text-slate-500"
            >
              Sudut model: {angles}
            </p>
            <p className="absolute bottom-2 left-4 z-10 text-xs text-slate-400">
              Serab untuk putar &middot; gulir atau cubit dua jari untuk zoom
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 lg:col-span-2">
            <h3 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
              Kontrol model
            </h3>

            <label className="mt-5 block">
              <span className="text-sm text-slate-300">Objek</span>
              <select
                data-testid="lab-object"
                value={objectId}
                onChange={(event) => setObjectId(event.target.value)}
                className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-slate-100 ring-1 ring-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
              >
                {LAB_OBJECT_LIST.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <p className="mt-2 text-xs text-slate-500">{object.hint}</p>

            <div className="mt-5 space-y-6">
              {SLIDERS.map((slider) => (
                <label key={slider.key} className="block">
                  <span className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-300">{slider.label}</span>
                    <span className="font-mono text-xs text-cyan-300">
                      {controls[slider.key]}
                      {slider.unit}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={controls[slider.key]}
                    onChange={update(slider.key)}
                    className="mt-2 w-full accent-cyan-400"
                  />
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={reset}
              className="mt-7 w-full rounded-xl bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 ring-1 ring-white/15 transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
            >
              Atur ulang
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}