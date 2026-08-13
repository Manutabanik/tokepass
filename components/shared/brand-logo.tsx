import Link from "next/link"

import { cn } from "@/lib/utils"

/** Public PNG fallback for favicons / PWA / plain <img> contexts. */
export const BRAND_MARK_SRC = "/brand/tokepass-mark.png"

interface BrandLogoProps {
  className?: string
  /** Dark UI surfaces (admin sidebar / dark header). */
  inverted?: boolean
  /** Hide the Tokepass wordmark (icon-only). */
  markOnly?: boolean
  /** Optional secondary line under the wordmark. */
  tagline?: string
  /** Link destination. Pass `null` to render a non-link mark. */
  href?: string | null
  /** Prefer true in primary headers. */
  priority?: boolean
  /** Mark size. `header` is the large public-navbar treatment. */
  size?: "sm" | "md" | "lg" | "header"
}

const sizeClass = {
  sm: "size-8",
  md: "size-9 sm:size-10",
  lg: "size-12",
  header: "size-11 sm:size-12 lg:size-[3.25rem]",
} as const

/**
 * Crisp vector mark — black tile, rounded white T, violet capsule.
 * Clear gap between stem and capsule (matches the brand PNG).
 */
export function BrandMarkSvg({
  className,
  title,
}: {
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 128 128"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className={cn("block size-full", className)}
    >
      {title ? <title>{title}</title> : null}
      <rect width="128" height="128" rx="28" fill="#050505" />
      {/* Top bar of the T */}
      <rect x="24" y="28" width="80" height="22" rx="11" fill="#ffffff" />
      {/* Stem — ends at y=82 */}
      <rect x="53" y="40" width="22" height="42" rx="11" fill="#ffffff" />
      {/* Violet capsule — gap below stem, padding above tile edge */}
      <rect x="50" y="92" width="28" height="12" rx="6" fill="#A78BFA" />
    </svg>
  )
}

export function BrandMark({
  className,
  size = "md",
  markOnly = false,
}: Pick<BrandLogoProps, "className" | "size" | "markOnly">) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[0.9rem]",
        "bg-[#050505] ring-1 ring-white/15",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_10px_28px_rgba(0,0,0,0.45)]",
        markOnly ? "size-10" : sizeClass[size],
        className,
      )}
    >
      <BrandMarkSvg className="size-full" />
    </span>
  )
}

export function BrandLogo({
  className,
  inverted = false,
  markOnly = false,
  tagline,
  href = "/",
  size = "md",
}: BrandLogoProps) {
  const isHeader = size === "header"

  const content = (
    <>
      <BrandMark
        size={size}
        markOnly={markOnly}
        className={cn(
          "transition duration-300",
          "group-hover:ring-violet-400/50 group-hover:shadow-[0_0_28px_rgba(167,139,250,0.45)]",
          isHeader && "rounded-[1rem] sm:rounded-[1.1rem]",
        )}
      />

      {!markOnly ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className={cn(
              "font-black tracking-[-0.045em]",
              isHeader
                ? "text-[1.35rem] sm:text-[1.55rem] lg:text-[1.7rem]"
                : "text-[1.15rem] sm:text-[1.25rem]",
              inverted ? "text-zinc-950 dark:text-white" : "text-zinc-950 dark:text-white",
            )}
          >
            Tokepass
          </span>
          {tagline ? (
            <span
              className={cn(
                "mt-1 font-semibold uppercase tracking-[0.18em]",
                isHeader ? "text-[11px]" : "text-[10px]",
                inverted
                  ? "text-violet-600 dark:text-violet-300"
                  : "text-violet-600 dark:text-violet-300",
              )}
            >
              {tagline}
            </span>
          ) : (
            isHeader && (
              <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-600/90 dark:text-violet-300/90 sm:text-[11px]">
                Boletería digital
              </span>
            )
          )}
        </span>
      ) : null}
    </>
  )

  const shellClass = cn(
    "group inline-flex items-center",
    isHeader ? "gap-3 sm:gap-3.5" : "gap-2.5",
    "text-zinc-950 dark:text-white",
    className,
  )

  if (href === null) {
    return <span className={shellClass}>{content}</span>
  }

  return (
    <Link href={href} className={shellClass} aria-label="Tokepass — Inicio">
      {content}
    </Link>
  )
}
