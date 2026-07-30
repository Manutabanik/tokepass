import Link from "next/link"

import { cn } from "@/lib/utils"

interface BrandLogoProps {
  className?: string
  inverted?: boolean
}

export function BrandLogo({ className, inverted = false }: BrandLogoProps) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 text-lg font-black tracking-tight",
        inverted ? "text-white" : "text-zinc-950",
        className,
      )}
      aria-label="Tokepass — Inicio"
    >
      <span className="grid size-8 place-items-center rounded-xl bg-violet-600 text-sm text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]">
        T
      </span>
      Tokepass
    </Link>
  )
}
