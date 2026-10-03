/**
 * UtilitiesContainer
 *
 * Tiga alat bantu di satu area: kalkulator geometri, soal kuis, dan dasbor
 * kemajuan belajar. Semuanya berjalan sepenuhnya di sisi klien, tanpa server.
 */
import { useState } from 'react'
import { PROGRESS, QUIZ } from './content.js'

const FORMULAS = {
  persegi: {
    label: 'Persegi',
    fields: [{ key: 's', label: 'Sisi', unit: 'cm' }],
    compute: (v) => ({ Luas: `${(v.s * v.s).toFixed(2)} cm²`, Keliling: `${(4 * v.s).toFixed(2)} cm` }),
  },
  persegiPanjang: {
    label: 'Persegi Panjang',
    fields: [
      { key: 'p', label: 'Panjang', unit: 'cm' },
      { key: 'l', label: 'Lebar', unit: 'cm' },
    ],
    compute: (v) => ({ Luas: `${(v.p * v.l).toFixed(2)} cm²`, Keliling: `${(2 * (v.p + v.l)).toFixed(2)} cm` }),
  },
  segitiga: {
    label: 'Segitiga',
    fields: [
      { key: 'a', label: 'Alas', unit: 'cm' },
      { key: 't', label: 'Tinggi', unit: 'cm' },
    ],
    compute: (v) => ({ Luas: `${((v.a * v.t) / 2).toFixed(2)} cm²` }),
  },
  balok: {
    label: 'Balok',
    fields: [
      { key: 'p', label: 'Panjang', unit: 'cm' },
      { key: 'l', label: 'Lebar', unit: 'cm' },
      { key: 't', label: 'Tinggi', unit: 'cm' },
    ],
    compute: (v) => ({
      Volume: `${(v.p * v.l * v.t).toFixed(2)} cm³`,
      Luas: `${(2 * (v.p * v.l + v.p * v.t + v.l * v.t)).toFixed(2)} cm²`,
    }),
  },
  tabung: {
    label: 'Tabung',
    fields: [
      { key: 'r', label: 'Jari-jari', unit: 'cm' },
      { key: 't', label: 'Tinggi', unit: 'cm' },
    ],
    compute: (v) => ({
      Volume: `${(Math.PI * v.r * v.r * v.t).toFixed(2)} cm³`,
      Luas: `${(2 * Math.PI * v.r * (v.r + v.t)).toFixed(2)} cm²`,
    }),
  },
}

function CalculatorCard() {
  const [shape, setShape] = useState('persegi')
  const [values, setValues] = useState({ s: 6, p: 8, l: 6, t: 6, a: 7, r: 5 })
  const [result, setResult] = useState(null)

  const formula = FORMULAS[shape]

  const switchShape = (key) => {
    setShape(key)
    // Hasil lama tidak berlaku untuk bentuk yang baru dipilih, jadi dikosongkan
    // supaya angka yang tampil tidak mengecoh.
    setResult(null)
  }

  const calculate = () => {
    const numeric = {}
    for (const field of formula.fields) numeric[field.key] = Number(values[field.key]) || 0
    setResult(formula.compute(numeric))
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-white">Kalkulator</h3>

      <select
        value={shape}
        onChange={(event) => switchShape(event.target.value)}
        className="mt-4 w-full rounded-lg bg-slate-950 px-3 py-2.5 text-sm text-slate-100 ring-1 ring-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
      >
        {Object.entries(FORMULAS).map(([key, item]) => (
          <option key={key} value={key}>
            {item.label}
          </option>
        ))}
      </select>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {formula.fields.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="text-slate-400">
              {field.label} ({field.unit})
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={values[field.key]}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
              }
              className="mt-1.5 w-full rounded-lg bg-slate-950 px-3 py-2.5 font-mono text-sm text-slate-100 ring-1 ring-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none"
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={calculate}
        className="mt-5 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:outline-none"
      >
        Hitung
      </button>

      {result != null && (
        <dl className="mt-5 space-y-2 rounded-xl bg-slate-950/70 p-4 text-sm">
          {Object.entries(result).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-slate-400">{label}</dt>
              <dd className="font-mono text-cyan-300">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function QuizCard() {
  const [picked, setPicked] = useState(null)
  const chosen = QUIZ.options.find((option) => option.id === picked)
  const isCorrect = chosen?.correct === true

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-white">Kuis</h3>
      <p className="mt-3 text-sm text-slate-300">{QUIZ.question}</p>

      <ul className="mt-4 space-y-2">
        {QUIZ.options.map((option) => {
          const isPicked = option.id === picked
          const showCorrect = picked != null && option.correct
          const showWrong = isPicked && !option.correct

          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => setPicked(option.id)}
                className={`w-full rounded-lg px-4 py-3 text-left text-sm ring-1 transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:outline-none ${
                  showCorrect
                    ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-400/50'
                    : showWrong
                      ? 'bg-rose-500/15 text-rose-200 ring-rose-500/50'
                      : 'bg-slate-950 text-slate-200 ring-white/10 hover:bg-white/5'
                }`}
              >
                {option.text}
              </button>
            </li>
          )
        })}
      </ul>

      {chosen != null && (
        <p className={`mt-4 text-sm ${isCorrect ? 'text-emerald-300' : 'text-amber-300'}`}>
          {isCorrect ? 'Benar. ' : 'Belum tepat. '}
          {QUIZ.explanation}
        </p>
      )}
    </div>
  )
}

function DashboardCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-white">Kemajuan belajar</h3>

      <ul className="mt-5 space-y-5">
        {PROGRESS.map((row) => {
          const percent = Math.round((row.value / row.max) * 100)
          return (
            <li key={row.label}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-slate-300">{row.label}</span>
                <span className="font-mono text-xs text-slate-400">
                  {row.value}/{row.max} {row.unit}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={row.label}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-400"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{percent}%</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function UtilitiesContainer() {
  return (
    <section id="alat" className="scroll-mt-24 border-t border-white/10 bg-slate-950/60">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-cyan-300 uppercase">Alat bantu</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Hitung, uji, dan pantau kemajuan
          </h2>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          <CalculatorCard />
          <QuizCard />
          <DashboardCard />
        </div>
      </div>
    </section>
  )
}