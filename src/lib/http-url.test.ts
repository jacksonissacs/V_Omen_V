import { describe, expect, it } from "vitest"

import { navigableHttpUrl } from "@/lib/http-url"

describe("navigableHttpUrl", () => {
  it("keeps ordinary http and https source links", () => {
    expect(navigableHttpUrl("https://example.test/synthetic/agency-bulletin-2026")).toBe(
      "https://example.test/synthetic/agency-bulletin-2026",
    )
    expect(navigableHttpUrl("http://example.test/note")).toBe("http://example.test/note")
  })

  it("does not turn untrusted source text into a script or credentialed link", () => {
    expect(navigableHttpUrl("javascript:alert(1)")).toBeNull()
    expect(navigableHttpUrl("data:text/html,hi")).toBeNull()
    expect(navigableHttpUrl("https://user:secret@example.test/private")).toBeNull()
    expect(navigableHttpUrl("not a url")).toBeNull()
    expect(navigableHttpUrl(null)).toBeNull()
  })
})
