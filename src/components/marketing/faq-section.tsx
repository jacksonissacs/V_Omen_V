const FAQ = [
  {
    q: "Who is OMEN for?",
    a: "Analysts, researchers, journalists and forecasters who need to know not just what a probability is, but what it was, when it changed, and what changed it.",
  },
  {
    q: "Where do the probabilities come from?",
    a: "From the markets and forecast sources OMEN follows. Each source's tier and reliability are shown next to the data it contributes. The demo on this page does not use live sources.",
  },
  {
    q: "What does \u201cexplained 69%\u201d actually mean?",
    a: "Comparable past events in this market account, on average, for about that share of a move this size. The remaining 31% is left unexplained rather than assigned to the nearest headline.",
  },
  {
    q: "Can I trust a rewound view?",
    a: "A rewound view only contains observations that were recorded before the chosen moment. It is never rebuilt from later data. What it cannot contain is information OMEN had not yet observed at that time.",
  },
  {
    q: "Is there an API?",
    a: "Not yet. Programmatic access is part of the product plan. The demo workspace includes a small read-only JSON view of the same illustrative catalog; nothing in it is a live feed.",
  },
  {
    q: "How do I get access?",
    a: "There is no signup yet. The workspace is open as a demo with illustrative data: use any \u201cExplore the demo\u201d button to open it. Every figure in it is reproducible fixture data, not a live feed.",
  },
] as const

export function FaqSection() {
  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="wrap">
        <div className="section-head">
          <h2 id="faq-title">Questions</h2>
        </div>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <span className="plus" aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
