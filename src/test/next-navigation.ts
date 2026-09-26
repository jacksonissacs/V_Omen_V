import { vi } from "vitest"

export const mockPush = vi.fn()
export const mockReplace = vi.fn()
export const mockPathname = vi.fn(() => "/")
export const mockSearchParams = vi.fn(() => new URLSearchParams())

export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND")
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
  notFound: () => {
    throw new NotFoundError()
  },
}))

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}))
