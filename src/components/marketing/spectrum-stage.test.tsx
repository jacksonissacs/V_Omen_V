import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SpectrumStage } from "@/components/marketing/spectrum-stage"

/* ---------- canvas + browser API stubs ---------- */

function fakeContext() {
  return {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  } as unknown as CanvasRenderingContext2D
}

type Listener = (event: { matches: boolean }) => void

let mediaListeners: Listener[] = []
let mediaMatches = false
let rafCallbacks = new Map<number, FrameRequestCallback>()
let rafId = 0
let cancelSpy: ReturnType<typeof vi.fn>
let resizeDisconnect: ReturnType<typeof vi.fn>
let intersectionDisconnect: ReturnType<typeof vi.fn>
let intersectionCallback: IntersectionObserverCallback | null = null
let hidden = false

function installBrowserStubs(withCanvas: boolean) {
  mediaListeners = []
  rafCallbacks = new Map()
  rafId = 0
  hidden = false
  cancelSpy = vi.fn((id: number) => {
    rafCallbacks.delete(id)
  })
  resizeDisconnect = vi.fn()
  intersectionDisconnect = vi.fn()
  intersectionCallback = null

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => (withCanvas ? fakeContext() : null) as unknown as RenderingContext,
  )
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 120,
    height: 60,
    top: 0,
    left: 0,
    right: 120,
    bottom: 60,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      rafId += 1
      rafCallbacks.set(rafId, cb)
      return rafId
    }),
  )
  vi.stubGlobal("cancelAnimationFrame", cancelSpy)
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: mediaMatches,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: (_: string, listener: Listener) => mediaListeners.push(listener),
      removeEventListener: (_: string, listener: Listener) => {
        mediaListeners = mediaListeners.filter((l) => l !== listener)
      },
    })),
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn()
      disconnect = resizeDisconnect
      unobserve = vi.fn()
    },
  )
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        intersectionCallback = cb
      }
      observe = vi.fn()
      disconnect = intersectionDisconnect
      unobserve = vi.fn()
      takeRecords = () => []
    },
  )
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
}

function runFrame(now: number) {
  const pending = [...rafCallbacks.entries()]
  rafCallbacks.clear()
  for (const [, cb] of pending) cb(now)
}

beforeEach(() => {
  mediaMatches = false
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/* ---------- tests ---------- */

describe("SpectrumStage", () => {
  it("starts one animation loop and tears everything down on unmount", () => {
    installBrowserStubs(true)
    const { unmount } = render(<SpectrumStage label="Decorative spectrum" staticTime={1.7} />)

    expect(screen.getByRole("img", { name: "Decorative spectrum" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /pause motion/i })).toHaveAttribute("aria-pressed", "false")
    expect(rafCallbacks.size).toBe(1)

    // Frames keep exactly one request in flight.
    act(() => runFrame(40))
    expect(rafCallbacks.size).toBe(1)

    unmount()
    expect(cancelSpy).toHaveBeenCalled()
    expect(rafCallbacks.size).toBe(0)
    expect(resizeDisconnect).toHaveBeenCalledTimes(1)
    expect(intersectionDisconnect).toHaveBeenCalledTimes(1)
    expect(mediaListeners).toHaveLength(0)

    // A late frame after unmount must not restart the loop.
    act(() => runFrame(80))
    expect(rafCallbacks.size).toBe(0)
  })

  it("pauses and resumes from the control, and keeps a manual pause across visibility changes", async () => {
    installBrowserStubs(true)
    const user = userEvent.setup()
    render(<SpectrumStage label="Decorative spectrum" staticTime={1.7} />)
    const toggle = screen.getByRole("button", { name: /pause motion/i })

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(toggle).toHaveTextContent("Play motion")
    expect(rafCallbacks.size).toBe(0)

    // Tab hidden then visible again: still paused, no loop restarted.
    hidden = true
    act(() => {
      fireEvent(document, new Event("visibilitychange"))
    })
    hidden = false
    act(() => {
      fireEvent(document, new Event("visibilitychange"))
    })
    expect(rafCallbacks.size).toBe(0)
    expect(toggle).toHaveAttribute("aria-pressed", "true")

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    expect(rafCallbacks.size).toBe(1)
  })

  it("does not restart the loop while the document is hidden", () => {
    installBrowserStubs(true)
    render(<SpectrumStage label="Decorative spectrum" staticTime={1.7} />)
    expect(rafCallbacks.size).toBe(1)

    hidden = true
    act(() => {
      fireEvent(document, new Event("visibilitychange"))
    })
    expect(rafCallbacks.size).toBe(0)

    // Intersection while hidden must not start a frame.
    act(() => {
      intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(rafCallbacks.size).toBe(0)

    hidden = false
    act(() => {
      fireEvent(document, new Event("visibilitychange"))
    })
    expect(rafCallbacks.size).toBe(1)
  })

  it("honours reduced motion at mount and when the preference changes", async () => {
    mediaMatches = true
    installBrowserStubs(true)
    const user = userEvent.setup()
    render(<SpectrumStage label="Decorative spectrum" staticTime={1.7} />)

    const toggle = screen.getByRole("button", { name: /play motion/i })
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("note")).toHaveTextContent(/prefers reduced motion/i)
    expect(rafCallbacks.size).toBe(0)

    // Opt in: motion is allowed, the note goes away.
    await user.click(toggle)
    expect(rafCallbacks.size).toBe(1)
    expect(screen.queryByRole("note")).not.toBeInTheDocument()

    // Preference flips back to reduce while running: stop and show the still frame.
    act(() => {
      for (const listener of mediaListeners) listener({ matches: true })
    })
    expect(rafCallbacks.size).toBe(0)
    expect(screen.getByRole("button", { name: /play motion/i })).toHaveAttribute("aria-pressed", "true")

    // Preference lifted: motion resumes by default.
    act(() => {
      for (const listener of mediaListeners) listener({ matches: false })
    })
    expect(rafCallbacks.size).toBe(1)
    expect(screen.getByRole("button", { name: /pause motion/i })).toHaveAttribute("aria-pressed", "false")
  })

  it("renders a static fallback when Canvas 2D is unavailable", () => {
    installBrowserStubs(false)
    render(<SpectrumStage label="Decorative spectrum" staticTime={1.7} />)
    expect(screen.getByRole("img", { name: "Decorative spectrum" })).toBeInTheDocument()
    expect(document.querySelector(".spectrum-fallback")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(rafCallbacks.size).toBe(0)
  })
})
