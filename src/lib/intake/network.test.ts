/** @vitest-environment node */

import { describe, expect, it } from "vitest"

import { CISA_KEV } from "./source"
import {
  SourceRequestError,
  assertAllowlistedUrl,
  getSourceDocument,
  isBlockedAddress,
  type SourceFetch,
  type SourceResponse,
} from "./network"

function stream(body: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(body)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

function http(status: number, body = "", headers: Record<string, string> = {}): SourceResponse {
  return { status, headers: new Headers(headers), body: stream(body) }
}

const publicLookup = async () => [{ address: "1.1.1.1", family: 4 }]

describe("private-network and allowlist guards", () => {
  it("blocks loopback, private, link-local, and documentation addresses", () => {
    for (const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.2.1",
      "192.168.1.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true)
    }
    expect(isBlockedAddress("1.1.1.1")).toBe(false)
    expect(isBlockedAddress("172.32.0.1")).toBe(false)
    expect(isBlockedAddress("8.8.8.8")).toBe(false)
  })

  it("refuses URLs that are not the allowlisted catalog document", () => {
    expect(assertAllowlistedUrl(CISA_KEV.documentUrl).href).toBe(CISA_KEV.documentUrl)
    for (const raw of [
      "http://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "https://127.0.0.1/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "https://www.cisa.gov/other.json",
      "https://evil.example/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "https://user:pass@www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "https://www.cisa.gov:444/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "https://localhost/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      "not a url",
    ]) {
      expect(() => assertAllowlistedUrl(raw), raw).toThrow(SourceRequestError)
    }
  })

  it("does not connect when the allowlisted host resolves to a private address", async () => {
    const fetchImpl: SourceFetch = async () => {
      throw new Error("fetch should not be called")
    }
    await expect(
      getSourceDocument({
        fetchImpl,
        lookup: async () => [{ address: "169.254.169.254", family: 4 }],
        sleep: async () => undefined,
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ kind: "blocked_target" })
  })

  it("follows a same-document redirect and refuses a redirect off the allowlist", async () => {
    const seen: string[] = []
    const fetchImpl: SourceFetch = async (url) => {
      seen.push(url)
      if (seen.length === 1) {
        return http(302, "", { location: CISA_KEV.pathname })
      }
      return http(200, '{"vulnerabilities":[]}')
    }
    const ok = await getSourceDocument({ fetchImpl, lookup: publicLookup, sleep: async () => undefined, maxRetries: 0 })
    expect(ok.body).toContain("vulnerabilities")
    expect(seen).toEqual([CISA_KEV.documentUrl, CISA_KEV.documentUrl])

    const blocked: SourceFetch = async () => http(302, "", { location: "https://127.0.0.1/secret" })
    await expect(
      getSourceDocument({ fetchImpl: blocked, lookup: publicLookup, sleep: async () => undefined, maxRetries: 0 }),
    ).rejects.toMatchObject({ kind: "blocked_target" })
  })

  it("stops after the redirect cap and does not retry a rate limit or an oversized body", async () => {
    let redirects = 0
    const alwaysRedirect: SourceFetch = async () => {
      redirects += 1
      return http(302, "", { location: CISA_KEV.pathname })
    }
    await expect(
      getSourceDocument({ fetchImpl: alwaysRedirect, lookup: publicLookup, sleep: async () => undefined, maxRetries: 0, maxRedirects: 2 }),
    ).rejects.toMatchObject({ kind: "unavailable" })
    expect(redirects).toBe(3)

    let limited = 0
    const rateLimited: SourceFetch = async () => {
      limited += 1
      return http(429, "slow down")
    }
    await expect(
      getSourceDocument({ fetchImpl: rateLimited, lookup: publicLookup, sleep: async () => undefined, maxRetries: 2 }),
    ).rejects.toMatchObject({ kind: "rate_limited", status: 429 })
    expect(limited).toBe(1)

    const oversized: SourceFetch = async () => http(200, "small", { "content-length": "99999999" })
    await expect(
      getSourceDocument({ fetchImpl: oversized, lookup: publicLookup, sleep: async () => undefined, maxRetries: 2, maxBytes: 100 }),
    ).rejects.toMatchObject({ kind: "too_large" })
  })

  it("does not retry a missing document or a body that exceeds the cap while it is read", async () => {
    let missing = 0
    const notFound: SourceFetch = async () => {
      missing += 1
      return http(404, "missing")
    }
    await expect(
      getSourceDocument({ fetchImpl: notFound, lookup: publicLookup, sleep: async () => undefined, maxRetries: 2 }),
    ).rejects.toMatchObject({ kind: "unavailable", status: 404 })
    expect(missing).toBe(1)

    let oversized = 0
    const growing: SourceFetch = async () => {
      oversized += 1
      return {
        status: 200,
        headers: new Headers(),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(50))
            controller.enqueue(new Uint8Array(50))
            controller.close()
          },
        }),
      }
    }
    await expect(
      getSourceDocument({ fetchImpl: growing, lookup: publicLookup, sleep: async () => undefined, maxRetries: 2, maxBytes: 60 }),
    ).rejects.toMatchObject({ kind: "too_large" })
    expect(oversized).toBe(1)
  })

  it("retries a transient failure and then returns the document", async () => {
    const sleeps: number[] = []
    let calls = 0
    const fetchImpl: SourceFetch = async (_url, init) => {
      expect(init.headers["User-Agent"]).toBe(CISA_KEV.userAgent)
      expect(init.redirect).toBe("manual")
      expect(init.signal).toBeInstanceOf(AbortSignal)
      calls += 1
      if (calls < 3) return http(503, "unavailable")
      return http(200, '{"ok":true}')
    }
    const result = await getSourceDocument({
      fetchImpl,
      lookup: publicLookup,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      maxRetries: 2,
    })
    expect(result.requests).toBe(3)
    expect(result.body).toBe('{"ok":true}')
    expect(sleeps).toEqual([250, 500])
  })
})
