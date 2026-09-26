/** An http(s) URL that is safe to place in an anchor href. Other schemes are not links. */
export function navigableHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username || url.password) return null
  return url.toString()
}
