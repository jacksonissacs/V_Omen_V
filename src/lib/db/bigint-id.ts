/** PostgreSQL int8 upper bound. JSON numbers are not safe this far. */
export const INT8_MAX = BigInt("9223372036854775807")

/**
 * Preserves a PostgreSQL bigint as a decimal string.
 * `Number` cannot represent every int8, so callers must not narrow one first.
 */
export function databaseBigintText(value: string | number | bigint): string {
  if (typeof value === "bigint") {
    if (value < BigInt(0) || value > INT8_MAX) {
      throw new Error("Database bigint identifier is outside int8.")
    }
    return value.toString()
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Refusing to narrow an unsafe number to a database bigint identifier.")
    }
    return String(value)
  }
  if (!/^(?:0|[1-9]\d{0,18})$/.test(value) || BigInt(value) > INT8_MAX) {
    throw new Error("Database bigint identifier is not a decimal int8 string.")
  }
  return value
}

/** Positive int8 text with no leading zero. Checkpoint and row keys use this form. */
export function isPositiveInt8Text(value: string): boolean {
  if (!/^[1-9]\d{0,18}$/.test(value)) return false
  return BigInt(value) <= INT8_MAX
}
