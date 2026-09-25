import { vi } from "vitest"

export const mockPush = vi.fn()
export const mockPathname = vi.fn(() => "/")

export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND")
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathname(),
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new NotFoundError()
  },
}))
