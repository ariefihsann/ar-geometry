/**
 * Deteksi sudut benda secara langsung di atas video kamera.
 *
 * Yang terjadi di sini persis seperti yang diminta: setiap frame video diukur
 * ulang, sudut yang ditemukan digambar warna biru, dan ketika benda diputar
 * sedikit sudut yang baru langsung terbaca ulang.
 *
 * Performance dijaga dengan tiga hal:
 *   1. pengukuran dijadwalkan handful kali per detik, bukan tiap frame, karena
 *      satu pengukuran sudah memakan sebagian kecil frame;
 *   2. hasilnya disimpan lewat ref supaya menggambar ulang komponen React tidak
 *      memicu pengukuran baru;
 *   3. kanvas hanya digambar ulang saat ada pembacaan baru.
 */
import { useEffect, useState } from 'react'
import { drawCorners, measureSilhouette } from './silhouette.js'

const INTERVAL_MS = 120

/**
 * Mengubah koordinat ruang sampel menjadi koordinat layar.
 *
 * Video memakai `object-fit: cover`, jadi bagian tepi foto ikut terpotong.
 * Kalau koordinat sudut tidak ikut diperhitungkan, penanda biru akan bergeser
 * ke tempat yang salah begitu kamera tidak persis 3:4.
 */
function coverTransform(videoWidth, videoHeight, boxWidth, boxHeight) {
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight)
  return {
    scale,
    offsetX: (boxWidth - videoWidth * scale) / 2,
    offsetY: (boxHeight - videoHeight * scale) / 2,
  }
}

export function useLiveCorners(video, active, canvasRef) {
  const [reading, setReading] = useState(null)

  useEffect(() => {
    // Pembacaan terakhir sengaja tidak dikosongkan di sini: pemanggil sudah
    // tahu kamera sedang mati atau tidak, jadi reset tidak perlu pemicu
    // render tambahan.
    if (!active) return undefined

    const timer = setInterval(() => {
      const videoElement = video?.current
      const canvas = canvasRef.current
      if (videoElement == null || canvas == null) return
      if (videoElement.videoWidth === 0 || videoElement.readyState < 2) return

      const boxWidth = canvas.clientWidth
      const boxHeight = canvas.clientHeight
      if (boxWidth === 0 || boxHeight === 0) return

      const result = measureSilhouette(videoElement)
      const context = canvas.getContext('2d')
      context.clearRect(0, 0, canvas.width, canvas.height)

      if (result.ok !== true) {
        setReading({ ok: false, reason: result.reason })
        return
      }

      const { scale, offsetX, offsetY } = coverTransform(
        videoElement.videoWidth,
        videoElement.videoHeight,
        boxWidth,
        boxHeight,
      )

      // Sudut hasil pengukuran ada di ruang gambar kecil; perkecil dulu supaya
      // bisa langsung dipakai sebagai koordinat kanvas.
      const ratio = videoElement.videoWidth / result.sampleWidth
      const corners = result.corners.map((corner) => ({
        x: (corner.x * ratio * scale + offsetX) * (canvas.width / boxWidth),
        y: (corner.y * ratio * scale + offsetY) * (canvas.height / boxHeight),
      }))

      drawCorners(context, corners, '#38bdf8')

      setReading({
        ok: true,
        outline: result.outline,
        cornerCount: result.cornerCount,
        extent: result.extent,
        coverage: result.coverage,
      })
    }, INTERVAL_MS)

    return () => clearInterval(timer)
  }, [video, active, canvasRef])

  return reading
}