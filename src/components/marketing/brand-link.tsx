import Image from "next/image"
import Link from "next/link"

interface BrandLinkProps {
  /** `brand` = top bar (30px), `footer-brand` = footer (76px). */
  variant: "brand" | "footer-brand"
}

/**
 * OMEN symbol + wordmark. The symbol is the supplied silver asset, unchanged
 * (`public/brand/omen-symbol-256.png`, served as-is via `unoptimized`); it is
 * sized by height only with `object-fit: contain`, never stretched or recoloured.
 * Marketing branding always links to the public landing at `/`.
 */
export function BrandLink({ variant }: BrandLinkProps) {
  return (
    <Link className={variant} href="/" aria-label="OMEN home">
      <Image src="/brand/omen-symbol-256.png" alt="" width={256} height={256} unoptimized priority={variant === "brand"} />
      <span className="wordmark">OMEN</span>
    </Link>
  )
}
