import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ARSENAL, JUTSU } from '../data/content'
import { frame, useStore } from '../store'

/** Reads the live charge level straight from the render loop, without re-rendering React every frame. */
export function ChargeMeter() {
  const bar = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${frame.charge.toFixed(3)})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <span className="meter">
      <span ref={bar} />
    </span>
  )
}

export function JutsuSection() {
  const jutsu = useStore((s) => s.jutsu)
  const setJutsu = useStore((s) => s.setJutsu)
  const charging = useStore((s) => s.charging)
  const setCharging = useStore((s) => s.setCharging)
  const active = useStore((s) => s.view === 'journey' && s.section === 3)
  const setView = useStore((s) => s.setView)
  const j = JUTSU[jutsu]

  // Space bar charges too, as long as this section is on screen and focus is not in a control.
  useEffect(() => {
    if (!active) return
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if ((e.target as HTMLElement).closest?.('button, summary, a, input')) return
      // Every repeat of a held key has to be swallowed too, or the page scrolls away mid-charge.
      e.preventDefault()
      if (!e.repeat) setCharging(true)
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setCharging(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      setCharging(false)
    }
  }, [active, setCharging])

  const hold = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setCharging(true)
  }
  const release = () => setCharging(false)

  return (
    <section id="jutsu" className="section right" data-station>
      <article className="panel" data-ui style={{ '--accent': j.tint } as CSSProperties}>
        <header className="panel-head">
          <span className="kanji" lang="ja">
            術
          </span>
          <div>
            <p className="eyebrow">03 — The Jutsu</p>
            <h2>Chakra, Given Shape</h2>
          </div>
        </header>

        <div className="tabs" role="group" aria-label="Techniques">
          {JUTSU.map((x, i) => (
            <button
              key={x.id}
              aria-pressed={i === jutsu}
              className={i === jutsu ? 'active' : ''}
              style={{ '--accent': x.tint } as CSSProperties}
              onClick={() => setJutsu(i)}
            >
              <i />
              {x.name.replace('Wind Release: ', '')}
            </button>
          ))}
        </div>

        <div className="era" key={j.id}>
          <p className="era-when">
            <span className="jp" lang="ja">
              {j.kanji}
            </span>
            {j.romaji}
          </p>
          <h3>{j.name}</h3>
          <p className="chips">
            <span>{j.rank}</span>
            <span>{j.kind}</span>
          </p>
          <p>{j.text}</p>
          <ul className="beats">
            {j.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>

        <button
          className={`charge${charging ? ' on' : ''}`}
          onPointerDown={hold}
          onPointerUp={release}
          onPointerCancel={release}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && setCharging(true)}
          onKeyUp={release}
          onBlur={release}
        >
          <span className="charge-label">{charging ? 'Building chakra…' : 'Press and hold to charge'}</span>
          <ChargeMeter />
          <small>Hold the sphere, this button or the space bar — then let go.</small>
        </button>

        <button className="open-dojo" onClick={() => setView('dojo')}>
          <b>Open the Jutsu page</b>
          <span>Four forms, seven techniques, a free camera →</span>
        </button>

        <details className="arsenal">
          <summary>Also in his arsenal</summary>
          <ul>
            {ARSENAL.map((a) => (
              <li key={a.name}>
                <b>{a.name}</b>
                <span lang="ja">{a.kanji}</span>
                <p>{a.note}</p>
              </li>
            ))}
          </ul>
        </details>
      </article>
    </section>
  )
}
