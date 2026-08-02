import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

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
  /** Mark pixel size hint for layout. */
  size?: "sm" | "md" | "lg"
}

const sizeClass = {
  sm: "size-8",
  md: "size-9 sm:size-[2.45rem]",
  lg: "size-12",
} as const

export function BrandMark({
  className,
  size = "md",
  priority = false,
  markOnly = false,
}: Pick<BrandLogoProps, "className" | "size" | "priority" | "markOnly">) {
  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[0.72rem]",
        "bg-black ring-1 ring-white/12",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_6px_18px_rgba(0,0,0,0.35)]",
        markOnly ? "size-10" : sizeClass[size],
        className,
      )}
    >
      <Image
        src={BRAND_MARK_SRC}
        alt=""
        width={80}
        height={80}
        priority={priority}
        sizes="48px"
        className="size-full object-cover"
      />
    </span>
  )
}

export function BrandLogo({
  className,
  inverted = false,
  markOnly = false,
  tagline,
  href = "/",
  priority = true,
  size = "md",
}: BrandLogoProps) {
  const content = (
    <>
      <BrandMark
        size={size}
        priority={priority}
        markOnly={markOnly}
        className={cn(
          "transition duration-300",
          "group-hover:ring-violet-400/45 group-hover:shadow-[0_0_20px_rgba(167,139,250,0.35)]",
        )}
      />

      {!markOnly ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className={cn(
              "text-[1.15rem] font-black tracking-[-0.045em] sm:text-[1.25rem]",
              inverted ? "text-white" : "text-zinc-950",
            )}
          >
            Tokepass
          </span>
          {tagline ? (
            <span
              className={cn(
                "mt-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                inverted ? "text-violet-300" : "text-violet-600",
              )}
            >
              {tagline}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  )

  if (href === null) {
    return (
      <span
        className={cn(
          "group inline-flex items-center gap-2.5",
          inverted ? "text-white" : "text-zinc-950",
          className,
        )}
      >
        {content}
      </span>
    )
  }

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5",
        inverted ? "text-white" : "text-zinc-950",
        className,
      )}
      aria-label="Tokepass — Inicio"
    >
      {content}
    </Link>
  )
}
