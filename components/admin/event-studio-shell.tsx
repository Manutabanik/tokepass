"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

export function EventStudioShell({
  backHref,
  backLabel,
  eyebrow = "Datos del evento",
  title,
  subtitle,
  stepper,
  status,
  capacity,
  banner,
  dock,
  children,
}: {
  backHref: string
  backLabel: string
  eyebrow?: string
  title: string
  subtitle: string
  stepper: ReactNode
  status: ReactNode
  capacity?: ReactNode
  banner?: ReactNode
  preview?: ReactNode
  dock: ReactNode
  progress?: number
  children: ReactNode
}) {
  return (
    <div className="w-full flex-1 overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href={backHref}
            aria-label={backLabel}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>
        </div>

        {banner}

        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.18em] text-emerald-400 uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {capacity}
            {status}
          </div>
        </header>

        <div className="mb-8">{stepper}</div>

        <div className="min-w-0">{children}</div>

        <footer className="sticky bottom-0 z-40 mt-8 border-t border-border/40 bg-background/95 py-4 backdrop-blur-md">
          {dock}
        </footer>
      </div>
    </div>
  )
}
