/**
 * Tahap 2: hasil 3D.
 *
 * Menampilkan nama bentuk yang terdeteksi, tingkat keyakinan, penampil 3D yang
 * bisa diputar, diperbesar, diperkecil, dan digeser, serta slider untuk
 * mengoreksi ukuran asli.
 */
import { useCallback, useMemo, useState } from 'react'
import { Viewer3D } from '../viewer/Viewer3D.jsx'
import { matchShape } from '../scan/matchShape.js'
import { SHAPE_LIBRARY, shapeById } from '../scan/shapeLibrary.js'
import { EXTRA_VIEWS, SCAN_STEPS } from '../scan/steps.js'

function confidenceLabel(value) {
  if (value >= 0.75) return { text: 'Yakin', tone: 'good' }
  if (value >= 0.45) return { text: 'Cukup yakin', tone: 'fair' }
  return { text: 'Kurang yakin', tone: 'weak' }
}

/**
 * Membandingkan siluet yang seharusnya identik.
 *
 * Tampak depan dan belakang menggambarkan bidang yang sama, begitu juga
 * tampak kanan dan kiri. Kalau dua sudut itu dibaca berbeda kategori, salah
 * satu fotonya kemungkinan diambil miring atau latar tidak bersih, dan
 * hasilnya layak ditandai kurang yakin supaya siswa mengulang.
 */
function checkConsistency(measurements) {
  const pairs = [
    ['front', 'back'],
    ['right', 'left'],
  ]

  const conflicts = []
  for (const [a, b] of pairs) {
    const first = measurements[a]
    const second = measurements[b]
    if (first?.ok !== true || second?.ok !== true) continue

    if (first.outline !== second.outline || Math.abs(first.extent - second.extent) > 0.12) {
      conflicts.push({
        pair: [a, b],
        a: { outline: first.outline, extent: first.extent },
        b: { outline: second.outline, extent: second.extent },
      })
    }
  }

  return conflicts
}

export function ResultStep({ shots, onRestart }) {
  const [dims, setDims] = useState(null)
  const [autoRotate, setAutoRotate] = useState(false)
  // Bentuk yang dipilih manual oleh siswa, menggantikan hasil tebakan otomatis.
  const [override, setOverride] = useState(null)

  const measurements = useMemo(() => {
    const collected = {}
    for (const [view, shot] of Object.entries(shots)) {
      if (shot?.result?.ok === true) collected[view] = shot.result
    }
    return collected
  }, [shots])

  const match = useMemo(() => matchShape(measurements), [measurements])
  const conflicts = useMemo(() => checkConsistency(measurements), [measurements])

  // Tanpa foto dari atas, tabung dan balok memang tidak bisa dibedakan, jadi
  // keyakinan otomatis ditahan rendah di `matchShape`. Foto tambahan dari
  // bawah juga membantu memastikan pilihan siswa benar.
  const extraViews = EXTRA_VIEWS.filter((view) => measurements[view] != null).length
  const consistencyPenalty = conflicts.length === 0 ? 0 : 0.15 * conflicts.length
  const autoConfidence = Math.max(0, (match.ok === true ? match.confidence : 0) - consistencyPenalty)

  const shapeId = override ?? (match.ok === true ? match.shapeId : null)
  const preset = shapeId != null ? shapeById(shapeId) : null
  const activeDims = dims ?? (preset != null ? match.dims ?? preset.dims : null)

  // Mengganti bentuk secara manual harus mengembalikan ukuran ke bawaan bentuk
  // itu, karena dimensi balok dan tabung tidak bisa dibandingkan.
  const chooseShape = useCallback((id) => {
    setOverride(id)
    setDims(null)
  }, [])

  if (match.ok !== true || preset == null) {
    return (
      <section className="result" data-testid="result">
        <h1>Belum berhasil</h1>
        <p className="result__error">{match.reason}</p>
        <button type="button" className="button button--primary" onClick={onRestart}>
          Scan Ulang
        </button>
      </section>
    )
  }

  const confidence = confidenceLabel(autoConfidence)

  return (
    <section className="result" data-testid="result">
      <header className="result__header">
        <p className="result__eyebrow">Bentuk terdeteksi</p>
        <h1 data-testid="shape-name">{preset.label}</h1>
        <p className={`confidence confidence--${confidence.tone}`} data-testid="confidence">
          Keyakinan {Math.round(autoConfidence * 100)}% &middot; {confidence.text}
        </p>
        <p className="result__hint">{preset.hint}</p>
        {override != null && (
          <p className="result__note" data-testid="override-note">
            Bentuk dipilih sendiri, bukan hasil tebakan otomatis.
          </p>
        )}
      </header>

      <Viewer3D shapeId={shapeId} dims={activeDims} autoRotate={autoRotate} />

      <div className="result__panel">
        <div className="result__block">
          <h2>Sudah salah? Pilih sendiri</h2>
          <p className="result__note">
            Kalau tebakan otomatis keliru, pilih bentuk yang sebenarnya. Model 3D langsung berubah.
          </p>
          <div className="chips" data-testid="shape-override">
            {Object.values(SHAPE_LIBRARY).map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === shapeId ? 'chip is-active' : 'chip'}
                aria-pressed={option.id === shapeId}
                data-testid={`pick-${option.id}`}
                onClick={() => chooseShape(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="result__panel">
        <div className="result__block">
          <h2>Ukuran asli</h2>
          <p className="result__note">
            Perkiraan dari foto. Jarak kamera tidak diketahui, jadi sesuaikan dengan ukuran sebenarnya.
          </p>

          {preset.dimSpec.map((spec) => (
            <label className="slider" key={spec.key}>
              <span className="slider__label">{spec.label}</span>
              <input
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={activeDims[spec.key] ?? spec.min}
                data-testid={`dim-${spec.key}`}
                onChange={(event) =>
                  setDims((previous) => ({ ...(previous ?? activeDims), [spec.key]: Number(event.target.value) }))
                }
              />
              <output>{Number(activeDims[spec.key] ?? 0).toFixed(1)} cm</output>
            </label>
          ))}
        </div>

        <div className="result__block">
          <h2>Foto yang dipakai</h2>
          <div className="thumbs">
            {SCAN_STEPS.map((step) => {
              const shot = shots[step.view]
              return (
                <figure key={step.view} className={shot != null ? 'thumb' : 'thumb is-empty'}>
                  {shot != null ? (
                    <>
                      <img src={shot.frame.toDataURL('image/jpeg', 0.6)} alt={step.title} />
                      <figcaption>{step.title}</figcaption>
                    </>
                  ) : (
                    <figcaption>Belum diambil</figcaption>
                  )}
                </figure>
              )
            })}
          </div>
        </div>

        <div className="result__block">
          <h2>Kandidat lain</h2>
          <ol className="ranking">
            {match.ranking.slice(1, 3).map((item) => (
              <li key={item.id}>
                {item.label}
                <span>{Math.max(0, Math.round(100 - item.score * 260))}%</span>
              </li>
            ))}
          </ol>
        </div>

        {(conflicts.length > 0 || extraViews > 0) && (
          <div className="result__block">
            <h2>Cek sudut tambahan</h2>
            {extraViews > 0 && (
              <p className="result__note">
                {extraViews} foto tambahan dipakai untuk mengecek hasil, bukan untuk menentukan bentuk.
              </p>
            )}
            {conflicts.map((conflict) => (
              <p className="result__warning" key={conflict.pair.join('-')} data-testid="consistency-warning">
                Tampak {conflict.pair[0]} dan {conflict.pair[1]} terbaca berbeda ({conflict.a.outline} vs{' '}
                {conflict.b.outline}). Coba ulang salah satu foto.
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="result__actions">
        <button
          type="button"
          className={autoRotate ? 'button is-active' : 'button'}
          onClick={() => setAutoRotate((value) => !value)}
        >
          {autoRotate ? 'Hentikan Putar' : 'Putar Otomatis'}
        </button>
        <button type="button" className="button button--primary" onClick={onRestart}>
          Scan Benda Lain
        </button>
      </div>
    </section>
  )
}
