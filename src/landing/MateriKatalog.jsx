/**
 * MateriKatalog
 *
 * Kisi kartu materi. Tiap kartu bisa memanggil `onOpen` supaya halaman utama
 * bisa menampilkan ringkasan tanpa memuat berkas terpisah.
 */
import { MATERI } from './content.js'

export function MateriKatalog({ onOpen }) {
  return (
    <section id="materi" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 md:py-28">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold tracking-wide text-cyan-300 uppercase">Katalog</p>
        <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Mulai dari konsep dasar</h2>
        <p className="mt-4 text-slate-400">
          Enam topik utama yang disusun berurutan, dari bangun datar sampai geometri analitik.
          Setiap topik punya ringkasan singkat dan latihan Pendek.
        </p>
      </div>

      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {MATERI.map((item) => (
          <li key={item.id}>
            <article className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition duration-200 hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-[0_18px_40px_-24px_rgba(34,211,238,0.7)]">
              <div
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${item.accent} opacity-0 transition-opacity duration-200 group-hover:opacity-100`}
              />

              <span
                aria-hidden="true"
                className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-slate-950 text-xl text-cyan-300"
              >
                {item.icon}
              </span>

              <h3 className="relative mt-4 text-lg font-semibold text-white">{item.title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-slate-400">{item.summary}</p>

              <div className="relative mt-5 flex items-center justify-between">
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-400">
                  {item.topics} subtopik
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
                >
                  Lihat ringkasan
                  <span aria-hidden="true" className="ml-1 inline-block transition group-hover:translate-x-0.5">
                    &rarr;
                  </span>
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}