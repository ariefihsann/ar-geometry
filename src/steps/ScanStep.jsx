/**
 * Tahap 1: pemindaian kamera terbimbing.
 *
 * Mengenakkan kamera ke layar, memandu siswa mengambil foto dari beberapa sudut,
 * lalu mengukur siluet setiap foto.
 *
 * Sambil kamera menyala, sudut benda terdeteksi langsung dan digambar warna
 * biru di atas video. Setiap kali benda diputar sedikit, sudut yang baru
 * terbaca ulang, jadi siswa bisa memastikan benda sudah benar-benar berada
 * dalam bingkai sebelum menekan tombol ambil foto.
 */
import { useCallback, useRef, useState } from 'react'
import { useCamera } from '../camera/useCamera.js'
import { measureSilhouette } from '../scan/silhouette.js'
import { useLiveCorners } from '../scan/useLiveCorners.js'
import { SCAN_STEPS } from '../scan/steps.js'

const OUTLINE_LABELS = {
  rect: 'persegi',
  triangle: 'segitiga',
  round: 'lingkaran',
  other: 'lainnya',
  unknown: 'belum terbaca',
}

export function ScanStep({ onComplete, onCancel }) {
  const { videoRef, status, error, start, capture, switchCamera } = useCamera()
  const [index, setIndex] = useState(0)
  const [shots, setShots] = useState({})
  const [measurement, setMeasurement] = useState(null)
  const [busy, setBusy] = useState(false)

  const overlayRef = useRef(null)
  const step = SCAN_STEPS[index]
  const isLive = status === 'live'
  const reading = useLiveCorners(videoRef, isLive, overlayRef)

  const openCamera = useCallback(() => {
    start('environment')
  }, [start])

  const takeShot = useCallback(async () => {
    setBusy(true)
    setMeasurement(null)

    // Beri satu frame agar buffer video benar-benar terisi.
    await new Promise((resolve) => requestAnimationFrame(resolve))

    const frame = await capture()
    if (frame == null) {
      setBusy(false)
      return
    }

    const result = measureSilhouette(frame)

    if (result.ok === false) {
      setMeasurement({ ok: false, reason: result.reason })
      setBusy(false)
      return
    }

    setMeasurement(result)
    setShots((previous) => ({ ...previous, [step.view]: { frame, result } }))
    setBusy(false)
  }, [capture, step.view])

  const advance = useCallback(() => {
    if (index + 1 >= SCAN_STEPS.length) {
      onComplete(shots)
      return
    }
    setIndex((value) => value + 1)
    setMeasurement(null)
  }, [index, onComplete, shots])

  const retake = useCallback(() => {
    setMeasurement(null)
    setShots((previous) => {
      const next = { ...previous }
      delete next[step.view]
      return next
    })
  }, [step.view])

  const isLast = index + 1 >= SCAN_STEPS.length
  const captured = shots[step.view] != null

  return (
    <section className="scan" data-testid="scan-step">
      <header className="scan__header">
        <h1>Scan Benda 3D</h1>
        <p>
          Langkah {index + 1} dari {SCAN_STEPS.length}
        </p>
      </header>

      <div className="scan__stage">
        <video ref={videoRef} className="scan__video" playsInline muted autoPlay />
        <canvas ref={overlayRef} className="scan__overlay" width={480} height={640} />

        {isLive && (
          <div className="scan__guide" aria-hidden="true">
            <span className="scan__frame" />
          </div>
        )}

        {!isLive && (
          <div className="scan__placeholder">
            {status === 'requesting' ? (
              <p>Meminta izin kamera&hellip;</p>
            ) : (
              <>
                <p className="scan__placeholder-title">Kamera belum terbuka</p>
                <p className="scan__placeholder-body">
                  Izinkan akses kamera, lalu pegang benda di depan layar. Tips: gunakan dinding polos sebagai latar.
                </p>
                <button type="button" className="button button--primary" onClick={openCamera} data-testid="open-camera">
                  Open Kamera
                </button>
              </>
            )}
          </div>
        )}

        {error != null && <p className="scan__error">{error}</p>}
      </div>

      {isLive && (
        <div className="scan__instruction">
          <h2>{step.title}</h2>
          <p>{step.instruction}</p>
          <p className="scan__tip">{step.tip}</p>
        </div>
      )}

      {isLive && (
        <div className="scan__reading" data-testid="live-reading" data-outline={reading?.ok === true ? reading.outline : 'none'}>
          <span className="scan__reading-dot" />
          {reading == null ? (
            <span>Mencari benda&hellip;</span>
          ) : reading.ok === false ? (
            <span>{reading.reason}</span>
          ) : (
            <span>
              Terdeteksi <strong>{reading.cornerCount} sudut</strong> ({OUTLINE_LABELS[reading.outline] ?? reading.outline})
            </span>
          )}
        </div>
      )}

      {measurement?.ok === false && <p className="scan__error">{measurement.reason}</p>}

      {measurement?.ok === true && (
        <div className="scan__result">
          <img src={measurement.preview} alt="Siluet dan sudut yang terdeteksi" className="scan__preview" />
          <dl className="scan__metrics">
            <div>
              <dt>Sudut</dt>
              <dd>
                {measurement.cornerCount} ({OUTLINE_LABELS[measurement.outline] ?? measurement.outline})
              </dd>
            </div>
            <div>
              <dt>Rasio isi</dt>
              <dd>{measurement.extent.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Lebar</dt>
              <dd>{(measurement.relativeWidth * 100).toFixed(0)}%</dd>
            </div>
            <div>
              <dt>Tinggi</dt>
              <dd>{(measurement.relativeHeight * 100).toFixed(0)}%</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="scan__actions">
        {isLive && !captured && (
          <button type="button" className="button button--primary" onClick={takeShot} disabled={busy} data-testid="take-photo">
            {busy ? 'Mengukur&hellip;' : 'Ambil Foto'}
          </button>
        )}

        {captured && (
          <>
            <button type="button" className="button" onClick={retake}>
              Ulangi Foto
            </button>
            <button type="button" className="button button--primary" onClick={advance} data-testid="advance">
              {isLast ? 'Buat 3D' : 'Lanjut'}
            </button>
          </>
        )}

        {isLive && (
          <button type="button" className="button button--ghost" onClick={switchCamera}>
            Ganti Kamera
          </button>
        )}

        {onCancel != null && (
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Batal
          </button>
        )}
      </div>
    </section>
  )
}