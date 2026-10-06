export function Hero() {
  return (
    <section id="origin" className="section hero" data-station>
      <p className="vertical" lang="ja" aria-hidden="true">
        うずまきナルト
      </p>
      <div className="hero-copy">
        <p className="eyebrow">
          <span lang="ja">七代目火影</span> — The Seventh Hokage of the Hidden Leaf
        </p>
        <h1>
          <span>Naruto</span>
          <span className="outline">Uzumaki</span>
        </h1>
        <p className="lede">
          An orphan nobody would look at. A promise nobody believed. This is the story of the boy who carried a demon,
          refused to give up on anyone — and became the shadow that protects the Leaf.
        </p>
      </div>
      <div className="hero-foot">
        <span className="hint">
          <i className="mouse" /> Scroll to begin
        </span>
        <span className="hint">Hold Naruto to charge the Rasengan · drag to turn him</span>
      </div>
    </section>
  )
}
