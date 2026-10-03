/**
 * GeoAR Lab
 *
 * Pembuka: hero, katalog materi, lab 3D interaktif, bagian AR, dan alat bantu.
 * Tombol "Mulai Pindai" menyerahkan alih ke pemindai kamera yang sudah ada,
 * sehingga pemindaian tetap satu alur utuh dari halaman depan.
 *
 * Bagian AR dimuat terpisah memakai `lazy`. Pustaka `@react-three/xr` menarik
 * beberapa megabita data lingkungan AR ke dalam bundel, sementara section itu
 * baru dibutuhkan setelah siswa menekan tombol AR. Dimuat sejak awal, bundel
 * awal jadi besar tanpa manfaat bagi pengunjung yang hanya membaca materi.
 */
import { lazy, Suspense, useState } from 'react'
import { HeroSection } from './HeroSection.jsx'
import { Interactive3DLab } from './Interactive3DLab.jsx'
import { MateriKatalog } from './MateriKatalog.jsx'
import { UtilitiesContainer } from './UtilitiesContainer.jsx'

const GeoAR_Explorer = lazy(() =>
  import('./GeoAR_Explorer.jsx').then((module) => ({ default: module.GeoAR_Explorer })),
)

function SiteHeader() {
  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <span className="text-lg font-bold tracking-tight text-white">
          Geo<span className="text-cyan-300">AR</span> Lab
        </span>

        <div className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          <a href="#materi" className="transition hover:text-cyan-300">
            Materi
          </a>
          <a href="#lab" className="transition hover:text-cyan-300">
            3D Lab
          </a>
          <a href="#ar" className="transition hover:text-cyan-300">
            AR
          </a>
          <a href="#alat" className="transition hover:text-cyan-300">
            Alat Bantu
          </a>
        </div>

        <a
          href="#lab"
          className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          Coba Lab
        </a>
      </div>
    </nav>
  )
}

function RingkasanDialog({ materi, onClose }) {
  if (materi == null) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ringkasan-judul"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="ringkasan-judul" className="text-xl font-semibold text-white">
            {materi.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup ringkasan"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            &times;
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">{materi.summary}</p>
        <p className="mt-4 rounded-lg bg-slate-950 p-4 text-sm text-slate-400">
          Materi ini meliputi {materi.topics} subtopik. Buka bagian 3D Lab untuk memverifikasi
          bentuknya langsung pada model.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          Tutup
        </button>
      </div>
    </div>
  )
}

function ARSection({ requested, onRequest }) {
  if (!requested) {
    return (
      <section id="ar" className="scroll-mt-24 border-y border-white/10 bg-slate-950/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-5 py-20 text-center sm:px-8">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Hubungkan Geometri dengan dunia nyata.
          </h2>
          <p className="mt-4 max-w-xl text-slate-400">
            Pasang model bangun ruang hasil pemindaian tepat di meja atau lantai ruanganmu
            memakai kamera belakang.
          </p>
          <button
            type="button"
            onClick={onRequest}
            className="mt-8 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-7 py-3.5 font-semibold text-slate-950 shadow-[0_0_28px_-6px_rgba(34,211,238,0.75)] transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:outline-none"
          >
            Aktifkan AR Demo
          </button>
          <p className="mt-3 text-xs text-slate-500">
            Memerlukan perangkat dengan dukungan WebXR, misalnya Android dengan Chrome.
          </p>
        </div>
      </section>
    )
  }

  return (
    <Suspense
      fallback={
        <section className="border-y border-white/10 bg-slate-950/60">
          <div className="mx-auto max-w-6xl px-5 py-20 text-center text-slate-400 sm:px-8">
            Menyiapkan modul AR...
          </div>
        </section>
      }
    >
      <GeoAR_Explorer />
    </Suspense>
  )
}

export function LandingPage({ onStartScan }) {
  const [materi, setMateri] = useState(null)
  const [arRequested, setArRequested] = useState(false)

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SiteHeader />
      <main>
        <HeroSection
          onStartScan={onStartScan}
          onOpenLab={() => scrollTo('lab')}
          onOpenMateri={() => scrollTo('materi')}
        />
        <MateriKatalog onOpen={setMateri} />
        <Interactive3DLab />
        <ARSection requested={arRequested} onRequest={() => setArRequested(true)} />
        <UtilitiesContainer />
      </main>

      <footer className="border-t border-white/10 px-5 py-10 text-center text-sm text-slate-500">
        GeoAR Lab &middot; Pemindaian bangun ruang untuk pembelajaran geometri.
      </footer>

      <RingkasanDialog materi={materi} onClose={() => setMateri(null)} />
    </div>
  )
}