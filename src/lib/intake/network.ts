import { lookup as defaultLookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"

import { CISA_KEV, INTAKE_LIMITS } from "./source"
import type { IntakeFailureKind } from "./types"

export class SourceRequestError extends Error {
  constructor(
    readonly kind: IntakeFailureKind,
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message)
    this.name = "SourceRequestError"
  }
}

const BLOCKED = new BlockList()

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv4")
}

BLOCKED.addAddress("::", "ipv6")
BLOCKED.addAddress("::1", "ipv6")
BLOCKED.addSubnet("fc00::", 7, "ipv6")
BLOCKED.addSubnet("fe80::", 10, "ipv6")
BLOCKED.addSubnet("ff00::", 8, "ipv6")
BLOCKED.addSubnet("2001:db8::", 32, "ipv6")

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal", "metadata.internal"])

const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504])

export interface ResolvedAddress {
  address: string
  family: number
}

export type LookupFn = (hostname: string, options: { all: true; verbatim: true }) => Promise<ResolvedAddress[]>

export interface SourceResponse {
  status: number
  headers: { get(name: string): string | null }
  body: ReadableStream<Uint8Array> | null
}

export type SourceFetch = (
  url: string,
  init: { method: "GET"; headers: Record<string, string>; redirect: "manual"; signal: AbortSignal },
) => Promise<SourceResponse>

function ipv4FromMapped(address: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address)
  if (dotted && isIP(dotted[1]!) === 4) return dotted[1]!
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address)
  if (!hex) return null
  const high = Number.parseInt(hex[1]!, 16)
  const low = Number.parseInt(hex[2]!, 16)
  if (high > 0xffff || low > 0xffff) return null
  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`
}

export function isBlockedAddress(address: string): boolean {
  const mapped = ipv4FromMapped(address)
  const candidate = mapped ?? address
  const family = isIP(candidate)
  if (family === 4) return BLOCKED.check(candidate, "ipv4")
  if (family === 6) return BLOCKED.check(address, "ipv6")
  return true
}

export function assertAllowlistedUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SourceRequestError("blocked_target", "Refusing a source URL that is not on the allowlist.")
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    (url.port !== "" && url.port !== "443") ||
    url.search !== "" ||
    host !== CISA_KEV.host ||
    url.pathname !== CISA_KEV.pathname ||
    isIP(host) !== 0 ||
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".localhost")
  ) {
    throw new SourceRequestError("blocked_target", "Refusing a source URL that is not on the allowlist.")
  }
  return url
}

async function assertPublicHost(hostname: string, lookup: LookupFn): Promise<void> {
  let records: ResolvedAddress[]
  try {
    records = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new SourceRequestError("unavailable", `Could not resolve ${hostname}.`, undefined, true)
  }
  if (records.length === 0 || records.some((record) => isBlockedAddress(record.address))) {
    throw new SourceRequestError("blocked_target", `Refusing ${hostname}: it does not resolve to a public address.`)
  }
}

async function readBounded(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let cancel = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        cancel = true
        throw new SourceRequestError("too_large", `CISA KEV response exceeded ${maxBytes} bytes.`)
      }
      chunks.push(value)
    }
  } catch (error) {
    cancel = true
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    if (!cancel) reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function decodeBody(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

async function fetchAllowlisted(options: {
  fetchImpl: SourceFetch
  lookup: LookupFn
  timeoutMs: number
  maxBytes: number
  maxRedirects: number
}): Promise<{ status: number; body: Uint8Array; finalUrl: string }> {
  let current: string = CISA_KEV.documentUrl
  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    const url = assertAllowlistedUrl(current)
    await assertPublicHost(url.hostname, options.lookup)
    const response = await options.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "User-Agent": CISA_KEV.userAgent,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined)
      if (hop === options.maxRedirects) {
        throw new SourceRequestError("unavailable", "CISA KEV redirected too many times.", response.status)
      }
      const location = response.headers.get("location")
      if (!location) throw new SourceRequestError("unavailable", "CISA KEV redirect had no location.", response.status)
      current = new URL(location, url).toString()
      continue
    }
    const declared = Number(response.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      await response.body?.cancel().catch(() => undefined)
      throw new SourceRequestError("too_large", `CISA KEV response exceeded ${options.maxBytes} bytes.`)
    }
    const body = await readBounded(response.body, options.maxBytes)
    return { status: response.status, body, finalUrl: url.toString() }
  }
  throw new SourceRequestError("unavailable", "CISA KEV redirected too many times.")
}

export async function getSourceDocument(options: {
  fetchImpl?: SourceFetch
  lookup?: LookupFn
  sleep?: (ms: number) => Promise<void>
  timeoutMs?: number
  maxBytes?: number
  maxRetries?: number
  maxRedirects?: number
} = {}): Promise<{ body: string; requests: number; finalUrl: string }> {
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init))
  const lookup = options.lookup ?? ((hostname, lookupOptions) => defaultLookup(hostname, lookupOptions))
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const timeoutMs = options.timeoutMs ?? INTAKE_LIMITS.timeoutMs
  const maxBytes = options.maxBytes ?? INTAKE_LIMITS.maxBytes
  const maxRetries = options.maxRetries ?? INTAKE_LIMITS.maxRetries
  const maxRedirects = options.maxRedirects ?? INTAKE_LIMITS.maxRedirects

  let requests = 0
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      requests += 1
      const result = await fetchAllowlisted({ fetchImpl, lookup, timeoutMs, maxBytes, maxRedirects })
      if (result.status === 200) {
        return { body: decodeBody(result.body), requests, finalUrl: result.finalUrl }
      }
      if (result.status === 429) {
        throw new SourceRequestError("rate_limited", "CISA KEV returned HTTP 429. No further attempt was made.", 429)
      }
      if (!RETRYABLE_STATUS.has(result.status) || attempt === maxRetries) {
        throw new SourceRequestError(
          "unavailable",
          `CISA KEV returned HTTP ${result.status} after ${attempt + 1} attempt(s).`,
          result.status,
        )
      }
    } catch (error) {
      if (error instanceof SourceRequestError) {
        if (!error.retryable || attempt === maxRetries) throw error
      } else if (attempt === maxRetries) {
        throw new SourceRequestError("unavailable", `CISA KEV request failed after ${attempt + 1} attempt(s).`)
      }
    }
    await sleep(INTAKE_LIMITS.retryBaseMs * 2 ** attempt)
  }
  throw new SourceRequestError("unavailable", "CISA KEV request failed.")
}
