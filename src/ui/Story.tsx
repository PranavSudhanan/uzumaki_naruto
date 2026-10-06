import { useEffect, type CSSProperties } from 'react'
import { ERAS } from '../data/content'
import { useStore } from '../store'

export function Story() {
  const era = useStore((s) => s.era)
  const setEra = useStore((s) => s.setEra)
  const active = useStore((s) => s.view === 'journey' && s.section === 2)
  const e = ERAS[era]
  const step = (d: number) => setEra(Math.min(ERAS.length - 1, Math.max(0, era + d)))

  // Arrow keys page through the chapters while this section is on screen.
  useEffect(() => {
    if (!active) return
    const onKey = (ev: KeyboardEvent) => {
      // Alt/Cmd + arrow is the browser's own back and forward.
      if (ev.altKey || ev.metaKey || ev.ctrlKey) return
      if (ev.key === 'ArrowRight') step(1)
      if (ev.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <section id="story" className="section left" data-station>
      <article className="panel" data-ui style={{ '--accent': e.color } as CSSProperties}>
        <header className="panel-head">
          <span className="kanji" lang="ja">
            道
          </span>
          <div>
            <p className="eyebrow">02 — The Story</p>
            <h2>The Road to Hokage</h2>
          </div>
        </header>

        <div className="era" key={era}>
          <p className="era-when">
            <span className="era-kanji" lang="ja">
              {e.kanji}
            </span>
            Chapter {era + 1} of {ERAS.length} · {e.when}
          </p>
          <h3>{e.title}</h3>
          <p>{e.text}</p>
          <ul className="beats">
            {e.beats.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>

        <div className="timeline" role="group" aria-label="Chapters">
          {ERAS.map((x, i) => (
            <button
              key={x.title}
              aria-pressed={i === era}
              aria-label={x.title}
              title={x.title}
              className={i === era ? 'active' : i < era ? 'past' : ''}
              onClick={() => setEra(i)}
            >
              <span lang="ja">{x.kanji}</span>
            </button>
          ))}
        </div>

        <div className="pager">
          <button onClick={() => step(-1)} disabled={era === 0}>
            ← Previous
          </button>
          <button className="primary" onClick={() => step(1)} disabled={era === ERAS.length - 1}>
            Next chapter →
          </button>
        </div>
      </article>
    </section>
  )
}
