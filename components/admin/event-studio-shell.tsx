"use client"

import { ArrowLeft, Smartphone } from "lucide-react"
import Link from "next/link"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export function EventStudioShell({
  backHref,
  backLabel,
  stepper,
  status,
  banner,
  preview,
  dock,
  children,
}: {
  backHref: string
  backLabel: string
  stepper: ReactNode
  status: ReactNode
  banner?: ReactNode
  preview: ReactNode
  dock: ReactNode
  children: ReactNode
}) {
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <div className="flex h-full min-w-0 flex-1 flex-col border-r border-border/60 bg-card/30 lg:max-w-[480px] xl:max-w-[560px]">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <Link
            href={backHref}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
          {stepper}
          <div className="hidden shrink-0 sm:block">{status}</div>
        </header>
        {banner ? <div className="shrink-0 px-4 pt-3">{banner}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>
        <div className="shrink-0 border-t border-border bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mb-3 sm:hidden">{status}</div>
          {dock}
        </div>
      </div>

      <div className="relative hidden h-full flex-1 items-center justify-center overflow-hidden bg-slate-950/60 p-6 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.16),transparent_48%)]"
          aria-hidden="true"
        />
        <div className="relative z-10">{preview}</div>
      </div>

      <Button
        type="button"
        size="icon"
        onClick={() => setPreviewOpen(true)}
        className="fixed right-4 z-40 size-12 rounded-full bg-zinc-900 text-white shadow-lg lg:hidden"
        style={{
          bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
        }}
        aria-label="Ver vista previa"
      >
        <Smartphone className="size-5" />
      </Button>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[min(92dvh,100dvh)] flex-col bg-zinc-950 p-0 lg:hidden"
        >
          <SheetHeader>
            <SheetTitle>Vista previa</SheetTitle>
            <SheetDescription>
              Asi se ve el evento en el celular.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            {preview}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
