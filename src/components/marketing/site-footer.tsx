import { BrandLink } from "@/components/marketing/brand-link"
import { SpectrumStage } from "@/components/marketing/spectrum-stage"

const FOOTER_LINKS = [
  { href: "#pulse", label: "Pulse" },
  { href: "#archive", label: "Archive" },
  { href: "#ledger", label: "Ledger" },
  { href: "#methodology", label: "Methodology" },
]

/**
 * Reference-derived footer. The prototype's social slots, placeholder email and
 * Privacy / Terms links are intentionally omitted: no approved destinations exist
 * yet, and nothing is invented in their place.
 */
export function SiteFooter() {
  return (
    <footer className="spectrum-footer" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        OMEN footer
      </h2>
      <SpectrumStage
        label="Decorative spectrum of luminous vertical colour bands fading into black"
        staticTime={1.7}
      />
      <div className="spectrum-body">
        <div className="spectrum-row">
          <BrandLink variant="footer-brand" />
          <div className="footer-nav">
            <ul>
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
            <a className="back-top" href="#top">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              Back to top
            </a>
          </div>
        </div>
        <div className="spectrum-legal">
          <span>© 2026 OMEN. Demo data on this site is illustrative.</span>
        </div>
      </div>
    </footer>
  )
}
