import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

import { FOLLOWING_STORAGE_KEY } from "@/lib/following-storage"

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }),
  })
}

afterEach(() => {
  cleanup()
  try {
    window.localStorage.removeItem(FOLLOWING_STORAGE_KEY)
  } catch {
    /* storage may be unavailable in some test environments */
  }
})
