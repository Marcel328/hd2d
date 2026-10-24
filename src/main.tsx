import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/500.css'
import '@fontsource/cinzel/600.css'
import './styles.css'

const App = lazy(() => import('./App'))
const SpriteDebug = lazy(() => import('./ui/SpriteDebug'))

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

function Fallback() {
  return (
    <div className="fallback">
      <div>
        <h1>Elmbrook</h1>
        <p>This demo needs WebGL 2, which this browser or device doesn&apos;t provide.</p>
        <p>Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
      </div>
    </div>
  )
}

const debugSprites = new URLSearchParams(location.search).has('sprites')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{!hasWebGL2() ? <Fallback /> : debugSprites ? <SpriteDebug /> : <App />}</Suspense>
  </StrictMode>,
)
