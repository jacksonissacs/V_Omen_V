import { readFileSync } from "node:fs"
import path from "node:path"

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import { ArchiveView } from "@/components/archive/archive-view"

const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/archive",
  useSearchParams: () =>
    new URLSearchParams("event=evt-boc-cut&cutoff=2026-08-17T14:35:00.000Z"),
}))
import { deriveArchiveInputFromEvent } from "@/lib/archive/derive-archive-input"
import { getEvent } from "@/data/events"
import { reconstructAt } from "@/lib/domain/historical-reconstruction"

const boc = getEvent("evt-boc-cut")!
const aug17 = reconstructAt(deriveArchiveInputFromEvent(boc), "2026-08-17T14:35:00.000Z")!

describe("Archive reconstruction UI", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          storage: "demo",
          provenance: "demo",
          reconstruction: aug17,
        }),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does not ship scripted probabilities or fixed record counts", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/archive/archive-view.tsx"),
      "utf8",
    )
    expect(source).not.toMatch(/58\.4 \+ position/)
    expect(source).not.toMatch(/Illustrative probabilities/)
    expect(source).not.toMatch(/1,204/)
    expect(source).not.toMatch(/scripted, not recorded/)
  })

  it("renders stored reconstruction and coverage copy", async () => {
    render(
      <ArchiveView
        events={[{ id: "evt-boc-cut", title: boc.title }]}
        storage="demo"
        provenance="demo"
        initialEventId="evt-boc-cut"
        initialCutoff="2026-08-17T14:35:00.000Z"
        initialReconstruction={aug17}
        initialStatus="ok"
      />,
    )

    expect(screen.getByTestId("archive-reconstruction")).toHaveTextContent(
      /reflects only information available then/,
    )
    expect(screen.getByTestId("archive-coverage")).toBeInTheDocument()
    expect(screen.getByTestId("archive-reconstruction")).toHaveTextContent("58.4%")
    expect(screen.queryByTestId("archive-demo-notice")).not.toBeInTheDocument()
  })

  it("supports Return to present", async () => {
    const user = userEvent.setup()
    render(
      <ArchiveView
        events={[{ id: "evt-boc-cut", title: boc.title }]}
        storage="demo"
        provenance="demo"
        initialEventId="evt-boc-cut"
        initialCutoff="2026-08-17T14:35:00.000Z"
        initialReconstruction={aug17}
        initialStatus="ok"
      />,
    )

    await user.click(screen.getByRole("button", { name: "Return to present" }))
    expect(replace).toHaveBeenCalledWith("/archive?event=evt-boc-cut", { scroll: false })
  })
})
