import { MODELS } from '../data/content'
import { scrolling } from '../store'

/** Two registry entries can be the same sculpt at different detail levels; credit each source once. */
const CREDITS = Object.values(MODELS).filter((m, i, all) => all.findIndex((x) => x.source === m.source) === i)

export function Closing() {
  return (
    <section id="nindo" className="section closing" data-station>
      <div className="closing-copy" data-ui>
        <p className="eyebrow">
          <span lang="ja">忍道</span> — His ninja way
        </p>
        <h2>
          <span>He never went back</span>
          <span className="outline">on his word.</span>
        </h2>
        <p className="lede">
          Not talent, not birthright, not the power sealed inside him. What made Naruto Uzumaki the Seventh Hokage was a
          refusal to give up — on his dream, on his friends, or on the people who once turned away from him.
        </p>
        <button className="again" onClick={() => window.scrollTo({ top: 0, behavior: scrolling() })}>
          ↑ Walk the road again
        </button>
      </div>
      <footer className="credits" data-ui>
        <p>
          Unofficial, non-commercial fan tribute. Naruto and all related characters and marks belong to Masashi
          Kishimoto, Shueisha, TV Tokyo and Pierrot. The forehead protector, weapons, hat, chakra effects and lighting
          are generated procedurally in your browser.
        </p>
        <details>
          <summary>Character model credits</summary>
          <ul>
            {CREDITS.map((m) => (
              <li key={m.url}>
                <a href={m.source} target="_blank" rel="noreferrer">
                  “{m.title}”
                </a>{' '}
                by {m.author} — {m.license}
              </li>
            ))}
          </ul>
          <p>Models were compressed and re-lit for this page; all other rights remain with their authors.</p>
        </details>
      </footer>
    </section>
  )
}
