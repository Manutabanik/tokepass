"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { BrandLogo, BrandMarkSvg } from "@/components/shared/brand-logo"
import { cn } from "@/lib/utils"

export const TOKEPASS_ERROR_TITLE = "Ocurrió un problema en esta sección"
export const TOKEPASS_ERROR_LEAD =
  "No te preocupes, el equipo técnico ya fue notificado. Podés reintentar o volver al panel principal."

export function TokepassErrorScreen({
  reset,
  homeHref = "/",
  homeLabel = "Ir al inicio",
  title = TOKEPASS_ERROR_TITLE,
  lead = TOKEPASS_ERROR_LEAD,
  resetLabel = "Reintentar cargar",
  standalone = false,
  icon,
  resetIcon,
}: {
  reset: () => void
  homeHref?: string
  homeLabel?: string
  title?: string
  lead?: string
  resetLabel?: string
  standalone?: boolean
  icon?: ReactNode
  resetIcon?: ReactNode
}) {
  const homeClassName = cn(
    "inline-flex min-h-12 items-center justify-center rounded-full border px-8 py-3 text-sm font-bold transition-colors",
    standalone
      ? "border-white/15 text-zinc-100 hover:bg-white/5"
      : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
  )

  return (
    <main
      className={cn(
        "relative isolate flex flex-col items-center justify-center px-4 text-center",
        standalone ? "min-h-screen bg-zinc-950 text-zinc-100" : "min-h-[80vh]",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(167,139,250,0.16),transparent_50%)]"
        aria-hidden
      />
      {standalone ? (
        <span className="inline-flex items-center gap-2.5">
          <span className="relative grid size-12 place-items-center overflow-hidden rounded-[0.9rem] bg-[#050505] ring-1 ring-white/15">
            <BrandMarkSvg className="size-full" />
          </span>
          <span className="font-black tracking-[-0.045em] text-white">
            TokePass
          </span>
        </span>
      ) : (
        <BrandLogo href={null} size="lg" />
      )}
      {icon ? <div className="mt-8">{icon}</div> : null}
      <h1
        className={cn(
          icon ? "mt-5" : "mt-8",
          "text-3xl font-black tracking-tight",
          standalone ? "text-white" : "text-foreground",
        )}
      >
        {title}
      </h1>
      <p
        className={cn(
          "mb-8 mt-4 max-w-md text-sm leading-6 sm:text-base",
          standalone ? "text-zinc-400" : "text-muted-foreground",
        )}
      >
        {lead}
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => reset()}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-white transition-colors",
            standalone
              ? "bg-violet-600 hover:bg-violet-500"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {resetIcon}
          {resetLabel}
        </button>
        {standalone ? (
          <a href={homeHref} className={homeClassName}>
            {homeLabel}
          </a>
        ) : (
          <Link href={homeHref} className={homeClassName}>
            {homeLabel}
          </Link>
        )}
      </div>
    </main>
  )
}
