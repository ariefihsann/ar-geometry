import { useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { LandingPage } from './landing/LandingPage.jsx'
import { ResultStep } from './steps/ResultStep.jsx'
import { ScanStep } from './steps/ScanStep.jsx'

/**
 * GeoAR Lab punya dua layar yang berbagi satu alur:
 *
 *   'landing' -> halaman depan yang memandu siswa ke pemindai
 *   'scan'    -> pemindai kamera enam sudut pandang
 *   'result'  -> model 3D hasil pemindaian
 *
 * Halaman depan dan pemindai berbagi pemanggil `onStartScan`, jadi pemindaian
 * tetap satu alur utuh dan tidak terduplikasi di dalam landing page.
 */
export default function App() {
  const [stage, setStage] = useState('landing')
  const [shots, setShots] = useState({})

  if (stage === 'landing') {
    return (
      <LandingPage
        onStartScan={() => {
          setShots({})
          setStage('scan')
        }}
      />
    )
  }

  const backToLanding = () => {
    setShots({})
    setStage('landing')
  }

  if (stage === 'result') {
    return (
      <div className="app">
        <ErrorBoundary>
          <ResultStep shots={shots} onRestart={() => { setShots({}); setStage('scan') }} />
        </ErrorBoundary>
      </div>
    )
  }

  return (
    <div className="app">
      <ErrorBoundary>
        <ScanStep
          onComplete={(collected) => {
            setShots(collected)
            setStage('result')
          }}
          onCancel={backToLanding}
        />
      </ErrorBoundary>
    </div>
  )
}