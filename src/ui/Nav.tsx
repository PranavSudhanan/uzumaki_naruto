import { SECTIONS } from '../data/content'
import { scrolling, useStore, type Quality } from '../store'
import { audio } from '../audio'
import { Emblem } from './Emblem'

const QUALITY_LABEL = ['Lite', 'Balanced', 'Cinematic']

export function Nav() {
  const section = useStore((s) => s.section)
  const quality = useStore((s) => s.quality)
  const setQuality = useStore((s) => s.setQuality)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const sound = useStore((s) => s.sound)
  const setSound = useStore((s) => s.setSound)
  const dojo = view === 'dojo'

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: scrolling() })
  const home = () => {
    if (dojo) setView('journey')
    else go('origin')
  }
  const toggleSound = () => {
    audio.setEnabled(!sound)
    setSound(!sound)
    if (!sound) audio.tick(true)
  }

  return (
    <>
      <header className="nav" data-ui>
        <button className="brand" onClick={home} aria-label={dojo ? 'Back to the story' : 'Back to the top'}>
          <Emblem className="brand-mark" />
          <span>
            Uzumaki <b>Naruto</b>
          </span>
        </button>

        {dojo ? (
          <nav className="nav-links" aria-label="Pages">
            <button onClick={() => setView('journey')}>← The story</button>
            <button className="active" aria-current="page">
              Jutsu
            </button>
          </nav>
        ) : (
          <nav className="nav-links" aria-label="Sections">
            {SECTIONS.map((s, i) => (
              <button key={s.id} className={i === section ? 'active' : ''} aria-current={i === section ? 'true' : undefined} onClick={() => go(s.id)}>
                {s.label}
              </button>
            ))}
          </nav>
        )}

        {dojo ? (
          <button className="nav-cta nav-back" onClick={() => setView('journey')}>
            ← Story
          </button>
        ) : (
          <button className="nav-cta" onClick={() => setView('dojo')}>
            Jutsu page <span aria-hidden="true">↗</span>
          </button>
        )}
        <button className="quality" onClick={toggleSound} title="Sound effects" aria-pressed={sound}>
          <i data-level={sound ? 2 : 0} />
          {sound ? 'Sound on' : 'Sound off'}
        </button>
        <button
          className="quality"
          onClick={() => setQuality(((quality + 2) % 3) as Quality)}
          title="Rendering quality — click to change"
        >
          <i data-level={quality} />
          {QUALITY_LABEL[quality]}
        </button>
      </header>

      {dojo ? null : (
        <ol className="rail" data-ui aria-hidden="true">
          {SECTIONS.map((s, i) => (
            <li key={s.id} className={i === section ? 'active' : ''} onClick={() => go(s.id)}>
              <span lang="ja">{s.kanji}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
