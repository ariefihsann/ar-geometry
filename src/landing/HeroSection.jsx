/**
 * HeroSection
 *
 * Bagian pembuka halaman. Menampilkan judul, ajakan bertindak, dan baris statistik.
 */
import { HERO_STATS } from './content.js'

export function HeroSection({ onOpenLab, onOpenMateri, onStartScan }) {
  return (
    <header className="relative overflow-hidden border-b border-cyan-400/10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(34,211,238,0.16),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-5 pt-20 pb-16 text-center sm:px-8 md:pt-28 md:pb-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-xs font-medium tracking-wide text-cyan-200 uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgba(103,232,249,0.8)]" />
          GeoAR Lab &middot; Pemindaian bangun ruang
        </span>

        <h1 className="mt-6 max-w-3xl text-4xl leading-tight font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
          Temukan Geometri dengan cara yang lebih{' '}
          <span className="bg-gradient-to-r from-cyan-300 to-teal-300 bg-clip-text text-transparent">
            nyata.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
          GeoAR Lab membantu siswa memahami konsep geometri dengan memindai benda di sekitar
          memakai kamera, lalu mengubahnya menjadi model 3D yang bisa diputar, diukur, dan
          ditelusuri sudut per sudut.
        </p>

        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={onStartScan}
            className="rounded-xl bg-cyan-400 px-7 py-3.5 font-semibold text-slate-950 shadow-[0_0_28px_-6px_rgba(34,211,238,0.75)] transition hover:bg-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-none"
          >
            Mulai Pindai dengan Kamera
          </button>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onOpenLab}
              className="rounded-xl bg-white/5 px-7 py-3.5 font-semibold text-cyan-200 ring-1 ring-cyan-400/40 transition hover:bg-cyan-400/10 focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:outline-none"
            >
              Buka 3D Geometry Lab
            </button>
            <button
              type="button"
              onClick={onOpenMateri}
              className="rounded-xl px-7 py-3.5 font-semibold text-slate-200 ring-1 ring-white/20 transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:outline-none"
            >
              Pelajari Materi
            </button>
          </div>
        </div>

        <dl className="mt-14 grid w-full grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3">
          {HERO_STATS.map((stat) => (
            <div key={stat.label} className="bg-slate-950/80 px-6 py-7">
              <dt className="text-sm text-slate-400">{stat.label}</dt>
              <dd className="mt-1 text-3xl font-bold text-cyan-300">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  )
}