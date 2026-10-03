/**
 * Koneksi ke kamera perangkat.
 *
 * getUserMedia hanya jalan di konteks aman (https:// atau localhost), jadi
 * aplikasi ini harus dijalankan lewat HTTPS. Ada dua mode:
 *   - 'environment' : kamera belakang, dipakai untuk memindai benda nyata
 *   - 'user'        : kamera depan, untuk memeriksa hasil jika perlu
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function useCamera() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setStatus('idle')
  }, [])

  const start = useCallback(async (facingMode = 'environment') => {
    stop()
    setError(null)
    setStatus('requesting')

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('Browser ini tidak mendukung akses kamera.')
      return null
    }

    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      streamRef.current = next
      setStream(next)
      setStatus('live')
      return next
    } catch (cause) {
      setStatus('error')
      if (cause?.name === 'NotAllowedError') {
        setError('Izin kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu coba lagi.')
      } else if (cause?.name === 'NotFoundError') {
        setError('Tidak ada kamera yang ditemukan di perangkat ini.')
      } else if (cause?.name === 'NotReadableError') {
        setError('Kamera sedang dipakai aplikasi lain.')
      } else if (window.isSecureContext === false) {
        setError('Kamera hanya bisa diakses lewat HTTPS. Jalankan aplikasi dengan npm run dev.')
      } else {
        setError('Kamera tidak bisa dibuka. Coba lagi.')
      }
      return null
    }
  }, [stop])

  // Pasang stream ke elemen video setelah state berubah.
  useEffect(() => {
    if (videoRef.current != null && stream != null) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Pastikan kamera dimatikan saat komponen dilepas.
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])

  const capture = useCallback(async () => {
    const video = videoRef.current
    if (video == null || video.videoWidth === 0) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    return canvas
  }, [])

  const switchCamera = useCallback(async () => {
    const current = streamRef.current?.getVideoTracks()?.[0]?.getSettings?.().facingMode
    await start(current === 'environment' ? 'user' : 'environment')
  }, [start])

  return { videoRef, stream, status, error, start, stop, capture, switchCamera }
}
