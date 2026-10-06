import { Component, useEffect, useRef, type ReactNode } from 'react'
import { Experience } from './three/Experience'
import { frame, useStore } from './store'
import { audio } from './audio'
import { Nav } from './ui/Nav'
import { Loader } from './ui/Loader'
import { Hero } from './ui/Hero'
import { Profile } from './ui/Profile'
import { Story } from './ui/Story'
import { JutsuSection } from './ui/JutsuSection'
import { Legacy } from './ui/Legacy'
import { Closing } from './ui/Closing'
import { DojoUI } from './ui/DojoUI'

const smooth = (t: number) => t * t * (3 - 2 * t)
const DOJO_HASH = '#/jutsu'

/**
 * Maps scroll position to a continuous "station" index for the camera.
 * The camera holds each pose while its section fills the screen and travels
 * only while the boundary between two sections crosses the middle of the viewport.
 */
function useScrollStations() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-station]'))
    let raf = 0
    const update = () => {
      raf = 0
      // The story is hidden while the Jutsu page is open; its layout cannot be measured then.
      if (useStore.getState().view !== 'journey') return
      const vh = window.innerHeight
      const mid = window.scrollY + vh / 2
      const band = vh * 0.85
      let f = 0
      for (let k = 1; k < sections.length; k++) {
        const boundary = sections[k].offsetTop
        f += smooth(Math.min(1, Math.max(0, (mid - (boundary - band / 2)) / band)))
      }
      frame.f = f
      const nearest = Math.round(f)
      const s = useStore.getState()
      if (nearest !== s.section) s.setSection(nearest)
    }
    const request = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const pointer = (e: PointerEvent) => {
      frame.px = (e.clientX / window.innerWidth) * 2 - 1
      frame.py = (e.clientY / window.innerHeight) * 2 - 1
    }
    update()
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    window.addEventListener('pointermove', pointer, { passive: true })
    return () => {
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
      window.removeEventListener('pointermove', pointer)
      cancelAnimationFrame(raf)
    }
  }, [])
}

/** Without WebGL the canvas throws as it mounts; catch that so the rest of the page (and its message) survives. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('The 3D scene could not be started', error)
    useStore.getState().setBroken()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Keeps the address bar, the back button and the page chrome in step with which page is showing. */
function usePages() {
  const view = useStore((s) => s.view)
  const first = useRef(true)

  useEffect(() => {
    const dojo = view === 'dojo'
    document.body.classList.toggle('dojo-open', dojo)
    const want = dojo ? DOJO_HASH : ''
    // Only this page's own hash is managed here; an ordinary #section link is left alone.
    if (window.location.hash !== want && (dojo || window.location.hash === DOJO_HASH)) {
      window.history.pushState(null, '', want || window.location.pathname + window.location.search)
    }
    // Coming back to the story, pick it up where it was left. (On first load the browser restores scroll itself.)
    if (!dojo && !first.current) requestAnimationFrame(() => window.scrollTo({ top: frame.scrollY, behavior: 'instant' }))
    first.current = false
  }, [view])

  useEffect(() => {
    const sync = () => useStore.getState().setView(window.location.hash === DOJO_HASH ? 'dojo' : 'journey')
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    // Browsers only allow sound after a gesture; the first one of any kind unlocks it.
    const unlock = () => audio.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    // A hold never outlives the window's attention: the key-up or pointer-up would be lost with it.
    const drop = () => useStore.getState().setCharging(false)
    const hide = () => {
      drop()
      audio.sleep(document.hidden)
    }
    window.addEventListener('blur', drop)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('blur', drop)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [])

  return view
}

export default function App() {
  const root = useRef<HTMLDivElement>(null!)
  useScrollStations()
  const view = usePages()

  return (
    <div ref={root} className="app">
      <div className="stage" aria-hidden="true">
        <SceneBoundary>
          <Experience eventSource={root} />
        </SceneBoundary>
      </div>
      <div className="grade" aria-hidden="true" />
      <Nav />
      <main hidden={view === 'dojo'}>
        <Hero />
        <Profile />
        <Story />
        <JutsuSection />
        <Legacy />
        <Closing />
      </main>
      {view === 'dojo' ? <DojoUI /> : null}
      {/* A quick dip to black covers the cut between the two pages. */}
      <div key={view} className="veil" aria-hidden="true" />
      <Loader />
    </div>
  )
}
