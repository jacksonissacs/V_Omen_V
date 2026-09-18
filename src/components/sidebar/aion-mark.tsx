import Image from "next/image"

/**
 * Workspace brand mark. Renders the supplied silver OMEN symbol unchanged
 * (`public/brand/omen-symbol-64.png`, from the approved logo pack).
 * The component keeps its historical name to avoid an internal rename.
 */
export function AionMark() {
  return (
    <Image
      className="aion-logo-mark"
      src="/brand/omen-symbol-64.png"
      alt=""
      width={18}
      height={18}
      unoptimized
      priority
    />
  )
}
