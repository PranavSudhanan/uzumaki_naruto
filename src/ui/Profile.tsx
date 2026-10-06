import { PROFILE, STATS } from '../data/content'

function Radar() {
  const n = STATS.length
  const R = 100
  const pt = (i: number, v: number): [number, number] => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return [Math.cos(a) * R * (v / 5), Math.sin(a) * R * (v / 5)]
  }
  const poly = (v: (i: number) => number) =>
    STATS.map((_, i) => pt(i, v(i)).map((c) => c.toFixed(1)).join(',')).join(' ')

  return (
    <svg className="radar" viewBox="-160 -132 320 264" role="img" aria-label="Ability ratings out of five">
      {[1, 2, 3, 4, 5].map((ring) => (
        <polygon key={ring} points={poly(() => ring)} className="radar-ring" />
      ))}
      {STATS.map((_, i) => {
        const [x, y] = pt(i, 5)
        return <line key={i} x1={0} y1={0} x2={x} y2={y} className="radar-ring" />
      })}
      <polygon points={poly((i) => STATS[i].value)} className="radar-shape" />
      {STATS.map((s, i) => {
        const [x, y] = pt(i, s.value)
        const [lx, ly] = pt(i, 6.15)
        return (
          <g key={s.label}>
            <circle cx={x} cy={y} r={2.6} className="radar-dot" />
            <text x={lx} y={ly - 3} className="radar-label">
              {s.label}
            </text>
            <text x={lx} y={ly + 9} className="radar-value">
              {s.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function Profile() {
  return (
    <section id="profile" className="section right" data-station>
      <article className="panel" data-ui>
        <header className="panel-head">
          <span className="kanji" lang="ja">
            忍
          </span>
          <div>
            <p className="eyebrow">01 — The Shinobi</p>
            <h2>Forged in the Leaf</h2>
          </div>
        </header>
        <p>
          The forehead protector is the first thing he ever earned. Iruka tied his own around the boy’s head the night
          he graduated — and Naruto has worn the crest of the Hidden Leaf into every battle since.
        </p>
        <dl className="facts">
          {PROFILE.map((p) => (
            <div key={p.k}>
              <dt>{p.k}</dt>
              <dd>{p.v}</dd>
            </div>
          ))}
        </dl>
        <figure className="radar-wrap">
          <Radar />
          <figcaption>Ability ratings from the third official databook, scored out of five.</figcaption>
        </figure>
      </article>
    </section>
  )
}
