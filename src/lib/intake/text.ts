/**
 * Source text is untrusted data. These helpers turn it into plain text for
 * the review queue. They do not evaluate it, follow links in it, or treat it
 * as operator instructions.
 */

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi
const TAG = /<\/?[a-zA-Z][a-zA-Z0-9:-]*(\s[^<>]*)?>/g
const ENTITY = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g
const CONTROLS = /[\u0000-\u001F\u007F]/g
const BIDI_AND_INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

function safeCodePoint(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return ""
  if (code >= 0xd800 && code <= 0xdfff) return ""
  return String.fromCodePoint(code)
}

function decodeEntities(value: string): string {
  return value.replace(ENTITY, (_entity, token: string) => {
    if (token === "amp") return "&"
    if (token === "lt") return "<"
    if (token === "gt") return ">"
    if (token === "quot") return '"'
    if (token === "apos") return "'"
    if (token === "nbsp") return " "
    if (token.startsWith("#x")) return safeCodePoint(Number.parseInt(token.slice(2), 16))
    return safeCodePoint(Number.parseInt(token.slice(1), 10))
  })
}

/** Strip markup and control characters, then keep at most `maxLength` characters. */
export function sanitizeUntrustedText(input: string, maxLength: number): string {
  const withoutBlocks = input.replace(SCRIPT_OR_STYLE, " ")
  const withoutTags = withoutBlocks.replace(TAG, " ")
  const decoded = decodeEntities(withoutTags)
  return decoded
    .replace(BIDI_AND_INVISIBLE, "")
    .replace(CONTROLS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}
