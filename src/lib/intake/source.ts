import { INTAKE_SOURCE_ID } from "./types"

/**
 * The only source this pipeline may request.
 *
 * CISA publishes the Known Exploited Vulnerabilities catalog as JSON and
 * distributes that database under CC0 1.0. Third-party URLs inside catalog
 * `notes` are not covered by that dedication. This adapter never reads them.
 * See docs/source-intake.md for what was checked and what we store.
 */
export const CISA_KEV = {
  id: INTAKE_SOURCE_ID,
  publisher: "Cybersecurity and Infrastructure Security Agency",
  documentUrl: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
  host: "www.cisa.gov",
  pathname: "/sites/default/files/feeds/known_exploited_vulnerabilities.json",
  license: "CC0-1.0",
  licenseUrl: "https://www.cisa.gov/sites/default/files/licenses/kev/license.txt",
  userAgent: "OMEN intake (local operator; non-production review queue)",
} as const

export const INTAKE_LIMITS = {
  timeoutMs: 10_000,
  maxBytes: 3_000_000,
  maxRetries: 2,
  maxRedirects: 2,
  minIntervalMs: 60_000,
  defaultItemLimit: 20,
  maxItemLimit: 40,
  excerptChars: 400,
  descriptionChars: 2_000,
  titleChars: 200,
  partyChars: 120,
  retryBaseMs: 250,
} as const

const CVE_ID = /^CVE-\d{4}-\d{4,19}$/

export function isCveId(value: string): boolean {
  return CVE_ID.test(value)
}

/** Item address inside the official catalog document. The fragment is the CVE id. */
export function kevItemUrl(cveId: string): string {
  if (!isCveId(cveId)) throw new Error(`Not a CVE id: ${cveId}`)
  return `${CISA_KEV.documentUrl}#${cveId}`
}
