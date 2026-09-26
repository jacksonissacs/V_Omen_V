import { describe, expect, it } from "vitest"

import { databaseBigintText, isPositiveInt8Text } from "@/lib/db/bigint-id"

const UNSAFE = "9007199254740993"

describe("database bigint identifiers", () => {
  it("keeps values past Number.MAX_SAFE_INTEGER as exact decimal text", () => {
    expect(databaseBigintText(UNSAFE)).toBe(UNSAFE)
    expect(databaseBigintText(BigInt(UNSAFE))).toBe(UNSAFE)
    expect(JSON.parse(JSON.stringify({ id: databaseBigintText(UNSAFE) }))).toEqual({ id: UNSAFE })
    expect(String(Number(UNSAFE))).not.toBe(UNSAFE)
    expect(() => databaseBigintText(Number(UNSAFE))).toThrow(/unsafe number/)
  })

  it("accepts only a positive decimal int8 as a checkpoint id", () => {
    expect(isPositiveInt8Text("1")).toBe(true)
    expect(isPositiveInt8Text(UNSAFE)).toBe(true)
    expect(isPositiveInt8Text("9223372036854775807")).toBe(true)
    expect(isPositiveInt8Text("9223372036854775808")).toBe(false)
    expect(isPositiveInt8Text("0")).toBe(false)
    expect(isPositiveInt8Text("01")).toBe(false)
    expect(isPositiveInt8Text("11111111-1111-4111-8111-111111111111")).toBe(false)
    expect(isPositiveInt8Text("1e2")).toBe(false)
  })
})
