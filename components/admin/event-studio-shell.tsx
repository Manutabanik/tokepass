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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
        <Link
          href={backHref}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
        <div className="min-w-0 flex-1 overflow-x-hidden">{stepper}</div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">{status}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen(true)}
            className="h-8 gap-1.5"
          >
            <Smartphone className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Vista previa</span>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="mx-auto w-full max-w-4xl space-y-8">
          {banner}
          <div className="sm:hidden">{status}</div>
          {children}
        </div>
      </div>

      <footer className="sticky bottom-0 z-20 shrink-0 border-t border-border bg-card/80 p-4 backdrop-blur-md">
        <div className="mx-auto w-full max-w-4xl pb-[max(0px,env(safe-area-inset-bottom))]">
          {dock}
        </div>
      </footer>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[min(92dvh,100dvh)] flex-col bg-zinc-950 p-0"
        >
          <SheetHeader>
            <SheetTitle>Vista previa</SheetTitle>
            <SheetDescription>
              Asi se ve el evento en el celular.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-6">
            {preview}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
