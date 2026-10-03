/**
 * Penangkap error agar aplikasi tidak layar putih.
 *
 * Kegagalan paling mungkin terjadi di dua tempat: kamera ditolak atau tidak
 * ada, dan WebGL tidak tersedia di perangkat tertentu. Keduanya membuat React
 * melempar error saat render, dan tanpa batas error seluruh halaman jadi kosong
 * tanpa pesan yang bisa dibaca siswa.
 */
import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { message: null }
  }

  static getDerivedStateFromError(error) {
    return { message: error?.message ?? 'Terjadi kesalahan yang tidak diketahui.' }
  }

  render() {
    if (this.state.message == null) return this.props.children

    return (
      <div className="app">
        <section className="result" data-testid="error-boundary">
          <header className="result__header">
            <p className="result__eyebrow">Aplikasi berhenti</p>
            <h1>Tidak bisa melanjutkan</h1>
            <p className="result__error">{this.state.message}</p>
            <p className="result__hint">
              Coba muat ulang halaman. Kalau masalahnya tetap, pastikan kamera diizinkan dan perangkat punya
              WebGL.
            </p>
          </header>

          <div className="result__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                this.setState({ message: null })
                globalThis.location?.reload()
              }}
            >
              Muat Ulang
            </button>
          </div>
        </section>
      </div>
    )
  }
}