import { useState, type CSSProperties } from 'react'
import { ACHIEVEMENTS } from '../data/content'

const TALLY = [
  { n: '7th', label: 'Hokage of the Leaf' },
  { n: '9', label: 'Tailed beasts who lent him chakra' },
  { n: '5', label: 'Great nations fighting at his side' },
]

export function Legacy() {
  const [open, setOpen] = useState(0)
  return (
    <section id="legacy" className="section left" data-station>
      <article className="panel" data-ui style={{ '--accent': '#ff4a36' } as CSSProperties}>
        <header className="panel-head">
          <span className="kanji" lang="ja">
            影
          </span>
          <div>
            <p className="eyebrow">04 — The Legacy</p>
            <h2>What He Achieved</h2>
          </div>
        </header>

        <ul className="tally">
          {TALLY.map((t) => (
            <li key={t.label}>
              <b>{t.n}</b>
              <span>{t.label}</span>
            </li>
          ))}
        </ul>

        <ol className="feats">
          {ACHIEVEMENTS.map((a, i) => (
            <li key={a.n} className={i === open ? 'open' : ''}>
              <button onClick={() => setOpen(i)} aria-expanded={i === open}>
                <span className="num">{a.n}</span>
                <span className="feat-title">{a.title}</span>
              </button>
              <div className="feat-body">
                <p>{a.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </article>
    </section>
  )
}
